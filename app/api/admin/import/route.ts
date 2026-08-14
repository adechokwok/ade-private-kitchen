import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";
import unzipper from "unzipper";

import { chefApiGuard } from "../../../chef-auth";
import { ensureAllSchema, getDb, getSqlite } from "../../../../db";
import * as schema from "../../../../db/schema";
import { safePath } from "../../../../storage/uploads";
import { ensureDataDirectories, getDataDir, getUploadsDir } from "../../../../storage/paths";

export const runtime = "nodejs";

const maxZipBytes = 300 * 1024 * 1024;
const maxExpandedBytes = 600 * 1024 * 1024;
const maxEntries = 5000;
const protectedSettingKey = /(session|secret|password|token|api[_-]?key)/i;
const tableKeys = [
  "custom_dishes", "menu_categories", "orders", "dinner_invites", "dinner_invite_guests",
  "dinner_invite_selections", "dinner_journals", "pantry_items", "shopping_checks", "app_settings",
] as const;
type TableKey = typeof tableKeys[number];
type ExportPayload = { version: number; exportedAt: string; tables: Record<TableKey, unknown> };
class ImportInputError extends Error {}

function relativeKey(value: string) {
  if (!value || value.includes("\\") || path.posix.isAbsolute(value)) throw new ImportInputError("压缩包包含无效的图片路径");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new ImportInputError("压缩包包含不安全的图片路径");
  // Run the existing upload path guard as a second, shared safety check.
  safePath(value);
  return value;
}

function rows<T>(payload: ExportPayload, key: TableKey): T[] {
  if (!Object.prototype.hasOwnProperty.call(payload.tables, key)) throw new ImportInputError(`导出文件缺少 ${key} 数据表`);
  const value = payload.tables?.[key];
  if (!Array.isArray(value)) throw new ImportInputError(`导出文件中的 ${key} 不是列表`);
  return value as T[];
}

function assertObjectRows(value: unknown[], key: TableKey) {
  if (value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new ImportInputError(`导出文件中的 ${key} 有无效记录`);
}

async function readArchive(file: File, stagingDir: string) {
  if (!file.size) throw new ImportInputError("请选择数据导出 ZIP 文件");
  if (file.size > maxZipBytes) throw new ImportInputError("导出文件不能超过 300MB");
  const directory = await unzipper.Open.buffer(Buffer.from(await file.arrayBuffer()));
  if (directory.files.length > maxEntries) throw new ImportInputError(`压缩包文件过多，最多支持 ${maxEntries} 个文件`);
  let expandedBytes = 0;
  let exportJson = "";
  const uploadsDir = path.join(stagingDir, "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const keys = new Set<string>();
  for (const entry of directory.files) {
    const entryPath = entry.path.replace(/\\/g, "/");
    if (entry.type === "Directory") continue;
    if (entryPath === "export.json") {
      if (exportJson) throw new ImportInputError("压缩包中有多个 export.json");
      const bytes = await entry.buffer();
      expandedBytes += bytes.byteLength;
      exportJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      continue;
    }
    if (!entryPath.startsWith("uploads/")) throw new ImportInputError("压缩包只能包含 export.json 和 uploads 文件");
    const key = relativeKey(entryPath.slice("uploads/".length));
    if (keys.has(key)) throw new ImportInputError(`压缩包中有重复图片：${key}`);
    keys.add(key);
    const bytes = await entry.buffer();
    expandedBytes += bytes.byteLength;
    if (expandedBytes > maxExpandedBytes) throw new ImportInputError("解压后的数据超过 600MB 限制");
    const target = path.resolve(uploadsDir, key);
    const stagingRoot = path.resolve(uploadsDir);
    if (!target.startsWith(`${stagingRoot}${path.sep}`)) throw new ImportInputError("压缩包包含不安全的图片路径");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { mode: 0o640 });
  }
  if (!exportJson) throw new ImportInputError("压缩包中没有找到 export.json");
  let payload: ExportPayload;
  try { payload = JSON.parse(exportJson) as ExportPayload; }
  catch { throw new ImportInputError("export.json 不是有效的 JSON"); }
  if (!payload || payload.version !== 1 || typeof payload.exportedAt !== "string" || !payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) throw new ImportInputError("不支持的导出文件版本");
  const unknownTable = Object.keys(payload.tables).find((key) => !tableKeys.includes(key as TableKey));
  if (unknownTable) throw new ImportInputError(`导出文件包含当前版本不认识的数据表：${unknownTable}`);
  for (const key of tableKeys) assertObjectRows(rows(payload, key), key);
  return { payload, imageCount: keys.size };
}

// Keep staging and rollback copies on the container's local filesystem. COS/FUSE
// mounts can handle ordinary streamed file writes, but may reject rename,
// copy_file_range and other filesystem-level optimizations.
async function copyRegularFile(source: string, target: string) {
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(createReadStream(source), createWriteStream(target, { mode: 0o640 }));
}

async function copyDirectoryContents(source: string, target: string) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, targetPath);
      continue;
    }
    await copyRegularFile(sourcePath, targetPath);
  }
}

