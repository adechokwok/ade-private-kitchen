import { and, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, getDb } from "../../../../db";
import { customDishes, dinnerInvites, dinnerJournals } from "../../../../db/schema";

const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{20}$/i.test(token)) return Response.json({ error: "邀请链接无效" }, { status: 404 });
  await Promise.all([ensureDinnerInvitesSchema(), ensureMenuLibrary()]);
  const [invite] = await getDb().select().from(dinnerInvites).where(and(eq(dinnerInvites.token, token), eq(dinnerInvites.active, 1))).limit(1);
  if (!invite) return Response.json({ error: "这份邀请已结束或不存在" }, { status: 404 });
  const ids = parseList(invite.dishIds) as string[];
  const rows = await getDb().select().from(customDishes).where(eq(customDishes.active, 1));
  const dishes = rows.filter((dish) => ids.includes(dish.id) && dish.available).map((dish) => ({
    id: dish.id, name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan, imageUrl: dish.imageUrl,
    imagePosition: dish.imagePosition, featured: Boolean(dish.featured), available: Boolean(dish.available), soldOut: Boolean(dish.soldOut),
    dietary: parseList(dish.dietary), emoji: "🍽️", tone: "custom", flavor: "", minutes: 0, baseServings: 4, ingredients: [], steps: [], source: "", active: true, isCustom: true,
  }));
  const journalRows = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.inviteId, invite.id)).limit(1);
  const journal = journalRows[0] ? { ...journalRows[0], imageUrls: parseList(journalRows[0].imageUrls) } : null;
  return Response.json({ invite: { ...invite, dishIds: ids, recommendedDishIds: parseList(invite.recommendedDishIds), active: true }, dishes, journal });
}
