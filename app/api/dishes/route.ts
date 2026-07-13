import { desc, eq } from "drizzle-orm";
import { ensureCustomDishesSchema, getDb, getUploads } from "../../../db";
import { customDishes } from "../../../db/schema";

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

export async function GET() {
  try {
    await ensureCustomDishesSchema();
    const rows = await getDb().select().from(customDishes).orderBy(desc(customDishes.createdAt));
    return Response.json({ dishes: rows.map(presentDish) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim().slice(0, 40);
    const category = String(form.get("category") || "").trim().slice(0, 30);
    const description = String(form.get("description") || "").trim().slice(0, 180);
    const flavor = String(form.get("flavor") || "家常风味").trim().slice(0, 30);
    const minutes = Number(form.get("minutes"));
    const ingredients = normalizeIngredients(String(form.get("ingredients") || "[]"));
    const steps = String(form.get("steps") || "").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim().slice(0, 500)).filter(Boolean).slice(0, 30);
    const source = String(form.get("source") || "").trim().slice(0, 80);
    const imageFile = form.get("image");
    let imageUrl = safeNetworkImageUrl(String(form.get("imageUrl") || ""));

    if (!name) return Response.json({ error: "请填写菜名" }, { status: 400 });
    if (!category) return Response.json({ error: "请填写菜系分类" }, { status: 400 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) return Response.json({ error: "烹饪时间需为 5–360 分钟" }, { status: 400 });
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
      id, name, category, description, flavor, minutes, imageUrl,
      ingredients: JSON.stringify(ingredients), steps: JSON.stringify(steps), source, active: 1,
    }).returning();
    return Response.json({ dish: presentDish(dish) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) return Response.json({ error: "缺少菜品编号" }, { status: 400 });
    await ensureCustomDishesSchema();
    const [existing] = await getDb().select().from(customDishes).where(eq(customDishes.id, id)).limit(1);
    if (!existing) return Response.json({ error: "没有找到这道菜" }, { status: 404 });
    if (existing.imageUrl === `/api/dish-images/${id}`) await getUploads().delete(`dish-images/${id}`);
    await getDb().delete(customDishes).where(eq(customDishes.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
