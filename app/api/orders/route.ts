import { desc, eq } from "drizzle-orm";
import { dishes as menu } from "../../menu";
import { ensureCustomDishesSchema, ensureOrdersSchema, getDb } from "../../../db";
import { customDishes, orders } from "../../../db/schema";

type Item = { dishId?: string; quantity?: number };
const validStatuses = ["new", "confirmed", "done"] as const;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "服务暂时开小差了";
}

export async function GET() {
  try {
    await ensureOrdersSchema();
    const rows = await getDb().select().from(orders).orderBy(desc(orders.createdAt)).limit(100);
    return Response.json({ orders: rows });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      customerName?: unknown; mealDate?: unknown; guestCount?: unknown; note?: unknown; dishes?: Item[];
    };
    const customerName = typeof payload.customerName === "string" ? payload.customerName.trim() : "";
    const mealDate = typeof payload.mealDate === "string" ? payload.mealDate : "";
    const guestCount = Number(payload.guestCount);
    const note = typeof payload.note === "string" ? payload.note.trim().slice(0, 200) : "";
    const items = Array.isArray(payload.dishes) ? payload.dishes : [];
    await ensureCustomDishesSchema();
    const customRows = await getDb().select({ id: customDishes.id }).from(customDishes).where(eq(customDishes.active, 1));
    const validIds = new Set([...menu.map((dish) => dish.id), ...customRows.map((dish) => dish.id)]);
    const normalized = items
      .filter((item) => item.dishId && validIds.has(item.dishId) && Number.isInteger(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 10)
      .map((item) => ({ dishId: item.dishId as string, quantity: Number(item.quantity) }));

    if (!customerName || customerName.length > 30) return Response.json({ error: "请填写你的称呼" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate)) return Response.json({ error: "请选择用餐日期" }, { status: 400 });
    if (!Number.isInteger(guestCount) || guestCount < 1 || guestCount > 20) return Response.json({ error: "用餐人数需为 1–20 人" }, { status: 400 });
    if (normalized.length === 0) return Response.json({ error: "请至少选择一道菜" }, { status: 400 });

    await ensureOrdersSchema();
    const id = crypto.randomUUID();
    const [order] = await getDb().insert(orders).values({ id, customerName, mealDate, guestCount, note, dishes: JSON.stringify(normalized) }).returning();
    return Response.json({ order }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json() as { id?: string; status?: typeof validStatuses[number] };
    if (!payload.id || !payload.status || !validStatuses.includes(payload.status)) return Response.json({ error: "无效的订单状态" }, { status: 400 });
    await ensureOrdersSchema();
    const [order] = await getDb().update(orders).set({ status: payload.status }).where(eq(orders.id, payload.id)).returning();
    if (!order) return Response.json({ error: "没有找到这份订单" }, { status: 404 });
    return Response.json({ order });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
