import Database from "better-sqlite3";
import { cp, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.env.DATA_DIR || "/data");
const backupDir = path.resolve(process.env.BACKUP_DIR || "/backups");
const databasePath = path.resolve(process.env.DATABASE_PATH || path.join(dataDir, "ade-kitchen.sqlite"));
const uploadsPath = path.resolve(process.env.UPLOADS_DIR || path.join(dataDir, "uploads"));
const retentionDays = Math.max(1, Number(process.env.BACKUP_RETENTION_DAYS || 14));
const intervalHours = Math.max(1, Number(process.env.BACKUP_INTERVAL_HOURS || 24));

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function exists(filePath) {
  try { await stat(filePath); return true; } catch { return false; }
}

async function pruneOldDatabases() {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of await readdir(backupDir)) {
    if (!/^ade-kitchen-.*\.sqlite$/.test(name)) continue;
    const filePath = path.join(backupDir, name);
    if ((await stat(filePath)).mtimeMs < cutoff) await rm(filePath, { force: true });
  }
}

async function backupOnce() {
  await mkdir(backupDir, { recursive: true });
  if (!(await exists(databasePath))) {
    console.log("[backup] database has not been created yet; waiting for the app to start");
    return;
  }

  const destination = path.join(backupDir, `ade-kitchen-${stamp()}.sqlite`);
  const database = new Database(databasePath, { readonly: true, fileMustExist: true });
  try { await database.backup(destination); } finally { database.close(); }

  if (await exists(uploadsPath)) {
    const temporary = path.join(backupDir, `.uploads-${crypto.randomUUID()}`);
    const latest = path.join(backupDir, "uploads-latest");
    await cp(uploadsPath, temporary, { recursive: true, force: true });
    await rm(latest, { recursive: true, force: true });
    await rename(temporary, latest);
  }
  await pruneOldDatabases();
  console.log(`[backup] completed ${destination}`);
}

async function run() {
  await backupOnce();
  if (!process.argv.includes("--watch")) return;
  const interval = intervalHours * 60 * 60 * 1000;
  const schedule = () => setTimeout(async () => {
    try { await backupOnce(); } catch (error) { console.error("[backup] failed", error); }
    schedule();
  }, interval);
  schedule();
}

run().catch((error) => { console.error("[backup] fatal", error); process.exitCode = 1; });
