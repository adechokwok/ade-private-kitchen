import { ensureAllSchema, getSqlite } from "../../../db";
import { ensureDataDirectories } from "../../../storage/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureDataDirectories();
    await ensureAllSchema();
    getSqlite().prepare("SELECT 1").get();
    return Response.json({
      ok: true,
      service: "ade-private-kitchen",
      storage: "nas-local",
      time: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "health check failed" }, { status: 503 });
  }
}
