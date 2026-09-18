import { withDataWrite } from "../../../../storage/maintenance";
import { and, asc, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, ensureOrdersSchema, getDb, getSqlite } from "../../../../db";
import { appSettings, customDishes, dinnerInviteGuests, dinnerInviteSelections, dinnerInvites, dinnerJournals, menuCategories, orders } from "../../../../db/schema";

import { validMealDate } from "../../../kitchen-domain";

const parseList = (value: string) => { try { return JSON.parse(value); } catch { return []; } };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^(?:[a-f0-9]{20}|[a-f0-9]{32})$/i.test(token)) return Response.json({ error: "邀请链接无效" }, { status: 404 });
  await Promise.all([ensureDinnerInvitesSchema(), ensureMenuLibrary(), ensureOrdersSchema()]);
  const [invite] = await getDb().select().from(dinnerInvites).where(and(eq(dinnerInvites.token, token), eq(dinnerInvites.active, 1))).limit(1);
  if (!invite) return Response.json({ error: "这份邀请已结束或不存在" }, { status: 404 });
  if (invite.sharedOrderId) {
    const linked = getDb().select().from(orders).where(eq(orders.id, invite.sharedOrderId)).get();
    if (!linked || linked.archivedAt || ["done", "cancelled"].includes(linked.status)) return Response.json({ error: "这场饭局已结束" }, { status: 410 });
  }
  const rows = await getDb().select().from(customDishes).where(eq(customDishes.active, 1)).orderBy(asc(customDishes.sortOrder), asc(customDishes.createdAt));
  const categories = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  const categoryOrder = new Map(categories.map(category => [category.name, category.sortOrder]));
  rows.sort((left, right) => (categoryOrder.get(left.category) ?? Number.MAX_SAFE_INTEGER) - (categoryOrder.get(right.category) ?? Number.MAX_SAFE_INTEGER) || left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt));
  const ids = invite.mode === "shared" ? rows.map((dish) => dish.id) : parseList(invite.dishIds) as string[];
  const dishes = rows.filter((dish) => ids.includes(dish.id) && dish.available).map((dish) => ({
    sortOrder: dish.sortOrder, id: dish.id, name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan, imageUrl: dish.imageUrl,
    imagePosition: dish.imagePosition, featured: Boolean(dish.featured), available: Boolean(dish.available), soldOut: Boolean(dish.soldOut),
    dietary: parseList(dish.dietary), emoji: "🍽️", tone: "custom", flavor: "", minutes: 0, baseServings: 4, ingredients: [], steps: [], source: "", active: true, isCustom: true,
  }));
  const journalRows = await getDb().select().from(dinnerJournals).where(eq(dinnerJournals.inviteId, invite.id)).limit(1);
  const journal = journalRows[0] ? { ...journalRows[0], imageUrls: parseList(journalRows[0].imageUrls) } : null;
  const configuredRecommended = parseList(invite.recommendedDishIds) as string[];
  const recommendedDishIds = invite.mode === "shared"
    ? rows.filter((dish) => ids.includes(dish.id) && dish.featured).map((dish) => dish.id)
    : configuredRecommended;
  const response: Record<string, unknown> = { invite: { ...invite, dishIds: ids, recommendedDishIds, active: true }, dishes, journal, categories };
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

