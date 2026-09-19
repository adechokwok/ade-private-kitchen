import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { chefApiGuard } from "../../../chef-auth";
import { getBackupDir, getDataDir } from "../../../../storage/paths";

type BackupVersion = { name: string; completedAt: string; databaseBytes: number; hasUploads: boolean; current: boolean };

async function exists(value: string) {
  try { await access(value); return true; } catch { return false; }
}

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  const root = getBackupDir();
  let lastSuccess: { snapshot?: string; completedAt?: string } = {};
  try { lastSuccess = JSON.parse(await readFile(path.join(root, "last-success.json"), "utf8")); } catch { /* no successful scheduled backup yet */ }
  let names: string[] = [];
  try { names = (await readdir(root)).filter((name) => /^snapshot-[\dTZ-]+-[a-f0-9]{8}$/.test(name)); } catch { /* backup volume may not exist yet */ }
  const versions = (await Promise.all(names.map(async (name): Promise<BackupVersion | null> => {
    try {
      const folder = path.join(root, name);
      const database = await stat(path.join(folder, "ade-kitchen.sqlite"));
      return { name, completedAt: database.mtime.toISOString(), databaseBytes: database.size, hasUploads: await exists(path.join(folder, "uploads")), current: name === lastSuccess.snapshot };
    } catch { return null; }
  }))).filter((item): item is BackupVersion => Boolean(item)).sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  const recoveryRequired = await exists(path.join(getDataDir(), "import-recovery-required.json"));
  return Response.json({
    healthy: Boolean(lastSuccess.snapshot && versions.some((item) => item.name === lastSuccess.snapshot)) && !recoveryRequired,
    lastSuccess: lastSuccess.completedAt || "",
    recoveryRequired,
    versions: versions.slice(0, 30),
  }, { headers: { "cache-control": "private, no-store" } });
}
