import { desc, eq } from "drizzle-orm";
import { ensureCustomDishesSchema, ensureOrdersSchema, getDb, getUploads } from "../../../db";
import { customDishes, orders } from "../../../db/schema";
import { chefApiGuard, isChefRequest } from "../../chef-auth";

type IngredientInput = {
  name?: unknown;
  amount?: unknown;
  unit?: unknown;
  type?: unknown;
};

const ingredientTypes = new Set(["生鲜", "蔬菜", "调料", "其他"]);
const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "服务暂时开小差了";
}

function normalizeIngredients(raw: string) {
  let parsed: IngredientInput[];
  try {
    parsed = JSON.parse(raw) as IngredientInput[];
  } catch {
    throw new Error("食材配方格式不正确");
  }
  const normalized = parsed.map((item) => ({
    name: typeof item.name === "string" ? item.name.trim().slice(0, 40) : "",
    amount: Number(item.amount),
    unit: typeof item.unit === "string" ? item.unit.trim().slice(0, 12) : "",
    type: typeof item.type === "string" && ingredientTypes.has(item.type) ? item.type : "其他",
  })).filter((item) => item.name && Number.isFinite(item.amount) && item.amount > 0 && item.unit);
  if (!normalized.length) throw new Error("请至少填写一种食材和用量");
  return normalized;
}

function safeNetworkImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function presentDish(row: typeof customDishes.$inferSelect) {
  const parseList = (value: string) => {
    try { return JSON.parse(value); } catch { return []; }
  };
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    flavor: row.flavor,
    minutes: row.minutes,
    baseServings: row.baseServings,
    imageUrl: row.imageUrl,
    ingredients: parseList(row.ingredients),
    steps: parseList(row.steps),
    source: row.source,
    active: Boolean(row.active),
    isCustom: true,
    emoji: "🍽️",
    tone: "custom",
    createdAt: row.createdAt,
  };
}

