import { withDataWrite } from "../../../storage/maintenance";
import { asc, eq } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensurePantrySchema, getDb } from "../../../db";
import { pantryItems } from "../../../db/schema";
import { normalizeIngredientAmount } from "../../ingredient-units";

const types = new Set(["生鲜", "蔬菜", "调料", "其他"]);

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensurePantrySchema();
  const items = await getDb().select().from(pantryItems).orderBy(asc(pantryItems.type), asc(pantryItems.name));
  return Response.json({ items });
}

async function handlePOST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { name?: unknown; amount?: unknown; unit?: unknown; type?: unknown; location?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 40) : "";
  const inputAmount = Number(payload.amount);
  const inputUnit = typeof payload.unit === "string" ? payload.unit.trim().slice(0, 12) : "";
  const normalized = normalizeIngredientAmount(inputAmount, inputUnit);
  const amount = normalized.amount;
  const unit = normalized.unit;
  const type = typeof payload.type === "string" && types.has(payload.type) ? payload.type : "其他";
  const location = typeof payload.location === "string" ? payload.location.trim().slice(0, 30) || "家中库存" : "家中库存";
  if (!name || !unit || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "请填写完整的库存名称、数量和单位" }, { status: 400 });
  await ensurePantrySchema();
  const [item] = await getDb().insert(pantryItems).values({ id: crypto.randomUUID(), name, amount, unit, type, location }).returning();
  return Response.json({ item }, { status: 201 });
}

async function handlePATCH(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { id?: unknown; amount?: unknown; unit?: unknown; action?: unknown };
  const id = typeof payload.id === "string" ? payload.id : "";
  const inputAmount = Number(payload.amount);
  const inputUnit = typeof payload.unit === "string" ? payload.unit.trim().slice(0, 12) : "";
  if (!id || !Number.isFinite(inputAmount) || inputAmount < 0 || !inputUnit) return Response.json({ error: "请填写有效的库存数量和单位" }, { status: 400 });
  await ensurePantrySchema();
  const [existing] = await getDb().select().from(pantryItems).where(eq(pantryItems.id, id)).limit(1);
  if (!existing) return Response.json({ error: "没有找到这项库存" }, { status: 404 });
  const normalized = normalizeIngredientAmount(inputAmount, inputUnit);
  const nextAmount = payload.action === "consume" ? Math.max(0, existing.amount - normalized.amount) : normalized.amount;
  const [item] = await getDb().update(pantryItems).set({ amount: nextAmount, unit: normalized.unit }).where(eq(pantryItems.id, id)).returning();
  return Response.json({ item, consumed: payload.action === "consume" ? Math.min(existing.amount, normalized.amount) : 0 });
}

async function handleDELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "缺少库存编号" }, { status: 400 });
  await ensurePantrySchema();
  await getDb().delete(pantryItems).where(eq(pantryItems.id, id));
  return Response.json({ ok: true });
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withDataWrite(() => handlePOST(...args)); }

export async function PATCH(...args: Parameters<typeof handlePATCH>) { return withDataWrite(() => handlePATCH(...args)); }

export async function DELETE(...args: Parameters<typeof handleDELETE>) { return withDataWrite(() => handleDELETE(...args)); }
