import Database from "better-sqlite3";
import { cp, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
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

async function pruneOldDatabases(current) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  for (const name of await readdir(backupDir)) {
    // Legacy ade-kitchen-*.sqlite and uploads-latest are preserved.
    if (!/^snapshot-[\dTZ-]+-[a-f0-9]{8}$/.test(name) || name === current) continue;
    const filePath = path.join(backupDir, name);
    if (await exists(path.join(filePath, "manifest.json")) && (await stat(filePath)).mtimeMs < cutoff) await rm(filePath, { recursive: true, force: true });
  }
}

async function backupOnce() {
  await mkdir(backupDir, { recursive: true });
  if (!(await exists(databasePath))) {
    console.log("[backup] database has not been created yet; waiting for the app to start");
    return;
  }

  if (await exists(path.join(dataDir, "import-recovery-required.json"))) throw new Error("Import recovery pending; previous backups retained");
  const name = `snapshot-${stamp()}-${crypto.randomUUID().slice(0, 8)}`;
  const temporary = path.join(backupDir, `.${name}`);
  const destination = path.join(backupDir, name);
  await mkdir(temporary);
  try {
    const database = new Database(databasePath, { readonly: true, fileMustExist: true });
    try { await database.backup(path.join(temporary, "ade-kitchen.sqlite")); } finally { database.close(); }
    if (await exists(uploadsPath)) await cp(uploadsPath, path.join(temporary, "uploads"), { recursive: true });
    else await mkdir(path.join(temporary, "uploads"));
    await writeFile(path.join(temporary, "manifest.json"), JSON.stringify({ version: 1, completedAt: new Date().toISOString(), database: "ade-kitchen.sqlite", uploads: "uploads", consistency: "live-copy" }));
    await rename(temporary, destination);
    const pointer = path.join(backupDir, `.last-success-${crypto.randomUUID()}.json`);
    await writeFile(pointer, JSON.stringify({ snapshot: name, completedAt: new Date().toISOString() }));
    await rename(pointer, path.join(backupDir, "last-success.json"));
  } catch (error) {
    await rm(temporary, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  await pruneOldDatabases(name);
  console.log(`[backup] completed ${destination}`);
}

async function run() {
  if (!process.argv.includes("--watch")) return backupOnce();
  try { await backupOnce(); } catch (error) { console.error("[backup] failed", error); }
  const interval = intervalHours * 60 * 60 * 1000;
  const schedule = () => setTimeout(async () => {
    try { await backupOnce(); } catch (error) { console.error("[backup] failed", error); }
    schedule();
  }, interval);
  schedule();
}

run().catch((error) => { console.error("[backup] fatal", error); process.exitCode = 1; });
