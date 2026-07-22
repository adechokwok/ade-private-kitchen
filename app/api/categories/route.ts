import { asc, eq, sql } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensureMenuLibrary, getDb, getSqlite } from "../../../db";
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
  const existing = await getDb().select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1);
  if (existing.length) return Response.json({ category: existing[0] });
  const [count] = await getDb().select({ value: sql<number>`count(*)` }).from(menuCategories);
  const [category] = await getDb().insert(menuCategories).values({ id: crypto.randomUUID(), name, emoji, sortOrder: Number(count?.value || 0) }).returning();
  return Response.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; name?: unknown; emoji?: unknown; direction?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  await ensureMenuLibrary();
  const [current] = await getDb().select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  if (!current) return Response.json({ error: "没有找到这个分类" }, { status: 404 });

  if (payload.direction === -1 || payload.direction === 1) {
    const rows = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
    const index = rows.findIndex((item) => item.id === id);
    const target = rows[index + payload.direction];
    if (target) {
      await getDb().update(menuCategories).set({ sortOrder: target.sortOrder }).where(eq(menuCategories.id, current.id));
      await getDb().update(menuCategories).set({ sortOrder: current.sortOrder }).where(eq(menuCategories.id, target.id));
    }
  }

  if (typeof payload.emoji === "string") {
    await getDb().update(menuCategories).set({ emoji: payload.emoji.trim().slice(0, 16) }).where(eq(menuCategories.id, current.id));
  }

  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
  if (name && name !== current.name) {
    const target = await getDb().select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1);
    if (target.length) return Response.json({ error: "已经有同名分类，请换一个名称" }, { status: 409 });
    await getDb().update(customDishes).set({ category: name }).where(eq(customDishes.category, current.name));
    await getDb().update(menuCategories).set({ name }).where(eq(menuCategories.id, current.id));
  }

  const rows = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows });
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  await ensureMenuLibrary();
  const [current] = await getDb().select().from(menuCategories).where(eq(menuCategories.id, id)).limit(1);
  if (!current) return Response.json({ error: "没有找到这个分类" }, { status: 404 });
  if (current.name === "未分类") return Response.json({ error: "“未分类”用于接收待整理菜品，不能删除" }, { status: 409 });

  const sqlite = getSqlite();
  const movedCount = sqlite.transaction(() => {
    const nextOrder = Number((sqlite.prepare("SELECT COALESCE(MAX(sort_order), -1) + 1 AS value FROM menu_categories").get() as { value: number }).value);
    sqlite.prepare("INSERT OR IGNORE INTO menu_categories (id, name, emoji, sort_order) VALUES (?, '未分类', '📥', ?)").run(crypto.randomUUID(), nextOrder);
    const moved = sqlite.prepare("UPDATE custom_dishes SET category = '未分类' WHERE category = ?").run(current.name).changes;
    sqlite.prepare("DELETE FROM menu_categories WHERE id = ?").run(current.id);
    return moved;
  })();

  const rows = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows, movedCount });
}
