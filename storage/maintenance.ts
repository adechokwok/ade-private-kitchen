import "server-only";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDataDir } from "./paths";

const runtime = globalThis as typeof globalThis & { __adeWrites?: { active: number; importing: boolean } };
const state = runtime.__adeWrites ??= { active: 0, importing: false };
const marker = () => path.join(getDataDir(), "import-recovery-required.json");
export async function withDataWrite<T>(run: () => Promise<T>): Promise<T | Response> {
  if (state.importing || existsSync(marker())) return Response.json({ error: "数据正在迁移或等待恢复，请稍后再试" }, { status: 503 });
  state.active++;
  try { return await run(); } finally { state.active--; }
}
export function beginImport() {
  if (state.importing || state.active || existsSync(marker())) throw new Error("数据正在使用或等待恢复，请稍后再试");
  state.importing = true;
}
export function markImportRecovery(details: { database: string; uploads: string }) {
  mkdirSync(getDataDir(), { recursive: true });
  writeFileSync(marker(), JSON.stringify(details), { mode: 0o600 });
}
export function endImport(recovered: boolean) {
  if (recovered) rmSync(marker(), { force: true });
  state.importing = false;
}
