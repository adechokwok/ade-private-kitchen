import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";

import unzipper from "unzipper";
import { and, count, eq } from "drizzle-orm";

import { chefApiGuard } from "../../../chef-auth";
import { ensureAllSchema, getDb, getUploads } from "../../../../db";
import * as schema from "../../../../db/schema";

export const runtime = "nodejs";

const maxZipBytes = 300 * 1024 * 1024;
const importChunkBytes = 2 * 1024 * 1024;
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
type UploadEntry = { key: string; body: Buffer };

type ImportUploadManifest = { totalBytes: number; totalChunks: number; received: number[]; createdAt: string };

function importUploadPath(uploadId: string) {
  if (!/^[a-f0-9-]{20,80}$/i.test(uploadId)) throw new ImportInputError("导入上传会话无效");
  return path.join(tmpdir(), "ade-kitchen-import-staging", uploadId);
}

async function receiveImportChunk(request: Request) {
  const uploadId = request.headers.get("x-import-upload-id") || "";
  const uploadDir = importUploadPath(uploadId);
  const index = Number(request.headers.get("x-import-chunk-index"));
  const totalChunks = Number(request.headers.get("x-import-total-chunks"));
  const totalBytes = Number(request.headers.get("x-import-total-bytes"));
  if (!Number.isInteger(index) || !Number.isInteger(totalChunks) || !Number.isInteger(totalBytes) || index < 0 || totalChunks < 1 || totalBytes < 1 || totalBytes > maxZipBytes || totalChunks > Math.ceil(maxZipBytes / importChunkBytes)) {
    throw new ImportInputError("导入分块参数无效");
  }
  if (index >= totalChunks) throw new ImportInputError("导入分块序号无效");
  const bytes = Buffer.from(await request.arrayBuffer());
  if (!bytes.length || bytes.length > importChunkBytes) throw new ImportInputError("导入分块大小无效");
  await mkdir(uploadDir, { recursive: true });
  const manifestPath = path.join(uploadDir, "manifest.json");
  let manifest: ImportUploadManifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ImportUploadManifest;
    if (manifest.totalBytes !== totalBytes || manifest.totalChunks !== totalChunks) throw new ImportInputError("导入分块与当前文件不匹配");
  } catch (error) {
    if (error instanceof ImportInputError && error.message.includes("当前文件不匹配")) throw error;
    manifest = { totalBytes, totalChunks, received: [], createdAt: new Date().toISOString() };
  }
  await writeFile(path.join(uploadDir, `chunk-${String(index).padStart(6, "0")}.part`), bytes, { mode: 0o600 });
  manifest.received = Array.from(new Set([...manifest.received, index])).sort((left, right) => left - right);
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  return Response.json({ ok: true, received: manifest.received.length, total: manifest.totalChunks });
}

async function assembleImportChunks(uploadDir: string, manifest: ImportUploadManifest) {
  if (manifest.received.length !== manifest.totalChunks) throw new ImportInputError("导入文件尚未上传完整，请重试");
  const archivePath = path.join(uploadDir, "archive.zip");
  let total = 0;
  for (let index = 0; index < manifest.totalChunks; index += 1) {
    const chunkPath = path.join(uploadDir, `chunk-${String(index).padStart(6, "0")}.part`);
    const chunkStat = await stat(chunkPath).catch(() => null);
    if (!chunkStat) throw new ImportInputError("导入文件缺少分块，请重新上传");
    total += chunkStat.size;
    if (total > manifest.totalBytes) throw new ImportInputError("导入文件大小校验失败");
    await pipeline(createReadStream(chunkPath), createWriteStream(archivePath, { flags: index === 0 ? "w" : "a", mode: 0o600 }));
  }
  if (total !== manifest.totalBytes) throw new ImportInputError("导入文件大小校验失败");
  return readFile(archivePath);
}


function relativeKey(value: string) {
  if (!value || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new ImportInputError("压缩包包含无效的图片路径");
  }
  return value;
}

