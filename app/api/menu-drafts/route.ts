import { withDataWrite } from "../../../storage/maintenance";
import { eq, like } from "drizzle-orm";
import { chefApiGuard } from "../../chef-auth";
import { ensureMenuLibrary, getDb, getSqlite } from "../../../db";
import { appSettings } from "../../../db/schema";

const prefix = "banquet_draft_v1:";
function validDraft(draft: unknown): boolean {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) return false;
  const value = draft as Record<string, unknown>;
  if (!["home", "romance", "fine", "spring", "midautumn", "birthday", "housewarming", "summer", "christmas", "brunch"].includes(String(value.template))) return false;
  if (!["title", "templateName", "date", "message", "subtitle", "occasion", "chefCredit"].every(key => typeof value[key] === "string")) return false;
  if (typeof value.guestCount !== "number" || !Number.isInteger(value.guestCount) || value.guestCount < 0 || value.guestCount > 20) return false;
  if (!["courseEdits", "dishEdits"].every(key => value[key] && typeof value[key] === "object" && !Array.isArray(value[key]))) return false;
  return Array.isArray(value.items) && value.items.length <= 120 && value.items.every(item => item && typeof item === "object" && typeof item.dishId === "string" && ["starter", "main", "staple", "soup"].includes(item.course));
}
export async function GET(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  await ensureMenuLibrary();
  const rows = await getDb().select().from(appSettings).where(like(appSettings.key, `${prefix}%`));
  return Response.json({ drafts: Object.fromEntries(rows.map(row => [row.key.slice(prefix.length), JSON.parse(row.value)])) });
}

async function handlePUT(request: Request) {
  const denied = chefApiGuard(request);
  if (denied) return denied;
  try {
    const { scope, draft, revision } = await request.json();
    if (typeof scope !== "string" || !/^(free|[a-f0-9-]{36})$/i.test(scope) || !Number.isInteger(revision) || revision < 0 || !validDraft(draft) || JSON.stringify(draft).length > 500000) return Response.json({ error: "菜单草稿格式无效" }, { status: 400 });
    await ensureMenuLibrary();
    return getSqlite().transaction(() => {
      const key = prefix + scope;
      const old = getDb().select().from(appSettings).where(eq(appSettings.key, key)).get();
      const current = old ? JSON.parse(old.value).revision : 0;
      if (current !== revision) return Response.json({ error: "此菜单已在其他页面修改。本机草稿已保留，请刷新后核对。" }, { status: 409 });
      const value = JSON.stringify({ draft, revision: current + 1 });
      getDb().insert(appSettings).values({ key, value }).onConflictDoUpdate({ target: appSettings.key, set: { value } }).run();
      return Response.json({ revision: current + 1 });
    })();
  } catch { return Response.json({ error: "菜单草稿保存失败" }, { status: 400 }); }
}

export async function PUT(...args: Parameters<typeof handlePUT>) { return withDataWrite(() => handlePUT(...args)); }
