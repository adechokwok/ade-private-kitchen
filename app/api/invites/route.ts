import { withDataWrite } from "../../../storage/maintenance";
import { kitchenDate, validMealDate } from "../../kitchen-domain";
import { desc, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, getDb, getSqlite } from "../../../db";
import { customDishes, dinnerInvites, dinnerJournals, orders } from "../../../db/schema";
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
    getDb().select().from(dinnerInvites).orderBy(desc(dinnerInvites.createdAt)),
    getDb().select().from(dinnerJournals).orderBy(desc(dinnerJournals.createdAt)),
  ]);
  return Response.json({ invites: invites.map(presentInvite), journals: journals.map((item) => ({ ...item, imageUrls: parseList(item.imageUrls) })) });
}

async function handlePOST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { title?: unknown; message?: unknown; mealDate?: unknown; theme?: unknown; dishIds?: unknown; recommendedDishIds?: unknown; mode?: unknown; quickCreate?: unknown };
  const quickCreate = payload.quickCreate === true;
  const today = kitchenDate();
  const message = typeof payload.message === "string" ? payload.message.trim().slice(0, 180) : "";
  const mealDate = typeof payload.mealDate === "string" && payload.mealDate ? payload.mealDate : quickCreate ? today : "";
  const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 48) : quickCreate ? `共享饭局 · ${mealDate}` : "";
  const theme = typeof payload.theme === "string" && themes.has(payload.theme) ? payload.theme : "warm";
  const dishIds = parseIds(payload.dishIds);
  const hasDishIds = Object.prototype.hasOwnProperty.call(payload, "dishIds");
  const recommendedDishIds = parseIds(payload.recommendedDishIds).filter((id) => dishIds.includes(id));
  const mode = payload.mode === "shared" || quickCreate ? "shared" : "single";
  if (!title) return Response.json({ error: "请给这场饭局起个名字" }, { status: 400 });
  if (!validMealDate(mealDate)) return Response.json({ error: "请选择饭局日期" }, { status: 400 });
  if (mode === "single" && !dishIds.length) return Response.json({ error: "请至少选择一道可点的菜" }, { status: 400 });
  await ensureMenuLibrary();
  const activeDishes = await getDb().select({ id: customDishes.id }).from(customDishes).where(eq(customDishes.active, 1));
  const valid = new Set(activeDishes.map((dish) => dish.id));
  const allowed = mode === "shared"
    ? (quickCreate ? activeDishes.map((dish) => dish.id) : hasDishIds ? dishIds.filter((id) => valid.has(id)) : activeDishes.map((dish) => dish.id))
    : dishIds.filter((id) => valid.has(id));
  if (!allowed.length) return Response.json({ error: "所选菜品暂不可用" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const id = crypto.randomUUID();
  const token = crypto.randomUUID().replaceAll("-", "");
  const [invite] = await getDb().insert(dinnerInvites).values({ id, token, title, message, mealDate, theme, mode, dishIds: JSON.stringify(allowed), recommendedDishIds: JSON.stringify(recommendedDishIds.filter((id) => allowed.includes(id))), updatedAt: new Date().toISOString() }).returning();
  return Response.json({ invite: presentInvite(invite) }, { status: 201 });
}

async function handlePATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; active?: unknown; mealDate?: unknown };
  if (typeof payload.id !== "string" || (typeof payload.active !== "boolean" && typeof payload.mealDate !== "string")) return Response.json({ error: "无效的邀请信息" }, { status: 400 });
  if (typeof payload.mealDate === "string" && !validMealDate(payload.mealDate)) return Response.json({ error: "请选择有效日期" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const id = payload.id;
  return getSqlite().transaction(() => {
    const existing = getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, id)).get();
    if (!existing) return Response.json({ error: "没有找到这份邀请" }, { status: 404 });
    const order = existing.sharedOrderId ? getDb().select().from(orders).where(eq(orders.id, existing.sharedOrderId)).get() : undefined;
    if ((payload.active === true || typeof payload.mealDate === "string") && existing.sharedOrderId && (!order || order.archivedAt || ["done", "cancelled"].includes(order.status))) return Response.json({ error: "这场饭局已经结束，请新建邀请" }, { status: 409 });
    if (typeof payload.mealDate === "string" && order) getDb().update(orders).set({ mealDate: payload.mealDate }).where(eq(orders.id, order.id)).run();
    const invite = getDb().update(dinnerInvites).set({ ...(typeof payload.active === "boolean" ? { active: payload.active ? 1 : 0 } : {}), ...(typeof payload.mealDate === "string" ? { mealDate: payload.mealDate } : {}), updatedAt: new Date().toISOString() }).where(eq(dinnerInvites.id, id)).returning().get();
    return Response.json({ invite: presentInvite(invite) });
  })();
}

async function handleDELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return Response.json({ error: "缺少邀请 ID" }, { status: 400 });
  await ensureDinnerInvitesSchema();
  const sqlite = getSqlite();
  const deleted = sqlite.transaction(() => {
    const existing = sqlite.prepare("SELECT id FROM dinner_invites WHERE id = ?").get(id);
    if (!existing) return false;
    sqlite.prepare("DELETE FROM dinner_invite_selections WHERE invite_id = ?").run(id);
    sqlite.prepare("DELETE FROM dinner_invite_guests WHERE invite_id = ?").run(id);
    return sqlite.prepare("DELETE FROM dinner_invites WHERE id = ?").run(id).changes > 0;
  })();
  return deleted ? Response.json({ ok: true }) : Response.json({ error: "没有找到这份邀请" }, { status: 404 });
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withDataWrite(() => handlePOST(...args)); }

export async function PATCH(...args: Parameters<typeof handlePATCH>) { return withDataWrite(() => handlePATCH(...args)); }

export async function DELETE(...args: Parameters<typeof handleDELETE>) { return withDataWrite(() => handleDELETE(...args)); }
