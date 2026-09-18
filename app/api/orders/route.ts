import { withDataWrite } from "../../../storage/maintenance";
import { validMealDate } from "../../kitchen-domain";
import { and, desc, eq } from "drizzle-orm";
import { ensureDinnerInvitesSchema, ensureMenuLibrary, ensureOrdersSchema, getDb, getSqlite } from "../../../db";
import { appSettings, customDishes, dinnerInvites, dinnerJournals, orders } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

type Item = { dishId?: string; quantity?: number };
type ChefOrderMutation = {
  id?: string;
  action?: "publish-menu" | "update-status" | "archive-order" | "delete-order";
  status?: typeof validStatuses[number];
  progressNote?: unknown;
  publishedMenu?: unknown;
};
const validStatuses = ["new", "confirmed", "shopping", "preparing", "done", "cancelled"] as const;
const validMenuTemplates = new Set(["home", "romance", "fine", "spring", "midautumn", "birthday", "housewarming", "summer", "christmas", "brunch"]);
const validMenuCourses = new Set(["starter", "main", "staple", "soup"]);

function normalizePublishedMenu(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("正式菜单内容不完整");
  const menu = value as Record<string, unknown>;
  const text = (key: string, maximum: number) => typeof menu[key] === "string" ? menu[key].trim().slice(0, maximum) : "";
  const guestCount = typeof menu.guestCount === "number" && Number.isInteger(menu.guestCount) ? Math.min(20, Math.max(1, menu.guestCount)) : undefined;
  const template = text("template", 20);
  if (!validMenuTemplates.has(template)) throw new Error("请选择有效的宴席模板");
  const rawCourses = Array.isArray(menu.courses) ? menu.courses : [];
  const courses = rawCourses.slice(0, 4).map((rawCourse) => {
    const course = rawCourse && typeof rawCourse === "object" && !Array.isArray(rawCourse) ? rawCourse as Record<string, unknown> : {};
    const id = typeof course.id === "string" ? course.id : "";
    if (!validMenuCourses.has(id)) throw new Error("正式菜单栏目不正确");
    const dishes = (Array.isArray(course.dishes) ? course.dishes : []).slice(0, 30).map((rawDish) => {
      const dish = rawDish && typeof rawDish === "object" && !Array.isArray(rawDish) ? rawDish as Record<string, unknown> : {};
      return {
        name: typeof dish.name === "string" ? dish.name.trim().slice(0, 40) : "",
        description: typeof dish.description === "string" ? dish.description.trim().slice(0, 180) : "",
      };
    }).filter((dish) => dish.name);
    return {
      id,
      label: typeof course.label === "string" ? course.label.trim().slice(0, 20) : "",
      english: typeof course.english === "string" ? course.english.trim().slice(0, 30) : "",
      dishes,
    };
  });
  if (!courses.some((course) => course.dishes.length)) throw new Error("请先把菜品排入正式菜单");
  return {
    title: text("title", 32) || "今晚家宴",
    date: text("date", 10),
    message: text("message", 70),
    template,
    templateName: text("templateName", 24),
    subtitle: text("subtitle", 60),
    occasion: text("occasion", 32),
    ...(guestCount ? { guestCount } : {}),
    chefCredit: text("chefCredit", 50),
    courses,
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "服务暂时开小差了";
}

async function mutateOrderForChef(payload: ChefOrderMutation) {
  if (!payload.id) return Response.json({ error: "请选择要处理的饭局" }, { status: 400 });
  await ensureDinnerInvitesSchema();

  if (payload.action === "publish-menu") {
    const [existing] = await getDb().select({ status: orders.status, archivedAt: orders.archivedAt }).from(orders).where(eq(orders.id, payload.id)).limit(1);
    if (!existing) return Response.json({ error: "没有找到这份订单" }, { status: 404 });
    if (existing.archivedAt || existing.status === "done" || existing.status === "cancelled") {
      return Response.json({ error: "已开饭或已归档的饭局不能再推送菜单，请重新打开订单后再操作" }, { status: 409 });
    }
    const publishedMenu = normalizePublishedMenu(payload.publishedMenu);
    const publishedMenuUpdatedAt = new Date().toISOString();
    const [order] = await getDb().update(orders).set({ publishedMenu: JSON.stringify(publishedMenu), publishedMenuUpdatedAt, menuReadAt: "" }).where(eq(orders.id, payload.id)).returning();
    return Response.json({ order });
  }

  if (payload.action === "update-status") {
    if (!payload.status || !validStatuses.includes(payload.status)) return Response.json({ error: "无效的订单状态" }, { status: 400 });
    const progressNote = typeof payload.progressNote === "string" ? payload.progressNote.trim().slice(0, 160) : "";
    const statusUpdatedAt = new Date().toISOString();
    const archivedAt = payload.status === "cancelled" ? statusUpdatedAt : payload.status === "done" ? undefined : "";
    const [order] = await getDb().update(orders).set({ status: payload.status, progressNote, statusUpdatedAt, statusReadAt: "", ...(archivedAt === undefined ? {} : { archivedAt }) }).where(eq(orders.id, payload.id)).returning();
    if (!order) return Response.json({ error: "没有找到这份订单" }, { status: 404 });
    if (payload.status === "done" || payload.status === "cancelled") await getDb().update(dinnerInvites).set({ active: 0 }).where(eq(dinnerInvites.sharedOrderId, order.id));
    return Response.json({ order });
  }

  if (payload.action === "archive-order") {
    const [existing] = await getDb().select().from(orders).where(eq(orders.id, payload.id)).limit(1);
    if (!existing) return Response.json({ error: "没有找到这场饭局" }, { status: 404 });
    if (existing.status !== "done") return Response.json({ error: "请先通知开饭，再确认归档" }, { status: 409 });
    if (existing.archivedAt) return Response.json({ order: existing });
    const [order] = await getDb().update(orders).set({ archivedAt: new Date().toISOString() }).where(eq(orders.id, payload.id)).returning();
    return Response.json({ order });
  }

  if (payload.action === "delete-order") {
    const [order] = await getDb().select().from(orders).where(eq(orders.id, payload.id)).limit(1);
    if (!order) return Response.json({ error: "没有找到这场饭局" }, { status: 404 });
    if (!order.archivedAt) {
      return Response.json({ error: "只有确认归档后的饭局可以删除" }, { status: 409 });
    }
    await ensureDinnerInvitesSchema();
    let [journal] = await getDb().select({ id: dinnerJournals.id }).from(dinnerJournals).where(eq(dinnerJournals.orderId, order.id)).limit(1);
    if (!journal && order.inviteId) [journal] = await getDb().select({ id: dinnerJournals.id }).from(dinnerJournals).where(and(eq(dinnerJournals.inviteId, order.inviteId), eq(dinnerJournals.orderId, ""))).limit(1);
    if (journal) return Response.json({ error: "这场饭局还有餐桌日记，请先在“餐桌日记”中删除日记" }, { status: 409 });
    getSqlite().transaction(() => {
      getDb().update(dinnerInvites).set({ active: 0, sharedOrderId: "" }).where(eq(dinnerInvites.sharedOrderId, payload.id!)).run();
      getDb().delete(orders).where(eq(orders.id, payload.id!)).run();
    })();
    return Response.json({ ok: true, id: payload.id });
  }

  return Response.json({ error: "无效的订单操作" }, { status: 400 });
}

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    await ensureOrdersSchema();
    const rows = await getDb().select().from(orders).orderBy(desc(orders.createdAt));
    return Response.json({ orders: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePOST(request: Request) {
  try {
    const payload = await request.json() as {
      requestId?: unknown; customerName?: unknown; mealDate?: unknown; guestCount?: unknown; note?: unknown; dishes?: Item[]; inviteToken?: unknown; action?: unknown;
    } & ChefOrderMutation;
    if (typeof payload.action === "string" && payload.action) {
      const denied = chefApiGuard(request);
      if (denied) return denied;
      return await mutateOrderForChef(payload);
    }
    const customerName = typeof payload.customerName === "string" ? payload.customerName.trim() : "";
    const mealDate = typeof payload.mealDate === "string" ? payload.mealDate : "";
    const guestCount = Number(payload.guestCount);
    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
    const items = Array.isArray(payload.dishes) ? payload.dishes : [];
    const inviteToken = typeof payload.inviteToken === "string" ? payload.inviteToken : "";
    await ensureOrdersSchema();
    const requestId = typeof payload.requestId === "string" && /^[a-z0-9-]{20,80}$/i.test(payload.requestId) ? payload.requestId : "";
    if (payload.requestId && !requestId) return Response.json({ error: "提交标识无效" }, { status: 400 });
    if (requestId) {
      const previous = getDb().select().from(orders).where(eq(orders.requestId, requestId)).get();
      if (previous) return Response.json({ order: previous, guestToken: previous.guestToken });
    }
    await ensureMenuLibrary();
    const [kitchenSetting] = await getDb().select().from(appSettings).where(eq(appSettings.key, "kitchen_open_v1")).limit(1);
    if (kitchenSetting?.value === "closed") return Response.json({ error: "阿德今天休息，菜单可以慢慢看，等绿灯亮起再来点菜吧" }, { status: 409 });
    const customRows = await getDb().select().from(customDishes).where(eq(customDishes.active, 1));
    let inviteId = "";
    let inviteDishIds: string[] | null = null;
    if (inviteToken) {
      await ensureDinnerInvitesSchema();
      const [invite] = await getDb().select().from(dinnerInvites).where(eq(dinnerInvites.token, inviteToken)).limit(1);
      if (!invite || !invite.active) return Response.json({ error: "这份饭局邀请已经结束" }, { status: 400 });
      if (invite.mode === "shared") return Response.json({ error: "请从共享饭局页面提交" }, { status: 409 });
      inviteId = invite.id;
      try { inviteDishIds = JSON.parse(invite.dishIds); } catch { inviteDishIds = []; }
    }
    const validIds = new Set(customRows.filter((dish) => dish.available && !dish.soldOut && (!inviteDishIds || inviteDishIds.includes(dish.id))).map((dish) => dish.id));
    if (items.length > 120 || items.some(item => !item || !item.dishId || !validIds.has(item.dishId) || !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10) || new Set(items.map(item => item.dishId)).size !== items.length) return Response.json({ error: "有菜品已下架、售罄或数量无效（每道 1–10 份），请检查后重新提交" }, { status: 409 });
    const normalized = items.map(item => ({ dishId: item.dishId!, quantity: Number(item.quantity) }));

    if (!customerName || customerName.length > 30) return Response.json({ error: "请填写你的称呼" }, { status: 400 });
    if (!validMealDate(mealDate)) return Response.json({ error: "请选择用餐日期" }, { status: 400 });
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) return Response.json({ error: "用餐人数需为 1–20 人" }, { status: 400 });
    if (normalized.length === 0) return Response.json({ error: "请至少选择一道菜" }, { status: 400 });

    const customCatalog = customRows.map((dish) => ({
      id: dish.id,
      name: dish.name,
      baseServings: dish.baseServings || 4,
      ingredients: (() => { try { return JSON.parse(dish.ingredients); } catch { return []; } })(),
      steps: (() => { try { return JSON.parse(dish.steps); } catch { return []; } })(),
      minutes: dish.minutes,
      recipeSummary: dish.recipeSummary,
      source: dish.source,
      difficulty: dish.difficulty,
    }));
    const catalog = customCatalog;
    const dishSnapshot = normalized.map((item) => {
      const dish = catalog.find((candidate) => candidate.id === item.dishId);
      return dish ? { dishId: dish.id, name: dish.name, baseServings: dish.baseServings, ingredients: dish.ingredients, steps: dish.steps, minutes: dish.minutes, recipeSummary: dish.recipeSummary, source: dish.source, difficulty: dish.difficulty } : null;
    }).filter(Boolean);

    await ensureOrdersSchema();
    const id = crypto.randomUUID();
    const guestToken = crypto.randomUUID().replaceAll("-", "");
    const [order] = await getDb().insert(orders).values({ requestId, id, customerName, mealDate, guestCount, note, dishes: JSON.stringify(normalized), dishSnapshot: JSON.stringify(dishSnapshot), inviteId, guestToken }).onConflictDoNothing().returning();
    if (!order && requestId) {
      const previous = getDb().select().from(orders).where(eq(orders.requestId, requestId)).get();
      if (previous) return Response.json({ order: previous, guestToken: previous.guestToken });
    }
    return Response.json({ order, guestToken }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handlePATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const payload = await request.json() as ChefOrderMutation;
    return await mutateOrderForChef({ ...payload, action: payload.action || "update-status" });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

async function handleDELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const id = new URL(request.url).searchParams.get("id")?.trim();
    return await mutateOrderForChef({ id, action: "delete-order" });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withDataWrite(() => handlePOST(...args)); }

export async function PATCH(...args: Parameters<typeof handlePATCH>) { return withDataWrite(() => handlePATCH(...args)); }

export async function DELETE(...args: Parameters<typeof handleDELETE>) { return withDataWrite(() => handleDELETE(...args)); }