async function clearDirectoryContents(directory: string) {
  await mkdir(directory, { recursive: true });
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    await rm(path.join(directory, entry.name), { recursive: true, force: true });
  }
}

function replaceDatabase(payload: ExportPayload) {
  const db = getDb();
  const sqlite = getSqlite();
  const tableRows = {
    customDishes: rows<typeof schema.customDishes.$inferInsert>(payload, "custom_dishes"),
    menuCategories: rows<typeof schema.menuCategories.$inferInsert>(payload, "menu_categories"),
    orders: rows<typeof schema.orders.$inferInsert>(payload, "orders"),
    dinnerInvites: rows<typeof schema.dinnerInvites.$inferInsert>(payload, "dinner_invites"),
    dinnerInviteGuests: rows<typeof schema.dinnerInviteGuests.$inferInsert>(payload, "dinner_invite_guests"),
    dinnerInviteSelections: rows<typeof schema.dinnerInviteSelections.$inferInsert>(payload, "dinner_invite_selections"),
    dinnerJournals: rows<typeof schema.dinnerJournals.$inferInsert>(payload, "dinner_journals"),
    pantryItems: rows<typeof schema.pantryItems.$inferInsert>(payload, "pantry_items"),
    shoppingChecks: rows<typeof schema.shoppingChecks.$inferInsert>(payload, "shopping_checks"),
    appSettings: rows<typeof schema.appSettings.$inferInsert>(payload, "app_settings").filter((row) => !protectedSettingKey.test(String(row.key || ""))),
  };
  const clearTables = ["dinner_invite_selections", "dinner_invite_guests", "dinner_journals", "dinner_invites", "orders", "shopping_checks", "pantry_items", "custom_dishes", "menu_categories"];
  const transaction = sqlite.transaction(() => {
    for (const table of clearTables) sqlite.prepare(`DELETE FROM ${table}`).run();
    if (tableRows.customDishes.length) db.insert(schema.customDishes).values(tableRows.customDishes).run();
    if (tableRows.menuCategories.length) db.insert(schema.menuCategories).values(tableRows.menuCategories).run();
    if (tableRows.orders.length) db.insert(schema.orders).values(tableRows.orders).run();
    if (tableRows.dinnerInvites.length) db.insert(schema.dinnerInvites).values(tableRows.dinnerInvites).run();
    if (tableRows.dinnerInviteGuests.length) db.insert(schema.dinnerInviteGuests).values(tableRows.dinnerInviteGuests).run();
    if (tableRows.dinnerInviteSelections.length) db.insert(schema.dinnerInviteSelections).values(tableRows.dinnerInviteSelections).run();
    if (tableRows.dinnerJournals.length) db.insert(schema.dinnerJournals).values(tableRows.dinnerJournals).run();
    if (tableRows.pantryItems.length) db.insert(schema.pantryItems).values(tableRows.pantryItems).run();
    if (tableRows.shoppingChecks.length) db.insert(schema.shoppingChecks).values(tableRows.shoppingChecks).run();
    const importedSettingKeys = new Set(tableRows.appSettings.map((setting) => String(setting.key)));
    const deleteSetting = sqlite.prepare("DELETE FROM app_settings WHERE key = ?");
    const existingSettings = db.select({ key: schema.appSettings.key }).from(schema.appSettings).all();
    for (const setting of existingSettings) {
      const key = String(setting.key);
      if (!protectedSettingKey.test(key) && !importedSettingKeys.has(key)) deleteSetting.run(key);
    }
    const upsertSetting = sqlite.prepare("INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
    for (const setting of tableRows.appSettings) upsertSetting.run(String(setting.key), String(setting.value ?? ""));
    const expectedCounts: Record<string, number> = {
      custom_dishes: tableRows.customDishes.length,
      menu_categories: tableRows.menuCategories.length,
      orders: tableRows.orders.length,
      dinner_invites: tableRows.dinnerInvites.length,
      dinner_invite_guests: tableRows.dinnerInviteGuests.length,
      dinner_invite_selections: tableRows.dinnerInviteSelections.length,
      dinner_journals: tableRows.dinnerJournals.length,
      pantry_items: tableRows.pantryItems.length,
      shopping_checks: tableRows.shoppingChecks.length,
    };
    for (const [table, expected] of Object.entries(expectedCounts)) {
      const actual = Number((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
      if (actual !== expected) throw new ImportInputError(`导入校验失败：${table} 数量不一致`);
    }
  });
  transaction();
  return {
    dishes: tableRows.customDishes.length,
    categories: tableRows.menuCategories.length,
    orders: tableRows.orders.length,
    invites: tableRows.dinnerInvites.length,
    journals: tableRows.dinnerJournals.length,
    pantryItems: tableRows.pantryItems.length,
    shoppingChecks: tableRows.shoppingChecks.length,
  };
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  let stagingDir = "";
  let oldUploadsDir = "";
  let uploadsBackupReady = false;
  try {
    ensureDataDirectories();
    await ensureAllSchema();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ImportInputError("请选择数据导出 ZIP 文件");
    stagingDir = await mkdtemp(path.join(tmpdir(), "ade-import-"));
    const parsed = await readArchive(file, stagingDir);
    const sqlite = getSqlite();
    const backupDir = path.join(getDataDir(), "import-backups");
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = path.join(backupDir, `ade-kitchen-before-export-import-${stamp}.sqlite`);
    const backupTempFile = path.join(stagingDir, "before-import.sqlite");
    await sqlite.backup(backupTempFile);
    await copyRegularFile(backupTempFile, backupFile);

    const currentUploads = getUploadsDir();
    oldUploadsDir = await mkdtemp(path.join(tmpdir(), "ade-uploads-before-import-"));
    await copyDirectoryContents(currentUploads, oldUploadsDir);
    uploadsBackupReady = true;
    await clearDirectoryContents(currentUploads);
    await copyDirectoryContents(path.join(stagingDir, "uploads"), currentUploads);
    const result = replaceDatabase(parsed.payload);
    await rm(oldUploadsDir, { recursive: true, force: true }).catch(() => undefined);
    oldUploadsDir = "";
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    stagingDir = "";
    return Response.json({ ok: true, result: { ...result, images: parsed.imageCount, backupFile: path.basename(backupFile) } });
  } catch (error) {
    if (uploadsBackupReady && oldUploadsDir) {
      await clearDirectoryContents(getUploadsDir()).catch(() => undefined);
      await copyDirectoryContents(oldUploadsDir, getUploadsDir()).catch(() => undefined);
      await rm(oldUploadsDir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (stagingDir) await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "数据导入失败，已恢复原数据";
    return Response.json({ error: message }, { status: error instanceof ImportInputError ? 400 : 500 });
  }
}
