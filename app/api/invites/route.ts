import { desc, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, getDb } from "../../../db";
import { customDishes, dinnerInvites, dinnerJournals } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const themes = new Set(["warm", "romance", "fine", "festival"]);
const parseIds = (value: unknown) => Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string"))).slice(0, 60) : [];
const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

function presentInvite(row: typeof dinnerInvites.$inferSelect) {
  return { ...row, dishIds: parseList(row.dishIds), recommendedDishIds: parseList(row.recommendedDishIds), active: Boolean(row.active) };
}

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensureDinnerInvitesSchema();
  const [invites, journals] = await Promise.all([
    getDb().select().from(dinnerInvites).orderBy(desc(dinnerInvites.createdAt)).limit(100),
    getDb().select().from(dinnerJournals).orderBy(desc(dinnerJournals.createdAt)).limit(100),
  ]);
  return Response.json({ invites: invites.map(presentInvite), journals: journals.map((item) => ({ ...item, imageUrls: parseList(item.imageUrls) })) });
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { title?: unknown; message?: unknown; mealDate?: unknown; theme?: unknown; dishIds?: unknown; recommendedDishIds?: unknown };
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 48) : "";
  const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 180) : "";
  const mealDate = typeof payload.mealDate === "string" ? payload.mealDate : "";
  const theme = typeof payload.theme === "string" && themes.has(payload.theme) ? payload.theme : "warm";
  const dishIds = parseIds(payload.dishIds);
  const recommendedDishIds = parseIds(payload.recommendedDishIds).filter((id) => dishIds.includes(id));
  if (!title) return Response.json({ error: "请给这场饭局起个名字" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return Response.json({ error: "请选择饭局日期" }, { status: 400 });
  if (!dishIds.length) return Response.json({ error: "请至少选择一道可点的菜" }, { status: 400 });
  await ensureMenuLibrary();
  const activeDishes = await getDb().select({ id: customDishes.id }).from(customDishes).where(eq(customDishes.active, 1));
  const valid = new Set(activeDishes.map((dish) => dish.id));
  const allowed = dishIds.filter((id) => valid.has(id));
  if (!allowed.length) return Response.json({ error: "所选菜品暂不可用" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const [invite] = await getDb().insert(dinnerInvites).values({ id, token, title, message, mealDate, theme, dishIds: JSON.stringify(allowed), recommendedDishIds: JSON.stringify(recommendedDishIds.filter((id) => allowed.includes(id))) }).returning();
  return Response.json({ invite: presentInvite(invite) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; active?: unknown };
  if (typeof payload.id !== "string" || typeof payload.active !== "boolean") return Response.json({ error: "无效的邀请状态" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const [invite] = await getDb().update(dinnerInvites).set({ active: payload.active ? 1 : 0 }).where(eq(dinnerInvites.id, payload.id)).returning();
  return invite ? Response.json({ invite: presentInvite(invite) }) : Response.json({ error: "没有找到这份邀请" }, { status: 404 });
}
