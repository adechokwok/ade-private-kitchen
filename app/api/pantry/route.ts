import { asc, eq } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensurePantrySchema, getDb } from "../../../db";
import { pantryItems } from "../../../db/schema";

const types = new Set(["生鲜", "蔬菜", "调料", "其他"]);

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensurePantrySchema();
  const items = await getDb().select().from(pantryItems).orderBy(asc(pantryItems.type), asc(pantryItems.name));
  return Response.json({ items });
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { name?: unknown; amount?: unknown; unit?: unknown; type?: unknown; location?: unknown };
  const name = typeof payload.name === "string" ? payload.name.trim().slice(0, 40) : "";
  const amount = Number(payload.amount);
  const unit = typeof payload.unit === "string" ? payload.unit.trim().slice(0, 12) : "";
  const type = typeof payload.type === "string" && types.has(payload.type) ? payload.type : "其他";
  const location = typeof payload.location === "string" ? payload.location.trim().slice(0, 30) || "家中库存" : "家中库存";
  if (!name || !unit || !Number.isFinite(amount) || amount <= 0) return Response.json({ error: "请填写完整的库存名称、数量和单位" }, { status: 400 });
  await ensurePantrySchema();
  const [item] = await getDb().insert(pantryItems).values({ id: crypto.randomUUID(), name, amount, unit, type, location }).returning();
  return Response.json({ item }, { status: 201 });
}

export async function DELETE(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return Response.json({ error: "缺少库存编号" }, { status: 400 });
  await ensurePantrySchema();
  await getDb().delete(pantryItems).where(eq(pantryItems.id, id));
  return Response.json({ ok: true });
}
