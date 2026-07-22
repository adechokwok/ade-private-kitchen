import { asc, desc, eq, inArray } from "drizzle-orm";
import { ensureCustomDishesSchema, ensureMenuLibrary, ensureOrdersSchema, getDb, getUploads } from "../../../db";
import { customDishes, menuCategories, orders } from "../../../db/schema";
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

function normalizeImagePosition(value: FormDataEntryValue | null, fallback = "center") {
  const candidate = String(value || "").trim();
  if (["top", "center", "bottom"].includes(candidate)) return candidate;
  const match = candidate.match(/^(\d{1,3}(?:\.\d+)?):(\d{1,3}(?:\.\d+)?):(1(?:\.\d+)?|0?\.\d+)$/);
  if (!match) return fallback;
  const x = Math.min(100, Math.max(0, Number(match[1])));
  const y = Math.min(100, Math.max(0, Number(match[2])));
  const zoom = Math.min(1.8, Math.max(1, Number(match[3])));
  return `${Math.round(x)}:${Math.round(y)}:${zoom.toFixed(2)}`;
}

function tagList(value: FormDataEntryValue | null) {
  return String(value || "").split(/[,，、]/).map((item) => item.trim().slice(0, 20)).filter(Boolean).slice(0, 12);
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
    slogan: row.slogan,
    flavor: row.flavor,
    minutes: row.minutes,
    baseServings: row.baseServings,
    imageUrl: row.imageUrl,
    imagePosition: row.imagePosition,
    gallery: parseList(row.gallery),
    ingredients: parseList(row.ingredients),
    steps: parseList(row.steps),
    source: row.source,
    active: Boolean(row.active),
    featured: Boolean(row.featured),
    available: Boolean(row.available),
    soldOut: Boolean(row.soldOut),
    seasons: parseList(row.seasons),
    occasions: parseList(row.occasions),
    dietary: parseList(row.dietary),
    difficulty: row.difficulty,
    recipeSummary: row.recipeSummary,
    substitutions: parseList(row.substitutions),
    sortOrder: row.sortOrder,
    isCustom: true,
    emoji: "🍽️",
    tone: "custom",
    createdAt: row.createdAt,
  };
}

