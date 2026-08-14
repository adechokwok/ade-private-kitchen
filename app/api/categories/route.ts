import { asc, desc, eq, sql } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensureMenuLibrary, getDb } from "../../../db";
import { customDishes, menuCategories } from "../../../db/schema";

export async function GET() {
  await ensureMenuLibrary();
  const rows = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows });
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { name?: unknown; emoji?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
  const emoji = typeof payload.emoji === "string" ? payload.emoji.trim().slice(0, 16) : "";
  if (!name) return Response.json({ error: "请填写分类名称" }, { status: 400 });
  await ensureMenuLibrary();
  const db = getDb();
  const existing = await db.select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1);
  if (existing.length) return Response.json({ category: existing[0] });
  const [order] = await db.select({ value: sql<number>`coalesce(max(${menuCategories.sortOrder}), -1) + 1` }).from(menuCategories);
  const id = crypto.randomUUID();
  await db.insert(menuCategories).values({ id, name, emoji, sortOrder: Number(order?.value || 0) });
  const [category] = await db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  return Response.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; name?: unknown; emoji?: unknown; direction?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  await ensureMenuLibrary();
  const db = getDb();
  const [current] = await db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  if (!current) return Response.json({ error: "没有找到这个分类" }, { status: 404 });

  if (payload.direction === -1 || payload.direction === 1) {
    const rows = await db.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
    const index = rows.findIndex((item) => item.id === id);
    const targetIndex = index + Number(payload.direction);
    if (index >= 0 && targetIndex >= 0 && targetIndex < rows.length) {
      const [moved] = rows.splice(index, 1);
      rows.splice(targetIndex, 0, moved);
      await db.transaction(async (tx) => {
        for (const [nextIndex, item] of rows.entries()) {
          await tx.update(menuCategories).set({ sortOrder: nextIndex }).where(eq(menuCategories.id, item.id));
        }
      });
    }
  }

  if (typeof payload.emoji === "string") {
    await db.update(menuCategories).set({ emoji: payload.emoji.trim().slice(0, 16) }).where(eq(menuCategories.id, current.id));
  }

  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
  if (name && name !== current.name) {
    const target = await db.select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1);
    if (target.length) return Response.json({ error: "已经有同名分类，请换一个名称" }, { status: 409 });
    await db.update(customDishes).set({ category: name }).where(eq(customDishes.category, current.name));
    await db.update(menuCategories).set({ name }).where(eq(menuCategories.id, current.id));
  }

  const rows = await db.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows });
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  await ensureMenuLibrary();
  const db = getDb();
  const [current] = await db.select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  if (!current) return Response.json({ error: "没有找到这个分类" }, { status: 404 });
  if (current.name === "未分类") return Response.json({ error: "“未分类”用于接收待整理菜品，不能删除" }, { status: 409 });

  const movedCount = await db.transaction(async (tx) => {
    let [fallback] = await tx.select().from(menuCategories).where(eq(menuCategories.name, "未分类")).limit(1);
    if (!fallback) {
      const [order] = await tx.select({ value: sql<number>`coalesce(max(${menuCategories.sortOrder}), -1) + 1` }).from(menuCategories);
      const fallbackId = crypto.randomUUID();
      await tx.insert(menuCategories).values({ id: fallbackId, name: "未分类", emoji: "📥", sortOrder: Number(order?.value || 0) });
      [fallback] = await tx.select().from(menuCategories).where(eq(menuCategories.id, fallbackId)).limit(1);
    }

    const movedDishes = await tx.select({ id: customDishes.id }).from(customDishes)
      .where(eq(customDishes.category, current.name))
      .orderBy(desc(customDishes.active), asc(customDishes.sortOrder), asc(customDishes.createdAt));
    const nextDishOrder = await tx.select({ value: sql<number>`coalesce(max(${customDishes.sortOrder}), -1) + 1` }).from(customDishes).where(eq(customDishes.category, fallback.name));
    for (const [index, dish] of movedDishes.entries()) {
      await tx.update(customDishes).set({ category: fallback.name, sortOrder: Number(nextDishOrder[0]?.value || 0) + index }).where(eq(customDishes.id, dish.id));
    }
    const unclassified = await tx.select({ id: customDishes.id }).from(customDishes)
      .where(eq(customDishes.category, fallback.name))
      .orderBy(desc(customDishes.active), asc(customDishes.sortOrder), asc(customDishes.createdAt));
    for (const [index, dish] of unclassified.entries()) {
      await tx.update(customDishes).set({ sortOrder: index }).where(eq(customDishes.id, dish.id));
    }
    await tx.delete(menuCategories).where(eq(menuCategories.id, current.id));
    const remaining = await tx.select({ id: menuCategories.id }).from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
    for (const [index, item] of remaining.entries()) {
      await tx.update(menuCategories).set({ sortOrder: index }).where(eq(menuCategories.id, item.id));
    }
    return movedDishes.length;
  });

  const rows = await db.select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows, movedCount });
}
