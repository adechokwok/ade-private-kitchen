import { and, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureOrdersSchema, getDb } from "../../../../db";
import { dinnerInvites, dinnerJournals, orders } from "../../../../db/schema";

const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{32}$/i.test(token)) return Response.json({ error: "进度链接无效" }, { status: 404 });
  await ensureOrdersSchema();
  const [order] = await getDb().select().from(orders).where(eq(orders.guestToken, token)).limit(1);
  if (!order) return Response.json({ error: "没有找到这份点单" }, { status: 404 });
  let invite = null;
  let journal = null;
  await ensureDinnerInvitesSchema();
  if (order.inviteId) {
    const [inviteRow] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, order.inviteId)).limit(1);
    if (inviteRow) invite = { title: inviteRow.title, message: inviteRow.message, mealDate: inviteRow.mealDate, theme: inviteRow.theme };
  }
  let [journalRow] = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.orderId, order.id)).limit(1);
  if (!journalRow && order.inviteId) [journalRow] = await getDb().select().from(dinnerJournals).where(and(eq(dinnerJournals.inviteId, order.inviteId), eq(dinnerJournals.orderId, ""))).limit(1);
  if (journalRow) journal = { ...journalRow, imageUrls: parseList(journalRow.imageUrls) };
  return Response.json({ order: { customerName: order.customerName, mealDate: order.mealDate, guestCount: order.guestCount, dishes: parseList(order.dishes), dishSnapshot: parseList(order.dishSnapshot), status: order.status, progressNote: order.progressNote, statusUpdatedAt: order.statusUpdatedAt, statusReadAt: order.statusReadAt, publishedMenu: order.publishedMenu ? (() => { try { return JSON.parse(order.publishedMenu); } catch { return null; } })() : null, publishedMenuUpdatedAt: order.publishedMenuUpdatedAt, menuReadAt: order.menuReadAt, archivedAt: order.archivedAt, createdAt: order.createdAt }, invite, journal });
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^[a-f0-9]{32}$/i.test(token)) return Response.json({ error: "进度链接无效" }, { status: 404 });
  try {
    const payload = await request.json() as { action?: unknown; updateKey?: unknown };
    const action = payload.action === "read-status" || payload.action === "read-menu" ? payload.action : "";
    const updateKey = typeof payload.updateKey === "string" ? payload.updateKey.trim() : "";
    if (!action || !updateKey) return Response.json({ error: "已读信息不完整" }, { status: 400 });
    await ensureOrdersSchema();
    const [order] = await getDb().select().from(orders).where(eq(orders.guestToken, token)).limit(1);
    if (!order) return Response.json({ error: "没有找到这份点单" }, { status: 404 });
    const currentKey = action === "read-status" ? order.statusUpdatedAt : order.publishedMenuUpdatedAt;
    if (!currentKey || updateKey !== currentKey) return Response.json({ error: "这条提醒已经更新，请刷新后再确认" }, { status: 409 });
    const [updated] = await getDb().update(orders).set(action === "read-status" ? { statusReadAt: currentKey } : { menuReadAt: currentKey }).where(eq(orders.id, order.id)).returning({ id: orders.id });
    if (!updated) return Response.json({ error: "已读状态保存失败" }, { status: 500 });
    return Response.json({ ok: true, action, updateKey: currentKey });
  } catch {
    return Response.json({ error: "已读状态保存失败" }, { status: 400 });
  }
}