function rows<T>(payload: ExportPayload, key: TableKey): T[] {
  if (!Object.prototype.hasOwnProperty.call(payload.tables, key)) throw new ImportInputError("导出文件缺少 " + key + " 数据表");
  const value = payload.tables?.[key];
  if (!Array.isArray(value)) throw new ImportInputError("导出文件中的 " + key + " 不是列表");
  return value as T[];
}

function assertObjectRows(value: unknown[], key: TableKey) {
  if (value.some((row) => !row || typeof row !== "object" || Array.isArray(row))) throw new ImportInputError("导出文件中的 " + key + " 有无效记录");
}

async function readArchive(file: File) {
  if (!file.size) throw new ImportInputError("请选择数据导出 ZIP 文件");
  if (file.size > maxZipBytes) throw new ImportInputError("导出文件不能超过 300MB");
  const directory = await unzipper.Open.buffer(Buffer.from(await file.arrayBuffer()));
  if (directory.files.length > maxEntries) throw new ImportInputError("压缩包文件过多，最多支持 " + maxEntries + " 个文件");
  let expandedBytes = 0;
  let exportJson = "";
  const uploads: UploadEntry[] = [];
  const keys = new Set<string>();

  for (const entry of directory.files) {
    const entryPath = entry.path.replace(/\\/g, "/");
    if (entry.type === "Directory") continue;
    const bytes = await entry.buffer();
    expandedBytes += bytes.byteLength;
    if (expandedBytes > maxExpandedBytes) throw new ImportInputError("解压后的数据超过 600MB 限制");
    if (entryPath === "export.json") {
      if (exportJson) throw new ImportInputError("压缩包中有多个 export.json");
      exportJson = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      continue;
    }
    if (!entryPath.startsWith("uploads/")) throw new ImportInputError("压缩包只能包含 export.json 和 uploads 文件");
    const key = relativeKey(entryPath.slice("uploads/".length));
    if (key.endsWith(".meta.json")) continue;
    if (keys.has(key)) throw new ImportInputError("压缩包中有重复图片：" + key);
    keys.add(key);
    uploads.push({ key, body: bytes });
  }

  if (!exportJson) throw new ImportInputError("压缩包中没有找到 export.json");
  let payload: ExportPayload;
  try { payload = JSON.parse(exportJson) as ExportPayload; }
  catch { throw new ImportInputError("export.json 不是有效的 JSON"); }
  if (!payload || payload.version !== 1 || typeof payload.exportedAt !== "string" || !payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables)) {
    throw new ImportInputError("不支持的导出文件版本");
  }
  const unknownTable = Object.keys(payload.tables).find((key) => !tableKeys.includes(key as TableKey));
  if (unknownTable) throw new ImportInputError("导出文件包含当前版本不认识的数据表：" + unknownTable);
  for (const key of tableKeys) assertObjectRows(rows(payload, key), key);
  return { payload, uploads };
}

