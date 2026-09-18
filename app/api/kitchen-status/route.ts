import { eq } from "drizzle-orm";
import { ensureMenuLibrary, getDb } from "../../../db";
import { appSettings } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const key = "kitchen_open_v1";

export async function GET() {
  await ensureMenuLibrary();
  const [setting] = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return Response.json({ open: setting?.value !== "closed" });
}

export async function PUT(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { open?: unknown };
  if (typeof payload.open !== "boolean") return Response.json({ error: "营业状态不正确" }, { status: 400 });
  await ensureMenuLibrary();
  const value = payload.open ? "open" : "closed";
  await getDb().insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } });
  return Response.json({ open: payload.open });
}
