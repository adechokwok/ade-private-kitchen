import { eq } from "drizzle-orm";
import { chefApiGuard } from "../../../chef-auth";
import { ensureMenuLibrary, getDb } from "../../../../db";
import { customDishes } from "../../../../db/schema";

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  await ensureMenuLibrary();
  const [source] = await getDb().select().from(customDishes).where(eq(customDishes.id, id)).limit(1);
  if (!source) return Response.json({ error: "没有找到这道菜" }, { status: 404 });
  const copyId = crypto.randomUUID();
  const [dish] = await getDb().insert(customDishes).values({
    ...source,
    id: copyId,
    name: `${source.name}（副本）`.slice(0, 40),
    imageUrl: source.imageUrl.startsWith("/api/dish-images/") ? "" : source.imageUrl,
    gallery: "[]",
    active: 0,
    featured: 0,
    soldOut: 0,
    sortOrder: source.sortOrder + 1,
    createdAt: new Date().toISOString(),
  }).returning();
  return Response.json({ dish: { ...dish, ingredients: JSON.parse(dish.ingredients), steps: JSON.parse(dish.steps), gallery: JSON.parse(dish.gallery), seasons: JSON.parse(dish.seasons), occasions: JSON.parse(dish.occasions), dietary: JSON.parse(dish.dietary), active: Boolean(dish.active), featured: Boolean(dish.featured), available: Boolean(dish.available), soldOut: Boolean(dish.soldOut), isCustom: true, emoji: "🍽️", tone: "custom" } }, { status: 201 });
}
