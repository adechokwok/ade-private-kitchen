import "server-only";

import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { chefApiGuard } from "../../../chef-auth";
import { ensureAllSchema, getDb } from "../../../../db";
import * as schema from "../../../../db/schema";
import { getUploadsDir } from "../../../../storage/paths";

export const runtime = "nodejs";

const protectedSettingKey = /(session|secret|password|token|api[_-]?key)/i;

type UploadFile = { key: string; filePath: string; size: number };

async function collectUploadFiles(root: string, current = root): Promise<UploadFile[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files: UploadFile[] = [];
  for (const entry of entries) {
    const filePath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectUploadFiles(root, filePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const info = await stat(filePath);
    files.push({ key: path.relative(root, filePath).split(path.sep).join("/"), filePath, size: info.size });
  }
  return files;
}

export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;

  try {
    await ensureAllSchema();
    const db = getDb();
    const tables = {
      custom_dishes: await db.select().from(schema.customDishes),
      menu_categories: await db.select().from(schema.menuCategories),
      orders: await db.select().from(schema.orders),
      dinner_invites: await db.select().from(schema.dinnerInvites),
      dinner_invite_guests: await db.select().from(schema.dinnerInviteGuests),
      dinner_invite_selections: await db.select().from(schema.dinnerInviteSelections),
      dinner_journals: await db.select().from(schema.dinnerJournals),
      pantry_items: await db.select().from(schema.pantryItems),
      shopping_checks: await db.select().from(schema.shoppingChecks),
      // Runtime secrets are intentionally never exported. Other settings remain portable.
      app_settings: (await db.select().from(schema.appSettings)).filter((row) => !protectedSettingKey.test(row.key)),
    };
    const uploads = await collectUploadFiles(getUploadsDir());
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tables }, null, 2);
    const output = new PassThrough();
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    archive.append(payload, { name: "export.json" });
    for (const upload of uploads) archive.file(upload.filePath, { name: `uploads/${upload.key}` });
    void archive.finalize();

    const filename = `ade-kitchen-export-${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    return new Response(Readable.toWeb(output) as ReadableStream, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据导出失败，请稍后重试";
    return Response.json({ error: message }, { status: 500 });
  }
}
