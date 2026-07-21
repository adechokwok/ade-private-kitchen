import { eq } from "drizzle-orm";
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
  if (order.inviteId) {
    await ensureDinnerInvitesSchema();
    const [inviteRow] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.id, order.inviteId)).limit(1);
    if (inviteRow) invite = { title: inviteRow.title, message: inviteRow.message, mealDate: inviteRow.mealDate, theme: inviteRow.theme };
    const [journalRow] = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.inviteId, order.inviteId)).limit(1);
    if (journalRow) journal = { ...journalRow, imageUrls: parseList(journalRow.imageUrls) };
  }
  return Response.json({ order: { customerName: order.customerName, mealDate: order.mealDate, guestCount: order.guestCount, dishes: parseList(order.dishes), dishSnapshot: parseList(order.dishSnapshot), status: order.status, progressNote: order.progressNote, statusUpdatedAt: order.statusUpdatedAt, createdAt: order.createdAt }, invite, journal });
}