async function handlePOST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!/^(?:[a-f0-9]{20}|[a-f0-9]{32})$/i.test(token)) return Response.json({ error: "邀请链接无效" }, { status: 404 });
  try {
    const payload = await request.json() as Record<string, unknown>;
    await Promise.all([ensureDinnerInvitesSchema(), ensureMenuLibrary(), ensureOrdersSchema()]);
    // All reads and writes use a single synchronous SQLite transaction. No second
    // submission can claim an order or overwrite its notes between awaits.
    return getSqlite().transaction(() => {
      const db = getDb();
      const invite = db.select().from(dinnerInvites).where(eq(dinnerInvites.token, token)).get();
      if (!invite || !invite.active || invite.mode !== "shared") return Response.json({ error: "这场共享饭局已结束或不存在" }, { status: 409 });
      const existing = invite.sharedOrderId ? db.select().from(orders).where(eq(orders.id, invite.sharedOrderId)).get() : undefined;
      if (invite.sharedOrderId && (!existing || existing.archivedAt || ["done", "cancelled"].includes(existing.status))) return Response.json({ error: "这场饭局已结束，不能再加菜" }, { status: 409 });
      const action = typeof payload.action === "string" ? payload.action : "join";
      if (!["join", "set-selection", "submit"].includes(action)) return Response.json({ error: "无效的操作" }, { status: 400 });
      const kitchen = db.select().from(appSettings).where(eq(appSettings.key, "kitchen_open_v1")).get();
      if (action !== "join" && kitchen?.value === "closed") return Response.json({ error: "阿德今天休息，等绿灯亮起再来点菜吧" }, { status: 409 });
      let guestToken = typeof payload.guestToken === "string" ? payload.guestToken : "";
      let guest = db.select().from(dinnerInviteGuests).where(and(eq(dinnerInviteGuests.inviteId, invite.id), eq(dinnerInviteGuests.guestToken, guestToken))).get();
      if (!guest && action !== "join") return Response.json({ error: "请先加入这场饭局" }, { status: 409 });
      const displayName = typeof payload.displayName === "string" ? payload.displayName.trim().slice(0, 30) : action === "submit" && typeof payload.customerName === "string" ? payload.customerName.trim().slice(0, 30) : "";
      if (!guest) {
        guestToken = crypto.randomUUID().replaceAll("-", "");
        guest = db.insert(dinnerInviteGuests).values({ id: crypto.randomUUID(), inviteId: invite.id, guestToken, displayName: displayName || "朋友" }).returning().get();
      } else if (displayName) {
        guest = db.update(dinnerInviteGuests).set({ displayName, updatedAt: new Date().toISOString() }).where(eq(dinnerInviteGuests.id, guest.id)).returning().get();
      }
      if (action === "set-selection") {
        const dishId = typeof payload.dishId === "string" ? payload.dishId : "";
        const quantity = payload.quantity;
        if (!dishId || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 0 || quantity > 10) return Response.json({ error: "菜品数量需为 0–10 份" }, { status: 400 });
        if (quantity === 0) {
          db.delete(dinnerInviteSelections).where(and(eq(dinnerInviteSelections.inviteId, invite.id), eq(dinnerInviteSelections.guestId, guest.id), eq(dinnerInviteSelections.dishId, dishId))).run();
        } else {
          const dish = db.select().from(customDishes).where(eq(customDishes.id, dishId)).get();
          if (!dish?.active || !dish.available || dish.soldOut) return Response.json({ error: "这道菜现在暂时不能点，请移除后重试" }, { status: 409 });
          db.insert(dinnerInviteSelections).values({ id: crypto.randomUUID(), inviteId: invite.id, guestId: guest.id, dishId, quantity }).onConflictDoUpdate({ target: [dinnerInviteSelections.inviteId, dinnerInviteSelections.guestId, dinnerInviteSelections.dishId], set: { quantity, updatedAt: new Date().toISOString() } }).run();
        }
        return Response.json({ ok: true, guestToken });
      }
      if (action === "submit") {
        const rows = db.select().from(dinnerInviteSelections).where(eq(dinnerInviteSelections.inviteId, invite.id)).all();
        const aggregate = new Map<string, number>();
        rows.forEach(item => { if (item.quantity > 0) aggregate.set(item.dishId, (aggregate.get(item.dishId) || 0) + item.quantity); });
        if (!aggregate.size) return Response.json({ error: "请先选几道菜" }, { status: 400 });
        const catalog = db.select().from(customDishes).all();
        const unavailable = [...aggregate.keys()].filter(id => !catalog.some(d => d.id === id && d.active && d.available && !d.soldOut));
        if (unavailable.length) return Response.json({ error: "已选菜品有下架或售罄，请先移除这些菜再提交", unavailableDishIds: unavailable }, { status: 409 });
        const normalized = Array.from(aggregate, ([dishId, quantity]) => ({ dishId, quantity }));
        const dishSnapshot = normalized.map(item => {
          const dish = catalog.find(d => d.id === item.dishId)!;
          return { dishId: dish.id, name: dish.name, baseServings: dish.baseServings, ingredients: parseList(dish.ingredients), steps: parseList(dish.steps), minutes: dish.minutes, recipeSummary: dish.recipeSummary, source: dish.source, difficulty: dish.difficulty };
        });
        const participants = db.select().from(dinnerInviteGuests).where(eq(dinnerInviteGuests.inviteId, invite.id)).all();
        const count = Number(payload.guestCount);
        if (!Number.isInteger(count) || count < 1 || count > 20) return Response.json({ error: "用餐人数需为 1–20 人" }, { status: 400 });
        if (!validMealDate(invite.mealDate)) return Response.json({ error: "请主厨设置有效的饭局日期" }, { status: 400 });
        const incomingNote = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
        // Keep previously submitted dietary restrictions, including legacy notes.
        const addition = incomingNote ? guest.displayName + "：" + incomingNote : "";
        const note = existing?.note ? existing.note.split("\n").includes(addition) || !addition ? existing.note : existing.note + "\n" + addition : addition;
        const values = { customerName: existing?.customerName || "多人饭局（" + participants.map(g => g.displayName).join("、").slice(0, 60) + "）", mealDate: existing?.mealDate || invite.mealDate, guestCount: existing?.guestCount || Math.min(20, Math.max(count, participants.length)), note, dishes: JSON.stringify(normalized), dishSnapshot: JSON.stringify(dishSnapshot) };
        const order = existing
          ? db.update(orders).set(values).where(eq(orders.id, existing.id)).returning().get()
          : db.insert(orders).values({ ...values, id: crypto.randomUUID(), inviteId: invite.id, guestToken: crypto.randomUUID().replaceAll("-", "") }).returning().get();
        db.update(dinnerInvites).set({ sharedOrderId: order.id, updatedAt: new Date().toISOString() }).where(eq(dinnerInvites.id, invite.id)).run();
        return Response.json({ ok: true, guestToken, order, orderToken: order.guestToken });
      }
      return Response.json({ ok: true, guestToken });
    })();
  } catch {
    return Response.json({ error: "饭局保存失败，请稍后重试" }, { status: 400 });
  }
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withDataWrite(() => handlePOST(...args)); }
