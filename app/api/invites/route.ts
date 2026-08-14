import { desc, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, getDb } from "../../../db";
import { customDishes, dinnerInvites, dinnerJournals, dinnerInviteGuests, dinnerInviteSelections } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const themes = new Set(["warm", "romance", "fine", "festival"]);
const parseIds = (value: unknown) => Array.isArray(value) ? Array.from(new Set(value.filter((id): id is string => typeof id === "string"))).slice(0, 60) : [];
const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

function presentInvite(row: typeof dinnerInvites.$inferSelect) {
  return { ...row, dishIds: parseList(row.dishIds), recommendedDishIds: parseList(row.recommendedDishIds), active: Boolean(row.active), mode: row.mode || "single" };
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
  const payload = await request.json() as { title?: unknown; message?: unknown; mealDate?: unknown; theme?: unknown; dishIds?: unknown; recommendedDishIds?: unknown; mode?: unknown; quickCreate?: unknown };
  const quickCreate = payload.quickCreate === true;
  const today = new Date().toISOString().slice(0, 10);
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 48) : quickCreate ? `共享饭局 · ${today}` : "";
  const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 180) : "";
  const mealDate = typeof payload.mealDate === "string" && payload.mealDate ? payload.mealDate : quickCreate ? today : "";
  const theme = typeof payload.theme === "string" && themes.has(payload.theme) ? payload.theme : "warm";
  const dishIds = parseIds(payload.dishIds);
  const hasDishIds = Object.prototype.hasOwnProperty.call(payload, "dishIds");
  const recommendedDishIds = parseIds(payload.recommendedDishIds).filter((id) => dishIds.includes(id));
  const mode = payload.mode === "shared" || quickCreate ? "shared" : "single";
  if (!title) return Response.json({ error: "请给这场饭局起个名字" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return Response.json({ error: "请选择饭局日期" }, { status: 400 });
  if (mode === "single" && !dishIds.length) return Response.json({ error: "请至少选择一道可点的菜" }, { status: 400 });
  await ensureMenuLibrary();
  const activeDishes = await getDb().select({ id: customDishes.id }).from(customDishes).where(eq(customDishes.active, 1));
  const valid = new Set(activeDishes.map((dish) => dish.id));
  const allowed = mode === "shared"
    ? (hasDishIds ? dishIds.filter((id) => valid.has(id)) : activeDishes.map((dish) => dish.id))
    : dishIds.filter((id) => valid.has(id));
  if (!allowed.length) return Response.json({ error: "所选菜品暂不可用" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "");
  await getDb().insert(dinnerInvites).values({ id, token, title, message, mealDate, theme, mode, dishIds: JSON.stringify(allowed), recommendedDishIds: JSON.stringify(recommendedDishIds.filter((id) => allowed.includes(id))), updatedAt: new Date().toISOString() });
  const [invite] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, id)).limit(1);
  return Response.json({ invite: presentInvite(invite) }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; active?: unknown };
  if (typeof payload.id !== "string" || typeof payload.active !== "boolean") return Response.json({ error: "无效的邀请状态" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const db = getDb();
  await db.update(dinnerInvites).set({ active: payload.active ? 1 : 0, updatedAt: new Date().toISOString() }).where(eq(dinnerInvites.id, payload.id));
  const [invite] = await db.select().from(dinnerInvites).where(eq(dinnerInvites.id, payload.id)).limit(1);
  return invite ? Response.json({ invite: presentInvite(invite) }) : Response.json({ error: "没有找到这份邀请" }, { status: 404 });
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少邀请 ID" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const deleted = await getDb().transaction(async (tx) => {
    const existing = await tx.select({ id: dinnerInvites.id }).from(dinnerInvites).where(eq(dinnerInvites.id, id)).limit(1);
    if (!existing.length) return false;
    await tx.delete(dinnerInviteSelections).where(eq(dinnerInviteSelections.inviteId, id));
    await tx.delete(dinnerInviteGuests).where(eq(dinnerInviteGuests.inviteId, id));
    await tx.delete(dinnerInvites).where(eq(dinnerInvites.id, id));
    return true;
  });
  return deleted ? Response.json({ ok: true }) : Response.json({ error: "没有找到这份邀请" }, { status: 404 });
}
