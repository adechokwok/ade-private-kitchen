import { withDataWrite } from "../../../storage/maintenance";
import { eq } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensureShoppingChecksSchema, getDb } from "../../../db";
import { shoppingChecks } from "../../../db/schema";

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensureShoppingChecksSchema();
  const rows = await getDb().select().from(shoppingChecks);
  return Response.json({ checks: Object.fromEntries(rows.map((row) => [row.itemKey, Boolean(row.checked)])) });
}

async function handlePATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { itemKey?: unknown; checked?: unknown; reset?: unknown };
  await ensureShoppingChecksSchema();

  if (payload.reset === true) {
    await getDb().delete(shoppingChecks);
    return Response.json({ ok: true });
  }

  const itemKey = typeof payload.itemKey === "string" ? payload.itemKey : "";
  if (!itemKey || itemKey.length > 20000 || typeof payload.checked !== "boolean") return Response.json({ error: "无效的采购项目" }, { status: 400 });
  const existing = await getDb().select().from(shoppingChecks).where(eq(shoppingChecks.itemKey, itemKey)).limit(1);
  if (existing.length) {
    await getDb().update(shoppingChecks).set({ checked: payload.checked ? 1 : 0, updatedAt: new Date().toISOString() }).where(eq(shoppingChecks.itemKey, itemKey));
  } else {
    await getDb().insert(shoppingChecks).values({ itemKey, checked: payload.checked ? 1 : 0 });
  }
  return Response.json({ ok: true });
}

export async function PATCH(...args: Parameters<typeof handlePATCH>) { return withDataWrite(() => handlePATCH(...args)); }
