import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import ts from "typescript";
import { ZipArchive } from "archiver";
import unzipper from "unzipper";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(new URL("../app/kitchen-domain.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { kitchenDate, validMealDate, courseForRecipe, procurementKey } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));

test("calendar, course labels and procurement demand identities", () => {
  assert.equal(kitchenDate(new Date("2026-09-18T17:00:00Z")), "2026-09-19");
  assert.equal(validMealDate("2026-02-31"), false);
  assert.equal(validMealDate("2028-02-29"), true);
  for (const name of ["糖醋排骨", "蒜蓉粉丝虾", "清炒白菜"]) assert.equal(courseForRecipe({ name, category: "家常热炒" }), "main");
  assert.equal(courseForRecipe({ name: "酸辣汤", category: "" }), "soup");
  assert.equal(courseForRecipe({ name: "牛肉炒饭", category: "" }), "staple");
  assert.equal(courseForRecipe({ name: "葱油拌面", category: "汤羹主食" }), "staple");
  assert.equal(courseForRecipe({ name: "莲藕排骨汤", category: "汤羹主食" }), "soup");
  assert.equal(courseForRecipe({ name: "凉拌黄瓜", category: "" }), "starter");
  const key = procurementKey("dish::rice::g", ["order-a"], 100, 0);
  assert.notEqual(key, procurementKey("dish::rice::g", ["order-b"], 100, 0));
  assert.notEqual(key, procurementKey("dish::rice::g", ["order-a", "order-b"], 200, 0));
  assert.notEqual(key, procurementKey("dish::rice::g", ["order-a"], 100, 10));
});

async function zip(entries) {
  const stream = new ZipArchive();
  const chunks = [];
  stream.on("data", chunk => chunks.push(chunk));
  const end = once(stream, "end");
  for (const [name, data] of Object.entries(entries)) stream.append(data, { name });
  await stream.finalize(); await end;
  return Buffer.concat(chunks);
}

test("real HTTP workflows with an isolated SQLite database", { timeout: 120000 }, async t => {
  const temp = await mkdtemp(path.join(tmpdir(), "ade-regression-"));
  const legacy = new Database(path.join(temp, "ade-kitchen.sqlite"));
  legacy.exec("CREATE TABLE orders (id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, meal_date TEXT NOT NULL, guest_count INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', dishes TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO orders (id, customer_name, meal_date, guest_count, dishes) VALUES ('legacy-order', '旧版饭局', '2026-09-01', 2, '[]')");
  legacy.close();
  const listener = net.createServer();
  listener.listen(0, "127.0.0.1"); await once(listener, "listening");
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const password = crypto.randomUUID();
  const env = { ...process.env, DATA_DIR: temp, DATABASE_PATH: path.join(temp, "ade-kitchen.sqlite"), UPLOADS_DIR: path.join(temp, "uploads"), CHEF_PASSWORD: password, TRUST_PROXY: "false" };
  const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let logs = ""; child.stdout.on("data", c => logs += c); child.stderr.on("data", c => logs += c);
  let db;
  t.after(async () => {
    db?.close();
    const exited = once(child, "exit"); child.kill(); await exited.catch(() => {});
    await rm(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch { /* boot */ }
    if (child.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, logs);
  const login = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", body: new URLSearchParams({ password }) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
  async function api(url, body, chef = false, method = body ? "POST" : "GET") {
    const response = await fetch(base + url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(chef ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  const menu = (await api("/api/dishes")).data.dishes;
  assert.ok(menu.length > 1);
  const dish = menu.find(d => d.id === "cola-wings") || menu[0];
  db = new Database(path.join(temp, "ade-kitchen.sqlite"));
  await t.test("legacy orders survive compatible schema migration", async () => {
    await api("/api/orders", undefined, true);
    const row = db.prepare("SELECT * FROM orders WHERE id = 'legacy-order'").get();
    assert.equal(row.customer_name, "旧版饭局"); assert.equal(row.request_id, "");
  });
  async function invite() {
    const result = await api("/api/invites", { quickCreate: true, mealDate: "2026-10-02" }, true);
    assert.equal(result.status, 201);
    const joined = await api("/api/invites/" + result.data.invite.token, { action: "join", displayName: "测试甲" });
    return { ...result.data.invite, guestToken: joined.data.guestToken };
  }
  const select = (inv, quantity = 1) => api("/api/invites/" + inv.token, { action: "set-selection", guestToken: inv.guestToken, dishId: dish.id, quantity });
  const submit = (inv, extra = {}) => api("/api/invites/" + inv.token, { action: "submit", guestToken: inv.guestToken, guestCount: 6, ...extra });
  let original;
  await t.test("shared submissions preserve dietary notes and basic dinner information", async () => {
    original = await invite(); await select(original);
    const first = await submit(original, { note: "花生过敏，绝对不要放" }); assert.equal(first.status, 200);
    original.order = first.data.order;
    const joined = await api("/api/invites/" + original.token, { action: "join", displayName: "测试乙" });
    const second = await submit({ ...original, guestToken: joined.data.guestToken }, { note: "", mealDate: "2026-10-03", guestCount: 2 });
    assert.equal(second.data.order.id, first.data.order.id);
    assert.match(second.data.order.note, /花生过敏/);
    assert.equal(second.data.order.mealDate, "2026-10-02"); assert.equal(second.data.order.guestCount, 6);
    const added = await submit({ ...original, guestToken: joined.data.guestToken }, { note: "不吃香菜" });
    assert.match(added.data.order.note, /花生过敏/); assert.match(added.data.order.note, /不吃香菜/);
  });
  await t.test("concurrent submission creates exactly one shared order", async () => {
    const inv = await invite(); await select(inv);
    const results = await Promise.all(Array.from({ length: 5 }, () => submit(inv)));
    assert.ok(results.every(r => r.status === 200));
    assert.equal(new Set(results.map(r => r.data.order.id)).size, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM orders WHERE invite_id = ?").get(inv.id).n, 1);
  });
  await t.test("finished and deleted dinners reject stale invite writes", async () => {
    const id = original.order.id;
    assert.equal((await api("/api/orders", { action: "update-status", id, status: "done" }, true)).status, 200);
    assert.equal((await select(original)).status, 409);
    assert.equal((await submit(original)).status, 409);
    assert.equal((await api("/api/invites", { id: original.id, active: true }, true, "PATCH")).status, 409);
    await api("/api/orders", { action: "archive-order", id }, true);
    await api("/api/orders", { action: "delete-order", id }, true);
    assert.equal((await submit(original)).status, 409);
    assert.equal(db.prepare("SELECT shared_order_id FROM dinner_invites WHERE id = ?").get(original.id).shared_order_id, "");
  });
  await t.test("sold-out and archived selections cannot become empty or incomplete orders", async () => {
    const inv = await invite(); await select(inv);
    db.prepare("UPDATE custom_dishes SET sold_out = 1 WHERE id = ?").run(dish.id);
    assert.equal((await submit(inv)).status, 409);
    assert.equal((await select(inv, 0)).status, 200);
    db.prepare("UPDATE custom_dishes SET sold_out = 0 WHERE id = ?").run(dish.id);
    await select(inv);
    db.prepare("UPDATE custom_dishes SET active = 0 WHERE id = ?").run(dish.id);
    assert.equal((await submit(inv)).status, 409);
    assert.equal((await select(inv, 0)).status, 200);
    db.prepare("UPDATE custom_dishes SET active = 1 WHERE id = ?").run(dish.id);
    assert.equal(db.prepare("SELECT count(*) AS n FROM orders WHERE invite_id = ?").get(inv.id).n, 0);
  });
  await t.test("rest mode blocks shared selections and submissions", async () => {
    const inv = await invite();
    await api("/api/kitchen-status", { open: false }, true, "PUT");
    assert.equal((await select(inv)).status, 409); assert.equal((await submit(inv)).status, 409);
    await api("/api/kitchen-status", { open: true }, true, "PUT");
  });
  const normal = { customerName: "普通测试", mealDate: "2026-10-04", guestCount: 2, dishes: [{ dishId: dish.id, quantity: 1 }] };
  await t.test("normal order validation is all-or-nothing and retries are idempotent", async () => {
    const before = db.prepare("SELECT count(*) AS n FROM orders").get().n;
    assert.equal((await api("/api/orders", { ...normal, dishes: [...normal.dishes, { dishId: menu[1].id, quantity: 11 }] })).status, 409);
    assert.equal((await api("/api/orders", { ...normal, mealDate: "2026-02-31" })).status, 400);
    assert.equal(db.prepare("SELECT count(*) AS n FROM orders").get().n, before);
    const requestId = crypto.randomUUID();
    const results = await Promise.all(Array.from({ length: 4 }, () => api("/api/orders", { ...normal, requestId })));
    assert.ok(results.every(r => [200, 201].includes(r.status)));
    assert.equal(new Set(results.map(r => r.data.order.id)).size, 1);
  });
  await t.test("chef date edits and menu ordering reach shared pages", async () => {
    const inv = await invite(); await select(inv); const order = (await submit(inv)).data.order;
    assert.equal((await api("/api/invites", { id: inv.id, mealDate: "2026-10-05" }, true, "PATCH")).status, 200);
    assert.equal(db.prepare("SELECT meal_date FROM orders WHERE id = ?").get(order.id).meal_date, "2026-10-05");
    db.prepare("UPDATE custom_dishes SET sort_order = -99 WHERE id = ?").run(dish.id);
    const result = await api("/api/invites/" + inv.token);
    assert.equal(result.data.dishes[0].id, dish.id); assert.ok(result.data.categories.length);
  });
  await t.test("complete menu drafts round-trip and reject stale revisions", async () => {
    const draft = { items: [], title: "删除所有菜仍保留", template: "romance", templateName: "二人世界", date: "2026-10-02", subtitle: "验收", occasion: "朋友相聚", chefCredit: "阿德", guestCount: 2, courseEdits: { main: { label: "手工标题", english: "CUSTOM" } }, dishEdits: {}, message: "手工祝福" };
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft, revision: 0 }, true, "PUT")).status, 200);
    const result = await api("/api/menu-drafts", undefined, true);
    assert.deepEqual(result.data.drafts.free.draft, draft);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { ...draft, title: "stale" }, revision: 0 }, true, "PUT")).status, 409);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { items: [] }, revision: 1 }, true, "PUT")).status, 400);
    assert.equal((await api("/api/menu-drafts")).status, 401);
  });
  await t.test("active orders remain visible behind more than 100 archived orders", async () => {
    const active = (await api("/api/orders", normal)).data.order;
    const insert = db.prepare("INSERT INTO orders (id, customer_name, meal_date, guest_count, dishes, archived_at, status, created_at) VALUES (?, '历史测试', '2026-01-01', 2, '[]', '2026-01-01', 'done', '2099-01-01')");
    for (let i = 0; i < 101; i++) insert.run(crypto.randomUUID());
    assert.ok((await api("/api/orders", undefined, true)).data.orders.some(o => o.id === active.id));
  });
  await t.test("seed IDs serve uploaded photos and mutable image URLs revalidate", async () => {
    await mkdir(path.join(temp, "uploads/dish-images"), { recursive: true });
    const bytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    await writeFile(path.join(temp, "uploads/dish-images/cola-wings"), bytes);
    const response = await fetch(base + "/api/dish-images/cola-wings"); assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    await mkdir(path.join(temp, "uploads/dinner-journals/00000000-0000-4000-8000-000000000000"), { recursive: true });
    await writeFile(path.join(temp, "uploads/dinner-journals/00000000-0000-4000-8000-000000000000/0"), bytes);
    const journal = await fetch(base + "/api/journal-images/00000000-0000-4000-8000-000000000000/0");
    assert.equal(journal.status, 200); assert.match(journal.headers.get("cache-control"), /must-revalidate/);
  });
  await t.test("chunk import errors return JSON and rollback retains original photos", async () => {
    const bad = await fetch(base + "/api/admin/import", { method: "POST", headers: { cookie, "x-import-upload-id": "invalid" }, body: "x" });
    assert.equal(bad.status, 400); assert.match((await bad.json()).error, /会话/);
    const exported = await fetch(base + "/api/admin/export", { headers: { cookie } });
    const archive = await unzipper.Open.buffer(Buffer.from(await exported.arrayBuffer()));
    const payload = JSON.parse((await archive.files.find(f => f.path === "export.json").buffer()).toString());
    payload.tables.custom_dishes.push(payload.tables.custom_dishes[0]);
    const data = await zip({ "export.json": JSON.stringify(payload), "uploads/replacement": "new" });
    const form = new FormData(); form.set("file", new Blob([data]), "test.zip");
    const result = await fetch(base + "/api/admin/import", { method: "POST", headers: { cookie }, body: form });
    assert.equal(result.status, 500);
    assert.equal((await fetch(base + "/api/dish-images/cola-wings")).status, 200);
    assert.ok((await readdir(path.join(temp, "import-backups"))).some(n => n.startsWith("uploads-before-import-")));
    assert.equal((await api("/api/orders", normal)).status, 201);
  });
  await t.test("versioned backups retain paired historical photos", async () => {
    const backupDir = path.join(temp, "backups");
    async function backup() {
      const proc = spawn(process.execPath, [path.join(root, "scripts/backup.mjs")], { cwd: root, env: { ...env, BACKUP_DIR: backupDir }, windowsHide: true, stdio: "pipe" });
      const [code] = await once(proc, "exit"); assert.equal(code, 0);
      return JSON.parse(await readFile(path.join(backupDir, "last-success.json"), "utf8")).snapshot;
    }
    const first = await backup();
    await writeFile(path.join(temp, "uploads/new-photo"), "second");
    const second = await backup(); assert.notEqual(first, second);
    for (const name of [first, second]) {
      assert.ok((await readFile(path.join(backupDir, name, "ade-kitchen.sqlite"))).length);
      assert.ok((await readFile(path.join(backupDir, name, "uploads/dish-images/cola-wings"))).length);
    }
    assert.equal(await readFile(path.join(backupDir, second, "uploads/new-photo"), "utf8"), "second");
  });
  await t.test("spoofing forwarding headers cannot bypass login attempt limits", async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", headers: { "x-forwarded-for": `192.0.2.${i}` }, body: new URLSearchParams({ password: "wrong" }) });
    assert.match(last.headers.get("location"), /error=locked/);
  });
});
