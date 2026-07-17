import { eq } from "drizzle-orm";
import { ensureMenuLibrary, getDb } from "../../../db";
import { appSettings } from "../../../db/schema";
import { chefApiGuard } from "../../chef-auth";

const key = "recipe_preferences_v1";

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensureMenuLibrary();
  const [setting] = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return Response.json({ preferences: setting?.value || "" });
}

export async function PUT(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const payload = await request.json() as { preferences?: unknown };
  const preferences = typeof payload.preferences === "string" ? payload.preferences.trim().slice(0, 1600) : "";
  await ensureMenuLibrary();
  await getDb().insert(appSettings).values({ key, value: preferences }).onConflictDoUpdate({ target: appSettings.key, set: { value: preferences } });
  return Response.json({ preferences });
}
