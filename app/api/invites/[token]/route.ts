import { and, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, ensureOrdersSchema, getDb, getSqlite } from "../../../../db";
import { appSettings, customDishes, dinnerInviteGuests, dinnerInviteSelections, dinnerInvites, dinnerJournals, orders } from "../../../../db/schema";

const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^(?:[a-f0-9]{20}|[a-f0-9]{32})$/i.test(token)) return Response.json({ error: "邀请链接无效" }, { status: 404 });
  await Promise.all([ensureDinnerInvitesSchema(), ensureMenuLibrary()]);
  const [invite] = await getDb().select().from(dinnerInvites).where(and(eq(dinnerInvites.token, token), eq(dinnerInvites.active, 1))).limit(1);
  if (!invite) return Response.json({ error: "这份邀请已结束或不存在" }, { status: 404 });
  const rows = await getDb().select().from(customDishes).where(eq(customDishes.active, 1));
  const ids = invite.mode === "shared" ? rows.map((dish) => dish.id) : parseList(invite.dishIds) as string[];
  const dishes = rows.filter((dish) => ids.includes(dish.id) && dish.available).map((dish) => ({
    id: dish.id, name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan, imageUrl: dish.imageUrl,
    imagePosition: dish.imagePosition, featured: Boolean(dish.featured), available: Boolean(dish.available), soldOut: Boolean(dish.soldOut),
    dietary: parseList(dish.dietary), emoji: "🍽️", tone: "custom", flavor: "", minutes: 0, baseServings: 4, ingredients: [], steps: [], source: "", active: true, isCustom: true,
  }));
  const journalRows = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.inviteId, invite.id)).limit(1);
  const journal = journalRows[0] ? { ...journalRows[0], imageUrls: parseList(journalRows[0].imageUrls) } : null;
  const configuredRecommended = parseList(invite.recommendedDishIds) as string[];
  const recommendedDishIds = invite.mode === "shared"
    ? rows.filter((dish) => ids.includes(dish.id) && dish.featured).map((dish) => dish.id)
    : configuredRecommended;
  const response: Record<string, unknown> = { invite: { ...invite, dishIds: ids, recommendedDishIds, active: true }, dishes, journal };
  if (invite.mode === "shared") {
    const guestToken = new URL(_request.url).searchParams.get("guestToken") || "";
    const guests = await getDb().select().from(dinnerInviteGuests).where(eq(dinnerInviteGuests.inviteId, invite.id));
    const selectionRows = await getDb().select().from(dinnerInviteSelections).where(eq(dinnerInviteSelections.inviteId, invite.id));
    const selections = guests.map((guest) => ({ guestId: guest.id, displayName: guest.displayName, items: selectionRows.filter((item) => item.guestId === guest.id && item.quantity > 0).map((item) => ({ dishId: item.dishId, quantity: item.quantity })) }));
    const aggregate = new Map<string, number>();
    selectionRows.forEach((item) => { if (item.quantity > 0) aggregate.set(item.dishId, (aggregate.get(item.dishId) || 0) + item.quantity); });
    response.shared = {
      mode: "shared",
      guests: guests.map((guest) => ({ id: guest.id, displayName: guest.displayName })),
      selections,
      aggregate: Array.from(aggregate, ([dishId, quantity]) => ({ dishId, quantity })),
      guestToken,
      guestId: guests.find((guest) => guest.guestToken === guestToken)?.id || "",
      orderToken: invite.sharedOrderId ? (await getDb().select({ guestToken: orders.guestToken }).from(orders).where(eq(orders.id, invite.sharedOrderId)).limit(1))[0]?.guestToken || "" : "",
    };
  }
  return Response.json(response);
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^(?:[a-f0-9]{20}|[a-f0-9]{32})$/i.test(token)) return Response.json({ error: "邀请链接无效" }, { status: 404 });
  const payload = await request.json() as { action?: unknown; guestToken?: unknown; displayName?: unknown; dishId?: unknown; quantity?: unknown; customerName?: unknown; mealDate?: unknown; guestCount?: unknown; note?: unknown };
  await Promise.all([ensureDinnerInvitesSchema(), ensureMenuLibrary(), ensureOrdersSchema()]);
  const [invite] = await getDb().select().from(dinnerInvites).where(and(eq(dinnerInvites.token, token), eq(dinnerInvites.active, 1))).limit(1);
  if (!invite || invite.mode !== "shared") return Response.json({ error: "这不是多人共享饭局" }, { status: 409 });
  const action = typeof payload.action === "string" ? payload.action : "join";
  let guestToken = typeof payload.guestToken === "string" ? payload.guestToken.trim() : "";
  let guest = guestToken ? (await getDb().select().from(dinnerInviteGuests).where(and(eq(dinnerInviteGuests.inviteId, invite.id), eq(dinnerInviteGuests.guestToken, guestToken))).limit(1))[0] : undefined;
  if (!guest) {
    guestToken = crypto.randomUUID().replaceAll("-", "");
    const displayName = typeof payload.displayName === "string" && payload.displayName.trim() ? payload.displayName.trim().slice(0, 30) : "朋友";
    [guest] = await getDb().insert(dinnerInviteGuests).values({ id: crypto.randomUUID(), inviteId: invite.id, guestToken, displayName }).returning();
  } else if (typeof payload.displayName === "string" && payload.displayName.trim()) {
    [guest] = await getDb().update(dinnerInviteGuests).set({ displayName: payload.displayName.trim().slice(0, 30), updatedAt: new Date().toISOString() }).where(eq(dinnerInviteGuests.id, guest.id)).returning();
  }
  if (!guest) return Response.json({ error: "共享饭局成员创建失败" }, { status: 500 });
  if (action === "set-selection") {
    const dishId = typeof payload.dishId === "string" ? payload.dishId : "";
    const quantity = Number(payload.quantity);
    const ids = (await getDb().select({ id: customDishes.id }).from(customDishes).where(eq(customDishes.active, 1))).map((item) => item.id);
    const [dish] = await getDb().select({ id: customDishes.id, available: customDishes.available, soldOut: customDishes.soldOut, active: customDishes.active }).from(customDishes).where(eq(customDishes.id, dishId)).limit(1);
    if (!dishId || !ids.includes(dishId) || !dish || !dish.active || !dish.available || dish.soldOut) return Response.json({ error: "这道菜现在暂时不能点" }, { status: 409 });
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 10) return Response.json({ error: "菜品数量不正确" }, { status: 400 });
    if (quantity === 0) await getDb().delete(dinnerInviteSelections).where(and(eq(dinnerInviteSelections.inviteId, invite.id), eq(dinnerInviteSelections.guestId, guest.id), eq(dinnerInviteSelections.dishId, dishId)));
    else await getDb().insert(dinnerInviteSelections).values({ id: crypto.randomUUID(), inviteId: invite.id, guestId: guest.id, dishId, quantity, updatedAt: new Date().toISOString() }).onConflictDoUpdate({ target: [dinnerInviteSelections.inviteId, dinnerInviteSelections.guestId, dinnerInviteSelections.dishId], set: { quantity, updatedAt: new Date().toISOString() } });
    await getDb().update(dinnerInviteGuests).set({ updatedAt: new Date().toISOString() }).where(eq(dinnerInviteGuests.id, guest.id));
    return Response.json({ ok: true, guestToken });
  }
  if (action === "submit") {
    const [kitchenSetting] = await getDb().select().from(appSettings).where(eq(appSettings.key, "kitchen_open_v1")).limit(1);
    if (kitchenSetting?.value === "closed") return Response.json({ error: "阿德今天休息，等绿灯亮起再通知主厨吧" }, { status: 409 });
    const rows = await getDb().select().from(dinnerInviteSelections).where(and(eq(dinnerInviteSelections.inviteId, invite.id)));
    const aggregate = new Map<string, number>();
    rows.forEach((item) => { if (item.quantity > 0) aggregate.set(item.dishId, (aggregate.get(item.dishId) || 0) + item.quantity); });
    if (!aggregate.size) return Response.json({ error: "请先选几道菜" }, { status: 400 });
    const customRows = await getDb().select().from(customDishes).where(eq(customDishes.active, 1));
    const normalized = Array.from(aggregate, ([dishId, quantity]) => ({ dishId, quantity })).filter((item) => customRows.some((dish) => dish.id === item.dishId));
    const dishSnapshot = normalized.map((item) => {
      const dish = customRows.find((candidate) => candidate.id === item.dishId);
      if (!dish) return null;
      return { dishId: dish.id, name: dish.name, baseServings: dish.baseServings, ingredients: parseList(dish.ingredients), steps: parseList(dish.steps), minutes: dish.minutes, recipeSummary: dish.recipeSummary, source: dish.source, difficulty: dish.difficulty };
    }).filter(Boolean);
    const guestNames = (await getDb().select().from(dinnerInviteGuests).where(eq(dinnerInviteGuests.inviteId, invite.id))).map((item) => item.displayName).filter(Boolean).join("、");
    const customerName = guestNames ? `多人饭局（${guestNames.slice(0, 60)}）` : "多人饭局";
    const mealDate = typeof payload.mealDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.mealDate) ? payload.mealDate : invite.mealDate;
    const guestCount = Number(payload.guestCount);
    const participantCount = (await getDb().select().from(dinnerInviteGuests).where(eq(dinnerInviteGuests.inviteId, invite.id))).length;
    const requestedCount = Number.isInteger(guestCount) && guestCount > 0 && guestCount <= 20 ? guestCount : 0;
    const count = Math.min(20, Math.max(1, requestedCount, participantCount));
    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
    let order;
    if (invite.sharedOrderId) {
      [order] = await getDb().update(orders).set({ customerName, mealDate, guestCount: count, note, dishes: JSON.stringify(normalized), dishSnapshot: JSON.stringify(dishSnapshot) }).where(eq(orders.id, invite.sharedOrderId)).returning();
    } else {
      const id = crypto.randomUUID();
      const orderGuestToken = crypto.randomUUID().replaceAll("-", "");
      [order] = await getDb().insert(orders).values({ id, customerName, mealDate, guestCount: count, note, dishes: JSON.stringify(normalized), dishSnapshot: JSON.stringify(dishSnapshot), inviteId: invite.id, guestToken: orderGuestToken }).returning();
      const claim = getSqlite().prepare("UPDATE dinner_invites SET shared_order_id = ?, updated_at = ? WHERE id = ? AND shared_order_id = ''").run(order.id, new Date().toISOString(), invite.id);
      if (claim.changes === 0) {
        const winnerId = (getSqlite().prepare("SELECT shared_order_id AS value FROM dinner_invites WHERE id = ?").get(invite.id) as { value?: string } | undefined)?.value || order.id;
        if (winnerId !== order.id) {
          await getDb().delete(orders).where(eq(orders.id, order.id));
          [order] = await getDb().update(orders).set({ customerName, mealDate, guestCount: count, note, dishes: JSON.stringify(normalized), dishSnapshot: JSON.stringify(dishSnapshot) }).where(eq(orders.id, winnerId)).returning();
        }
      }
    }
    return Response.json({ ok: true, guestToken, order, orderToken: order?.guestToken || "" });
  }
  return Response.json({ ok: true, guestToken });
}
