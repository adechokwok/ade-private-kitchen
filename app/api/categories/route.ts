import { asc, eq, sql } from "drizzle-orm";
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
  const payload = await request.json() as { name?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
  if (!name) return Response.json({ error: "请填写分类名称" }, { status: 400 });
  await ensureMenuLibrary();
  const existing = await getDb().select().from(menuCategories).where(eq(menuCategories.name, name)).limit(1);
  if (existing.length) return Response.json({ category: existing[0] });
  const [count] = await getDb().select({ value: sql<number>`count(*)` }).from(menuCategories);
  const [category] = await getDb().insert(menuCategories).values({ id: crypto.randomUUID(), name, sortOrder: Number(count?.value || 0) }).returning();
  return Response.json({ category }, { status: 201 });
}

export async function PATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; name?: unknown; direction?: unknown; mergeInto?: unknown };
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

  const mergeInto = typeof payload.mergeInto === "string" ? payload.mergeInto.trim().slice(0, 30) : "";
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 30) : "";
  const nextName = mergeInto || name;
  if (nextName && nextName !== current.name) {
    const target = await getDb().select().from(menuCategories).where(eq(menuCategories.name, nextName)).limit(1);
    if (target.length && !mergeInto) return Response.json({ error: "已经有同名分类，可使用合并功能" }, { status: 409 });
    await getDb().update(customDishes).set({ category: nextName }).where(eq(customDishes.category, current.name));
    if (target.length) await getDb().delete(menuCategories).where(eq(menuCategories.id, current.id));
    else await getDb().update(menuCategories).set({ name: nextName }).where(eq(menuCategories.id, current.id));
  }

  const rows = await getDb().select().from(menuCategories).orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt));
  return Response.json({ categories: rows });
}
