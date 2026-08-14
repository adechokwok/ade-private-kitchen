import { ensureAllSchema, getMysqlPool } from "../../../db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureAllSchema();
    await getMysqlPool().query("SELECT 1");
    return Response.json({
      ok: true,
      service: "ade-private-kitchen",
      database: "mysql",
      storage: "cos",
      time: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : "health check failed" }, { status: 503 });
  }
}
