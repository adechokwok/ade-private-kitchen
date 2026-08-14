import "server-only";

import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";

import { chefApiGuard } from "../../../chef-auth";
import { ensureAllSchema, getDb, getUploads } from "../../../../db";
import * as schema from "../../../../db/schema";

export const runtime = "nodejs";

const protectedSettingKey = /(session|secret|password|token|api[_-]?key)/i;

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
      app_settings: (await db.select().from(schema.appSettings)).filter((row) => !protectedSettingKey.test(row.key)),
    };
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), tables }, null, 2);
    const output = new PassThrough();
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.on("error", (error) => output.destroy(error));
    archive.pipe(output);
    archive.append(payload, { name: "export.json" });

    const uploadStore = getUploads();
    const uploadKeys = await uploadStore.list();
    for (const key of uploadKeys) {
      const object = await uploadStore.get(key);
      if (object) archive.append(object.body, { name: `uploads/${key}` });
    }
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