export async function GET(request: Request) {
  try {
    await ensureCustomDishesSchema();
    const rows = await getDb().select().from(customDishes).orderBy(desc(customDishes.createdAt));
    const fullAccess = isChefRequest(request);
    const presented = rows.map(presentDish);
    return Response.json({ dishes: fullAccess ? presented : presented.map((dish) => ({
      id: dish.id, name: dish.name, category: dish.category, description: dish.description,
      imageUrl: dish.imageUrl, active: dish.active, isCustom: true, emoji: dish.emoji, tone: dish.tone,
      flavor: "", minutes: 0, baseServings: 4, ingredients: [], steps: [], source: "",
    })) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim().slice(0, 40);
    const category = String(form.get("category") || "").trim().slice(0, 30);
    const description = String(form.get("description") || "").trim().slice(0, 180);
    const flavor = String(form.get("flavor") || "家常风味").trim().slice(0, 30);
    const minutes = Number(form.get("minutes"));
    const baseServings = Number(form.get("baseServings") || 4);
    const ingredients = normalizeIngredients(String(form.get("ingredients") || "[]"));
    const steps = String(form.get("steps") || "").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim().slice(0, 500)).filter(Boolean).slice(0, 30);
    const source = String(form.get("source") || "").trim().slice(0, 80);
    const imageFile = form.get("image");
    let imageUrl = safeNetworkImageUrl(String(form.get("imageUrl") || ""));

    if (!name) return Response.json({ error: "请填写菜名" }, { status: 400 });
    if (!category) return Response.json({ error: "请填写菜系分类" }, { status: 400 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) return Response.json({ error: "烹饪时间需为 5–360 分钟" }, { status: 400 });
    if (!Number.isInteger(baseServings) || baseServings < 1 || baseServings > 20) return Response.json({ error: "基础份量需为 1–20 人" }, { status: 400 });
    if (form.get("imageUrl") && !imageUrl) return Response.json({ error: "网络图片地址需要以 http:// 或 https:// 开头" }, { status: 400 });

    const id = crypto.randomUUID();
    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageTypes.has(imageFile.type)) return Response.json({ error: "请上传 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
      if (imageFile.size > 6 * 1024 * 1024) return Response.json({ error: "图片请控制在 6MB 以内" }, { status: 400 });
      await getUploads().put(`dish-images/${id}`, imageFile.stream(), {
        httpMetadata: { contentType: imageFile.type, cacheControl: "public, max-age=31536000, immutable" },
      });
      imageUrl = `/api/dish-images/${id}`;
    }

    await ensureCustomDishesSchema();
    const [dish] = await getDb().insert(customDishes).values({
      id, name, category, description, flavor, minutes, baseServings, imageUrl,
      ingredients: JSON.stringify(ingredients), steps: JSON.stringify(steps), source, active: 1,
    }).returning();
    return Response.json({ dish: presentDish(dish) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const form = await request.formData();
    const id = String(form.get("id") || "");
    await ensureCustomDishesSchema();
    const [existing] = await getDb().select().from(customDishes).where(eq(customDishes.id, id)).limit(1);
    if (!existing) return Response.json({ error: "没有找到这道菜" }, { status: 404 });
    const name = String(form.get("name") || "").trim().slice(0, 40);
    const category = String(form.get("category") || "").trim().slice(0, 30);
    const description = String(form.get("description") || "").trim().slice(0, 180);
    const flavor = String(form.get("flavor") || "家常风味").trim().slice(0, 30);
    const minutes = Number(form.get("minutes"));
    const baseServings = Number(form.get("baseServings") || 4);
    const ingredients = normalizeIngredients(String(form.get("ingredients") || "[]"));
    const steps = String(form.get("steps") || "").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim().slice(0, 500)).filter(Boolean).slice(0, 30);
    const source = String(form.get("source") || "").trim().slice(0, 80);
    const imageFile = form.get("image");
    const networkImage = safeNetworkImageUrl(String(form.get("imageUrl") || ""));
    let imageUrl = networkImage || existing.imageUrl;

    if (!name || !category) return Response.json({ error: "请填写菜名和菜品类型" }, { status: 400 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) return Response.json({ error: "烹饪时间需为 5–360 分钟" }, { status: 400 });
    if (!Number.isInteger(baseServings) || baseServings < 1 || baseServings > 20) return Response.json({ error: "基础份量需为 1–20 人" }, { status: 400 });
    if (form.get("imageUrl") && !networkImage) return Response.json({ error: "网络图片地址需要以 http:// 或 https:// 开头" }, { status: 400 });

    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageTypes.has(imageFile.type)) return Response.json({ error: "请上传 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
      if (imageFile.size > 6 * 1024 * 1024) return Response.json({ error: "图片请控制在 6MB 以内" }, { status: 400 });
      await getUploads().put(`dish-images/${id}`, imageFile.stream(), { httpMetadata: { contentType: imageFile.type, cacheControl: "public, max-age=31536000, immutable" } });
      imageUrl = `/api/dish-images/${id}`;
    } else if (networkImage && existing.imageUrl === `/api/dish-images/${id}`) {
      await getUploads().delete(`dish-images/${id}`);
    }

    const [dish] = await getDb().update(customDishes).set({
      name, category, description, flavor, minutes, baseServings, imageUrl,
      ingredients: JSON.stringify(ingredients), steps: JSON.stringify(steps), source,
    }).where(eq(customDishes.id, id)).returning();
    return Response.json({ dish: presentDish(dish) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as { id?: unknown; active?: unknown };
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id || typeof payload.active !== "boolean") return Response.json({ error: "无效的菜品状态" }, { status: 400 });
    await ensureCustomDishesSchema();
    const [dish] = await getDb().update(customDishes).set({ active: payload.active ? 1 : 0 }).where(eq(customDishes.id, id)).returning();
    if (!dish) return Response.json({ error: "没有找到这道菜" }, { status: 404 });
    return Response.json({ dish: presentDish(dish) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return Response.json({ error: "缺少菜品编号" }, { status: 400 });
    await ensureCustomDishesSchema();
    const [existing] = await getDb().select().from(customDishes).where(eq(customDishes.id, id)).limit(1);
    if (!existing) return Response.json({ error: "没有找到这道菜" }, { status: 404 });
    await ensureOrdersSchema();
    const orderRows = await getDb().select().from(orders);
    for (const order of orderRows) {
      let items: Array<{ dishId: string }> = [];
      let snapshots: Array<{ dishId: string; name: string; baseServings: number; ingredients: unknown[] }> = [];
      try { items = JSON.parse(order.dishes); } catch { /* 忽略损坏的旧记录 */ }
      try { snapshots = JSON.parse(order.dishSnapshot); } catch { /* 从空快照补齐 */ }
      if (items.some((item) => item.dishId === id) && !snapshots.some((item) => item.dishId === id)) {
        let ingredients: unknown[] = [];
        try { ingredients = JSON.parse(existing.ingredients); } catch { /* 保留空配方 */ }
        snapshots.push({ dishId: id, name: existing.name, baseServings: existing.baseServings || 4, ingredients });
        await getDb().update(orders).set({ dishSnapshot: JSON.stringify(snapshots) }).where(eq(orders.id, order.id));
      }
    }
    if (existing.imageUrl === `/api/dish-images/${id}`) await getUploads().delete(`dish-images/${id}`);
    await getDb().delete(customDishes).where(eq(customDishes.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