async function replaceDatabase(payload: ExportPayload) {
  const db = getDb();
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

  await db.transaction(async (tx) => {
    await tx.delete(schema.dinnerInviteSelections);
    await tx.delete(schema.dinnerInviteGuests);
    await tx.delete(schema.dinnerJournals);
    await tx.delete(schema.dinnerInvites);
    await tx.delete(schema.orders);
    await tx.delete(schema.shoppingChecks);
    await tx.delete(schema.pantryItems);
    await tx.delete(schema.customDishes);
    await tx.delete(schema.menuCategories);

    if (tableRows.customDishes.length) await tx.insert(schema.customDishes).values(tableRows.customDishes);
    if (tableRows.menuCategories.length) await tx.insert(schema.menuCategories).values(tableRows.menuCategories);
    if (tableRows.orders.length) await tx.insert(schema.orders).values(tableRows.orders);
    if (tableRows.dinnerInvites.length) await tx.insert(schema.dinnerInvites).values(tableRows.dinnerInvites);
    if (tableRows.dinnerInviteGuests.length) await tx.insert(schema.dinnerInviteGuests).values(tableRows.dinnerInviteGuests);
    if (tableRows.dinnerInviteSelections.length) await tx.insert(schema.dinnerInviteSelections).values(tableRows.dinnerInviteSelections);
    if (tableRows.dinnerJournals.length) await tx.insert(schema.dinnerJournals).values(tableRows.dinnerJournals);
    if (tableRows.pantryItems.length) await tx.insert(schema.pantryItems).values(tableRows.pantryItems);
    if (tableRows.shoppingChecks.length) await tx.insert(schema.shoppingChecks).values(tableRows.shoppingChecks);

    const importedSettingKeys = new Set(tableRows.appSettings.map((setting) => String(setting.key)));
    const existingSettings = await tx.select({ key: schema.appSettings.key }).from(schema.appSettings);
    for (const setting of existingSettings) {
      const key = String(setting.key);
      if (!protectedSettingKey.test(key) && !importedSettingKeys.has(key)) await tx.delete(schema.appSettings).where(eq(schema.appSettings.key, key));
    }
    for (const setting of tableRows.appSettings) {
      const key = String(setting.key);
      const value = String(setting.value ?? "");
      await tx.insert(schema.appSettings).values({ key, value }).onDuplicateKeyUpdate({ set: { value } });
    }
  });

  const [dishRows, categoryRows, orderRows, inviteRows, journalRows, pantryRows, shoppingCheckRows] = await Promise.all([
    db.select({ value: count() }).from(schema.customDishes),
    db.select({ value: count() }).from(schema.menuCategories),
    db.select({ value: count() }).from(schema.orders),
    db.select({ value: count() }).from(schema.dinnerInvites),
    db.select({ value: count() }).from(schema.dinnerJournals),
    db.select({ value: count() }).from(schema.pantryItems),
    db.select({ value: count() }).from(schema.shoppingChecks),
  ]);
  const dishes = Number(dishRows[0]?.value || 0);
  const categories = Number(categoryRows[0]?.value || 0);
  const orders = Number(orderRows[0]?.value || 0);
  const invites = Number(inviteRows[0]?.value || 0);
  const journals = Number(journalRows[0]?.value || 0);
  const pantryItems = Number(pantryRows[0]?.value || 0);
  const shoppingChecks = Number(shoppingCheckRows[0]?.value || 0);
  const expected = {
    dishes: tableRows.customDishes.length, categories: tableRows.menuCategories.length, orders: tableRows.orders.length,
    invites: tableRows.dinnerInvites.length, journals: tableRows.dinnerJournals.length,
    pantryItems: tableRows.pantryItems.length, shoppingChecks: tableRows.shoppingChecks.length,
  };
  if (dishes !== expected.dishes || categories !== expected.categories || orders !== expected.orders || invites !== expected.invites || journals !== expected.journals || pantryItems !== expected.pantryItems || shoppingChecks !== expected.shoppingChecks) {
    throw new ImportInputError("导入校验失败：MySQL 记录数量与导出文件不一致");
  }
  return expected;
}

export async function POST(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  let chunkUploadDir = "";
  try {
    await ensureAllSchema();
    const chunkUploadId = request.headers.get("x-import-upload-id") || "";
    const isFinalize = request.headers.get("x-import-finalize") === "1";
    if (chunkUploadId && !isFinalize) return receiveImportChunk(request);
    let file: File;
    if (chunkUploadId && isFinalize) {
      chunkUploadDir = importUploadPath(chunkUploadId);
      const manifest = JSON.parse(await readFile(path.join(chunkUploadDir, "manifest.json"), "utf8")) as ImportUploadManifest;
      const archive = await assembleImportChunks(chunkUploadDir, manifest);
      file = new File([archive], "import.zip", { type: "application/zip" });
    } else {
      const form = await request.formData();
      const formFile = form.get("file");
      if (!(formFile instanceof File)) throw new ImportInputError("请选择数据导出 ZIP 文件");
      file = formFile;
    }
    const parsed = await readArchive(file);
    const result = await replaceDatabase(parsed.payload);
    for (const upload of parsed.uploads) {
      await getUploads().put(upload.key, upload.body);
    }
    return Response.json({ ok: true, result: { ...result, images: parsed.uploads.length, backupFile: "mysql-transaction" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据导入失败，MySQL 事务未提交";
    return Response.json({ error: message }, { status: error instanceof ImportInputError ? 400 : 500 });
  } finally {
    if (chunkUploadDir) await rm(chunkUploadDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
