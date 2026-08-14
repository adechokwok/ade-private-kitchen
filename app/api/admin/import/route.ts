import "server-only";

import unzipper from "unzipper";
import { and, eq, sql } from "drizzle-orm";

import { chefApiGuard } from "../../../chef-auth";
import { ensureAllSchema, getDb, getUploads } from "../../../../db";
import * as schema from "../../../../db/schema";

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
type UploadEntry = { key: string; body: Buffer };

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
    appSettings: rows<typeof schema.appSettings.$inferInsert>(payload).filter((row) => !protectedSettingKey.test(String(row.key || ""))),
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

  const count = async <T>(table: T) => Number((await db.select({ value: sql<number>`count(*)` }).from(table as never))[0]?.value || 0);
  const [dishes, categories, orders, invites, journals, pantryItems, shoppingChecks] = await Promise.all([
    count(schema.customDishes), count(schema.menuCategories), count(schema.orders), count(schema.dinnerInvites),
    count(schema.dinnerJournals), count(schema.pantryItems), count(schema.shoppingChecks),
  ]);
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
  try {
    await ensureAllSchema();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ImportInputError("请选择数据导出 ZIP 文件");
    const parsed = await readArchive(file);
    const result = await replaceDatabase(parsed.payload);
    for (const upload of parsed.uploads) {
      await getUploads().put(upload.key, upload.body);
    }
    return Response.json({ ok: true, result: { ...result, images: parsed.uploads.length, backupFile: "mysql-transaction" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据导入失败，MySQL 事务未提交";
    return Response.json({ error: message }, { status: error instanceof ImportInputError ? 400 : 500 });
  }
}