export async function GET(request: Request) {
  try {
    await ensureMenuLibrary();
    const rows = await getDb().select().from(customDishes).orderBy(asc(customDishes.sortOrder), desc(customDishes.createdAt));
    const fullAccess = isChefRequest(request);
    const presented = rows.map(presentDish);
    return Response.json({ dishes: fullAccess ? presented : presented.filter((dish) => dish.active && dish.available).map((dish) => ({
      id: dish.id, name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan,
      imageUrl: dish.imageUrl, imagePosition: dish.imagePosition, gallery: dish.gallery, active: dish.active, isCustom: true, emoji: dish.emoji, tone: dish.tone,
      flavor: "", minutes: 0, baseServings: 4, ingredients: [], steps: [], source: "",
      featured: dish.featured, available: dish.available, soldOut: dish.soldOut, seasons: [], occasions: [], dietary: dish.dietary, sortOrder: dish.sortOrder,
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
    const slogan = String(form.get("slogan") || "").trim().slice(0, 60);
    const flavor = String(form.get("flavor") || "家常风味").trim().slice(0, 30);
    const minutes = Number(form.get("minutes"));
    const baseServings = Number(form.get("baseServings") || 4);
    const ingredients = normalizeIngredients(String(form.get("ingredients") || "[]"));
    const steps = String(form.get("steps") || "").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim().slice(0, 500)).filter(Boolean).slice(0, 30);
    const source = String(form.get("source") || "").trim().slice(0, 80);
    const featured = form.get("featured") === "on";
    const available = form.get("available") === "on";
    const soldOut = form.get("soldOut") === "on";
    const seasons = tagList(form.get("seasons"));
    const occasions = tagList(form.get("occasions"));
    const dietary = tagList(form.get("dietary"));
    const difficulty = ["简单", "适中", "进阶"].includes(String(form.get("difficulty"))) ? String(form.get("difficulty")) : "适中";
    const recipeSummary = String(form.get("recipeSummary") || "").trim().slice(0, 240);
    const substitutions = String(form.get("substitutions") || "[]");
    const imageFile = form.get("image");
    const galleryFiles = form.getAll("galleryImages").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 4);
    const imagePosition = normalizeImagePosition(form.get("imagePosition"));
    let imageUrl = safeNetworkImageUrl(String(form.get("imageUrl") || ""));

    if (!name) return Response.json({ error: "请填写菜名" }, { status: 400 });
    if (!category) return Response.json({ error: "请填写菜系分类" }, { status: 400 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) return Response.json({ error: "烹饪时间需为 5–360 分钟" }, { status: 400 });
    if (!Number.isInteger(baseServings) || baseServings < 1 || baseServings > 20) return Response.json({ error: "基础份量需为 1–20 人" }, { status: 400 });
    if (form.get("imageUrl") && !imageUrl) return Response.json({ error: "网络图片地址需要以 http:// 或 https:// 开头" }, { status: 400 });
    if (galleryFiles.some((file) => !imageTypes.has(file.type) || file.size > 6 * 1024 * 1024)) return Response.json({ error: "过程图需为常见图片格式，且每张不超过 6MB" }, { status: 400 });

    const id = crypto.randomUUID();
    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageTypes.has(imageFile.type)) return Response.json({ error: "请上传 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
      if (imageFile.size > 6 * 1024 * 1024) return Response.json({ error: "图片请控制在 6MB 以内" }, { status: 400 });
      await getUploads().put(`dish-images/${id}`, imageFile.stream(), {
        httpMetadata: { contentType: imageFile.type, cacheControl: "public, max-age=31536000, immutable" },
      });
      imageUrl = `/api/dish-images/${id}`;
    }
    const gallery: string[] = [];
    for (const [index, file] of galleryFiles.entries()) {
      await getUploads().put(`dish-gallery/${id}/${index}`, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      gallery.push(`/api/dish-gallery/${id}/${index}`);
    }

    await ensureMenuLibrary();
    const [dish] = await getDb().insert(customDishes).values({
      id, name, category, description, slogan, flavor, minutes, baseServings, imageUrl, imagePosition, gallery: JSON.stringify(gallery),
      ingredients: JSON.stringify(ingredients), steps: JSON.stringify(steps), source, active: 1,
      featured: featured ? 1 : 0, available: available ? 1 : 0, soldOut: soldOut ? 1 : 0,
      seasons: JSON.stringify(seasons), occasions: JSON.stringify(occasions), dietary: JSON.stringify(dietary),
      difficulty, recipeSummary, substitutions, sortOrder: Date.now(),
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
    const slogan = String(form.get("slogan") || "").trim().slice(0, 60);
    const flavor = String(form.get("flavor") || "家常风味").trim().slice(0, 30);
    const minutes = Number(form.get("minutes"));
    const baseServings = Number(form.get("baseServings") || 4);
    const ingredients = normalizeIngredients(String(form.get("ingredients") || "[]"));
    const steps = String(form.get("steps") || "").split("\n").map((step) => step.replace(/^\s*\d+[.、）)]\s*/, "").trim().slice(0, 500)).filter(Boolean).slice(0, 30);
    const source = String(form.get("source") || "").trim().slice(0, 80);
    const featured = form.get("featured") === "on";
    const available = form.get("available") === "on";
    const soldOut = form.get("soldOut") === "on";
    const seasons = tagList(form.get("seasons"));
    const occasions = tagList(form.get("occasions"));
    const dietary = tagList(form.get("dietary"));
    const difficulty = ["简单", "适中", "进阶"].includes(String(form.get("difficulty"))) ? String(form.get("difficulty")) : existing.difficulty;
    const recipeSummary = String(form.get("recipeSummary") || "").trim().slice(0, 240);
    const substitutions = String(form.get("substitutions") || "[]");
    const imageFile = form.get("image");
    const galleryFiles = form.getAll("galleryImages").filter((value): value is File => value instanceof File && value.size > 0).slice(0, 4);
    const imagePosition = normalizeImagePosition(form.get("imagePosition"), existing.imagePosition);
    const networkImage = safeNetworkImageUrl(String(form.get("imageUrl") || ""));
    let imageUrl = networkImage || existing.imageUrl;
    let gallery = (() => { try { return JSON.parse(existing.gallery) as string[]; } catch { return []; } })();

    if (!name || !category) return Response.json({ error: "请填写菜名和菜品类型" }, { status: 400 });
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 360) return Response.json({ error: "烹饪时间需为 5–360 分钟" }, { status: 400 });
    if (!Number.isInteger(baseServings) || baseServings < 1 || baseServings > 20) return Response.json({ error: "基础份量需为 1–20 人" }, { status: 400 });
    if (form.get("imageUrl") && !networkImage) return Response.json({ error: "网络图片地址需要以 http:// 或 https:// 开头" }, { status: 400 });
    if (galleryFiles.some((file) => !imageTypes.has(file.type) || file.size > 6 * 1024 * 1024)) return Response.json({ error: "过程图需为常见图片格式，且每张不超过 6MB" }, { status: 400 });

    if (imageFile instanceof File && imageFile.size > 0) {
      if (!imageTypes.has(imageFile.type)) return Response.json({ error: "请上传 JPG、PNG、WebP 或 GIF 图片" }, { status: 400 });
      if (imageFile.size > 6 * 1024 * 1024) return Response.json({ error: "图片请控制在 6MB 以内" }, { status: 400 });
      await getUploads().put(`dish-images/${id}`, imageFile.stream(), { httpMetadata: { contentType: imageFile.type, cacheControl: "public, max-age=31536000, immutable" } });
      imageUrl = `/api/dish-images/${id}`;
    } else if (networkImage && existing.imageUrl === `/api/dish-images/${id}`) {
      await getUploads().delete(`dish-images/${id}`);
    }
    if (galleryFiles.length) {
      for (let index = 0; index < gallery.length; index += 1) await getUploads().delete(`dish-gallery/${id}/${index}`);
      gallery = [];
      for (const [index, file] of galleryFiles.entries()) {
        await getUploads().put(`dish-gallery/${id}/${index}`, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
        gallery.push(`/api/dish-gallery/${id}/${index}`);
      }
    }

    const [dish] = await getDb().update(customDishes).set({
      name, category, description, slogan, flavor, minutes, baseServings, imageUrl, imagePosition, gallery: JSON.stringify(gallery),
      ingredients: JSON.stringify(ingredients), steps: JSON.stringify(steps), source,
      featured: featured ? 1 : 0, available: available ? 1 : 0, soldOut: soldOut ? 1 : 0,
      seasons: JSON.stringify(seasons), occasions: JSON.stringify(occasions), dietary: JSON.stringify(dietary),
      difficulty, recipeSummary, substitutions,
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
    const payload = await request.json() as { id?: unknown; ids?: unknown; category?: unknown; active?: unknown; featured?: unknown; available?: unknown; soldOut?: unknown; sortOrder?: unknown };
    const ids = Array.isArray(payload.ids)
      ? Array.from(new Set(payload.ids.filter((value): value is string => typeof value === "string" && value.length > 0))).slice(0, 500)
      : [];
    const category = typeof payload.category === "string" ? payload.category.trim().slice(0, 30) : "";
    if (ids.length || category) {
      if (!ids.length || !category) return Response.json({ error: "请选择菜品和目标大类" }, { status: 400 });
      await ensureMenuLibrary();
      const [target] = await getDb().select().from(menuCategories).where(eq(menuCategories.name, category)).limit(1);
      if (!target) return Response.json({ error: "目标大类不存在，请刷新后重试" }, { status: 404 });
      const updated = await getDb().update(customDishes).set({ category }).where(inArray(customDishes.id, ids)).returning({ id: customDishes.id });
      return Response.json({ ok: true, updated: updated.length, category });
    }
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) return Response.json({ error: "无效的菜品状态" }, { status: 400 });
    const updates: Partial<typeof customDishes.$inferInsert> = {};
    if (typeof payload.active === "boolean") updates.active = payload.active ? 1 : 0;
    if (typeof payload.featured === "boolean") updates.featured = payload.featured ? 1 : 0;
    if (typeof payload.available === "boolean") updates.available = payload.available ? 1 : 0;
    if (typeof payload.soldOut === "boolean") updates.soldOut = payload.soldOut ? 1 : 0;
    if (Number.isInteger(payload.sortOrder)) updates.sortOrder = Number(payload.sortOrder);
    if (!Object.keys(updates).length) return Response.json({ error: "没有需要更新的状态" }, { status: 400 });
    await ensureMenuLibrary();
    const [dish] = await getDb().update(customDishes).set(updates).where(eq(customDishes.id, id)).returning();
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
      let snapshots: Array<{ dishId: string; name: string; baseServings: number; ingredients: unknown[]; steps?: string[]; minutes?: number; recipeSummary?: string; source?: string; difficulty?: string }> = [];
      try { items = JSON.parse(order.dishes); } catch { /* 忽略损坏的旧记录 */ }
      try { snapshots = JSON.parse(order.dishSnapshot); } catch { /* 从空快照补齐 */ }
      if (items.some((item) => item.dishId === id) && !snapshots.some((item) => item.dishId === id)) {
        let ingredients: unknown[] = [];
        try { ingredients = JSON.parse(existing.ingredients); } catch { /* 保留空配方 */ }
        let steps: string[] = [];
        try { steps = JSON.parse(existing.steps); } catch { /* 保留空步骤 */ }
        snapshots.push({ dishId: id, name: existing.name, baseServings: existing.baseServings || 4, ingredients, steps, minutes: existing.minutes, recipeSummary: existing.recipeSummary, source: existing.source, difficulty: existing.difficulty });
        await getDb().update(orders).set({ dishSnapshot: JSON.stringify(snapshots) }).where(eq(orders.id, order.id));
      }
    }
    if (existing.imageUrl === `/api/dish-images/${id}`) await getUploads().delete(`dish-images/${id}`);
    const gallery = (() => { try { return JSON.parse(existing.gallery) as string[]; } catch { return []; } })();
    for (let index = 0; index < gallery.length; index += 1) await getUploads().delete(`dish-gallery/${id}/${index}`);
    await getDb().delete(customDishes).where(eq(customDishes.id, id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
