import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import ts from "typescript";
import { ZipArchive } from "archiver";
import unzipper from "unzipper";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = await readFile(new URL("../app/kitchen-domain.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { kitchenDate, validMealDate, courseForRecipe, procurementKey } = await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const unitSource = await readFile(new URL("../app/ingredient-units.ts", import.meta.url), "utf8");
const unitJs = ts.transpileModule(unitSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { normalizeIngredientAmount, displayIngredientAmount } = await import("data:text/javascript;base64," + Buffer.from(unitJs).toString("base64"));
const descriptionSource = await readFile(new URL("../app/api/recipe-description.ts", import.meta.url), "utf8");
const descriptionJs = ts.transpileModule(descriptionSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { GENERATED_DESCRIPTION_MAX_LENGTH, limitGeneratedDescription } = await import("data:text/javascript;base64," + Buffer.from(descriptionJs).toString("base64"));

test("Qwen descriptions stay complete where possible and never exceed 35 characters", () => {
  assert.equal(GENERATED_DESCRIPTION_MAX_LENGTH, 35);
  const short = "酱汁浓郁，鸡翅软嫩入味。";
  assert.equal(limitGeneratedDescription(short), short);
  const sentence = "酱汁裹着软嫩鸡翅，热气一上桌就让人想先添一碗米饭。";
  assert.equal(limitGeneratedDescription(`${sentence}这段多余的补充会超出菜单可读范围。`), sentence);
  for (const value of ["酱汁裹着鸡翅，".repeat(8), "软嫩鲜香".repeat(18), `${"鲜".repeat(34)}，余味很长。`]) {
    const result = limitGeneratedDescription(value);
    assert.ok(Array.from(result).length <= 35);
    assert.ok(result.endsWith("。"));
    assert.ok(!result.includes("…"));
    assert.ok(!result.endsWith("，。"));
  }
});

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
  assert.deepEqual(normalizeIngredientAmount(1.5, "kg"), { amount: 1500, unit: "g" });
  assert.deepEqual(normalizeIngredientAmount(2, "升"), { amount: 2000, unit: "ml" });
  assert.deepEqual(displayIngredientAmount(1500, "g"), { amount: 1.5, unit: "kg" });
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
  const mockAi = http.createServer((request, response) => {
    request.resume();
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ name: "测试菜", description: "酱汁裹着软嫩鸡翅，热气一上桌就让人想先添一碗米饭。".repeat(5), ingredients: [], steps: ["焖煮入味"] }) } }] }));
  });
  mockAi.listen(0, "127.0.0.1"); await once(mockAi, "listening");
  t.after(() => new Promise(resolve => mockAi.close(resolve)));
  const env = { ...process.env, OPENAI_API_KEY: "isolated-test-key", OPENAI_BASE_URL: `http://127.0.0.1:${mockAi.address().port}/v1`, DATA_DIR: temp, DATABASE_PATH: path.join(temp, "ade-kitchen.sqlite"), UPLOADS_DIR: path.join(temp, "uploads"), BACKUP_DIR: path.join(temp, "backups"), CHEF_PASSWORD: password, TRUST_PROXY: "false" };
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
  const chefPage = await fetch(base + "/chef", { redirect: "manual" });
  assert.equal(chefPage.status, 307); assert.match(chefPage.headers.get("location"), /^\/chef\/login\?/);
  assert.equal((await fetch(base + "/api/menu-drafts")).status, 401);
  const login = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", body: new URLSearchParams({ password }) });
  const cookie = login.headers.get("set-cookie")?.split(";")[0]; assert.ok(cookie);
  async function api(url, body, chef = false, method = body ? "POST" : "GET") {
    const response = await fetch(base + url, { method, headers: { ...(body ? { "content-type": "application/json" } : {}), ...(chef ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  let customFontId = "";
  let customFontUrl = "";
  await t.test("both AI endpoints enforce 35 characters with an oversized model response", async () => {
    const copy = await api("/api/recipe-copy", { field: "description", name: "临时测试菜" }, true);
    assert.equal(copy.status, 200);
    assert.ok(Array.from(copy.data.description).length <= 35);
    const form = new FormData(); form.set("text", "测试菜：鸡翅，焖煮入味");
    const response = await fetch(base + "/api/recipe-import", { method: "POST", headers: { cookie }, body: form });
    assert.equal(response.status, 200);
    const imported = await response.json();
    assert.ok(imported.draft.description.length > 0);
    assert.ok(Array.from(imported.draft.description).length <= 35);
    const health = await api("/api/health"); assert.equal(health.data.version, "1.0.0");
  });
  await t.test("font library imports, serves, removes and restores fonts with chef-only writes", async () => {
    const publicList = await api("/api/menu-fonts");
    assert.equal(publicList.status, 200);
    assert.ok(publicList.data.fonts.some(font => font.id === "long-cang"));
    assert.equal((await fetch(base + "/api/menu-fonts", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "restore-builtins" }) })).status, 401);

    const fontBytes = await readFile(new URL("../public/fonts/LongCang-Regular.ttf", import.meta.url));
    const form = new FormData();
    form.append("files", new Blob([fontBytes], { type: "font/ttf" }), "测试手写.ttf");
    const imported = await fetch(base + "/api/menu-fonts", { method: "POST", headers: { cookie }, body: form });
    assert.equal(imported.status, 201);
    const importedFonts = (await imported.json()).fonts;
    const customFont = importedFonts.find(font => font.kind === "custom" && font.name === "测试手写");
    assert.ok(customFont); customFontId = customFont.id; customFontUrl = customFont.fileUrl;
    const served = await fetch(base + customFont.fileUrl);
    assert.equal(served.status, 200);
    assert.equal(served.headers.get("content-type"), "font/ttf");
    assert.deepEqual(Buffer.from(await served.arrayBuffer()), fontBytes);
    await mkdir(path.join(temp, "menu-fonts"), { recursive: true });
    await rename(path.join(temp, "uploads", "menu-fonts", `${customFont.id}.ttf`), path.join(temp, "menu-fonts", `${customFont.id}.ttf`));
    assert.equal((await api("/api/menu-fonts")).status, 200);
    assert.deepEqual(await readFile(path.join(temp, "uploads", "menu-fonts", `${customFont.id}.ttf`)), fontBytes);
    const exported = await fetch(base + "/api/admin/export", { headers: { cookie } });
    const archive = await unzipper.Open.buffer(Buffer.from(await exported.arrayBuffer()));
    const bundled = archive.files.find(file => file.path === `uploads/menu-fonts/${customFont.id}.ttf`);
    assert.ok(bundled, "custom fonts must travel with data exports");
    assert.deepEqual(await bundled.buffer(), fontBytes);

    const hidden = await api("/api/menu-fonts/long-cang", undefined, true, "DELETE");
    assert.equal(hidden.status, 200);
    assert.ok(!hidden.data.fonts.some(font => font.id === "long-cang"));
    assert.equal((await fetch(base + "/api/menu-fonts/long-cang/file")).status, 404);
    const restored = await api("/api/menu-fonts", { action: "restore-builtins" }, true, "PATCH");
    assert.equal(restored.status, 200);
    assert.ok(restored.data.fonts.some(font => font.id === "long-cang"));

  });
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
  const submit = (inv, extra = {}, chef = false) => api("/api/invites/" + inv.token, { action: "submit", guestToken: inv.guestToken, guestCount: 6, ...extra }, chef);
  let original;
  await t.test("shared guests must confirm distinct names before selecting and can see each person's dishes", async () => {
    const created = await api("/api/invites", { quickCreate: true, mealDate: "2026-10-02" }, true);
    const url = "/api/invites/" + created.data.invite.token;
    assert.equal((await api(url, { action: "join", displayName: "  " })).status, 400);
    assert.equal((await api(url, { action: "join", displayName: "朋友" })).status, 400);
    assert.equal((await api(url)).data.shared.guests.length, 0);
    const first = await api(url, { action: "join", displayName: "测试甲" });
    assert.equal(first.status, 200);
    assert.equal((await api(url, { action: "join", displayName: "测试甲" })).status, 409);
    const second = await api(url, { action: "join", displayName: "测试乙" });
    assert.equal(second.status, 200);
    assert.equal((await api(url, { action: "set-selection", guestToken: first.data.guestToken, dishId: dish.id, quantity: 2 })).status, 200);
    assert.equal((await api(url, { action: "set-selection", guestToken: second.data.guestToken, dishId: dish.id, quantity: 1 })).status, 200);
    const shared = (await api(url + "?guestToken=" + first.data.guestToken)).data.shared;
    assert.deepEqual(shared.selections.map(guest => [guest.displayName, guest.items.find(item => item.dishId === dish.id)?.quantity]), [["测试甲", 2], ["测试乙", 1]]);
    assert.equal(shared.aggregate.find(item => item.dishId === dish.id).quantity, 3);
    assert.equal((await api(url, { action: "submit", guestCount: 2 })).status, 403);
    const submitted = await api(url, { action: "submit", guestToken: first.data.guestToken, guestCount: 2 });
    assert.equal(submitted.status, 200);
    assert.equal(JSON.parse(submitted.data.order.dishes)[0].quantity, 3);
    db.prepare("UPDATE dinner_invite_guests SET display_name = '朋友' WHERE guest_token = ?").run(first.data.guestToken);
    assert.equal((await api(url, { action: "set-selection", guestToken: first.data.guestToken, dishId: dish.id, quantity: 3 })).status, 409);
    assert.equal((await api(url, { action: "submit", guestToken: first.data.guestToken, guestCount: 2 })).status, 403);
    assert.equal((await api(url, { action: "join", guestToken: first.data.guestToken, displayName: "测试丙" })).status, 200);
    assert.equal((await api(url, { action: "set-selection", guestToken: first.data.guestToken, dishId: dish.id, quantity: 3 })).status, 200);
  });
  await t.test("shared submissions preserve dietary notes and basic dinner information", async () => {
    original = await invite(); await select(original);
    assert.equal((await submit({ ...original, guestToken: "invalid" }, { note: "花生过敏，绝对不要放" })).status, 403);
    assert.equal(db.prepare("SELECT count(*) AS n FROM orders WHERE invite_id = ?").get(original.id).n, 0);
    const first = await submit(original, { note: "花生过敏，绝对不要放" }, true); assert.equal(first.status, 200);
    original.order = first.data.order;
    const joined = await api("/api/invites/" + original.token, { action: "join", displayName: "测试乙" });
    const secondGuest = { ...original, guestToken: joined.data.guestToken };
    await select(secondGuest, 2);
    assert.equal((await submit({ ...secondGuest, guestToken: "invalid" }, { note: "不吃香菜" })).status, 403);
    const second = await submit(secondGuest, { note: "", mealDate: "2026-10-03", guestCount: 2 }, true);
    assert.equal(second.data.order.id, first.data.order.id);
    assert.match(second.data.order.note, /花生过敏/);
    assert.equal(second.data.order.mealDate, "2026-10-02"); assert.equal(second.data.order.guestCount, 6);
    const added = await submit(secondGuest, { note: "不吃香菜" }, true);
    assert.match(added.data.order.note, /花生过敏/); assert.match(added.data.order.note, /不吃香菜/);
  });
  await t.test("concurrent submission creates exactly one shared order", async () => {
    const inv = await invite(); await select(inv);
    const results = await Promise.all(Array.from({ length: 5 }, (_, index) => submit(inv, {}, index % 2 === 0)));
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
    assert.equal((await submit(inv, {}, true)).status, 409);
    assert.equal((await select(inv, 0)).status, 200);
    db.prepare("UPDATE custom_dishes SET sold_out = 0 WHERE id = ?").run(dish.id);
    await select(inv);
    db.prepare("UPDATE custom_dishes SET active = 0 WHERE id = ?").run(dish.id);
    assert.equal((await submit(inv, {}, true)).status, 409);
    assert.equal((await select(inv, 0)).status, 200);
    db.prepare("UPDATE custom_dishes SET active = 1 WHERE id = ?").run(dish.id);
    assert.equal(db.prepare("SELECT count(*) AS n FROM orders WHERE invite_id = ?").get(inv.id).n, 0);
  });
  await t.test("rest mode blocks shared selections and submissions", async () => {
    const inv = await invite();
    await api("/api/kitchen-status", { open: false }, true, "PUT");
    assert.equal((await select(inv)).status, 409); assert.equal((await submit(inv, {}, true)).status, 409);
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
    const inv = await invite(); await select(inv); const order = (await submit(inv, {}, true)).data.order;
    assert.equal((await api("/api/invites", { id: inv.id, mealDate: "2026-10-05" }, true, "PATCH")).status, 200);
    assert.equal(db.prepare("SELECT meal_date FROM orders WHERE id = ?").get(order.id).meal_date, "2026-10-05");
    db.prepare("UPDATE custom_dishes SET sort_order = -99 WHERE id = ?").run(dish.id);
    const result = await api("/api/invites/" + inv.token);
    assert.equal(result.data.dishes[0].id, dish.id); assert.ok(result.data.categories.length);
  });
  await t.test("accepted shared dinners flag later dish changes and stale formal menus", async () => {
    const inv = await invite(); await select(inv); const order = (await submit(inv, {}, true)).data.order;
    const accepted = await api("/api/orders", { action: "update-status", id: order.id, status: "confirmed", progressNote: "接单" }, true);
    assert.equal(accepted.status, 200);
    const publishedMenu = { title: "测试家宴", date: "2026-10-02", time: "19:00", message: "开饭", template: "home", fontId: "long-cang", showDescriptions: false, templateName: "温馨家宴", subtitle: "DINNER", occasion: "朋友相聚", courses: [{ id: "main", label: "主厨热菜", english: "MAIN", dishes: [{ name: dish.name, description: "测试菜" }] }] };
    const published = await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu }, true); assert.equal(published.status, 200);
    assert.equal(JSON.parse(published.data.order.publishedMenu).fontId, "long-cang");
    assert.equal(JSON.parse(published.data.order.publishedMenu).time, "19:00");
    assert.equal(JSON.parse(published.data.order.publishedMenu).showDescriptions, false);
    const defaultDescriptions = await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, showDescriptions: undefined } }, true);
    assert.equal(JSON.parse(defaultDescriptions.data.order.publishedMenu).showDescriptions, true);
    for (const template of ["jiangnan", "hotpot", "birthday-party", "archive-ledger", "xuan-paper", "ingredient-atlas", "antique-post", "bistro-handwritten"]) {
      const themed = await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, template } }, true);
      assert.equal(themed.status, 200); assert.equal(JSON.parse(themed.data.order.publishedMenu).template, template);
    }
    for (const fontId of ["system-serif", "zcool-xiaowei", "zcool-kuaile", "long-cang", "zhi-mang-xing", "ma-shan-zheng", "liu-jian-mao-cao", customFontId]) {
      const selected = await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, fontId } }, true);
      assert.equal(selected.status, 200); assert.equal(JSON.parse(selected.data.order.publishedMenu).fontId, fontId);
    }
    assert.equal((await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, fontId: "external-font" } }, true)).status, 400);
    assert.equal((await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, showDescriptions: "hidden" } }, true)).status, 400);
    assert.equal((await api("/api/orders", { action: "publish-menu", id: order.id, publishedMenu: { ...publishedMenu, time: "29:90" } }, true)).status, 400);
    await select(inv, 2); const changed = await submit(inv, {}, true); assert.equal(changed.status, 200);
    assert.ok(changed.data.order.dishesUpdatedAt > changed.data.order.statusUpdatedAt);
    assert.ok(changed.data.order.dishesUpdatedAt > changed.data.order.publishedMenuUpdatedAt);
  });
  await t.test("pantry normalizes compatible units and records actual consumption", async () => {
    const created = await api("/api/pantry", { name: "大米", amount: 1, unit: "kg", type: "其他" }, true); assert.equal(created.status, 201);
    assert.equal(created.data.item.amount, 1000); assert.equal(created.data.item.unit, "g");
    const consumed = await api("/api/pantry", { id: created.data.item.id, amount: 250, unit: "g", action: "consume" }, true, "PATCH");
    assert.equal(consumed.status, 200); assert.equal(consumed.data.item.amount, 750);
    const edited = await api("/api/pantry", { id: created.data.item.id, amount: 2, unit: "kg", action: "set" }, true, "PATCH");
    assert.equal(edited.data.item.amount, 2000); assert.equal(edited.data.item.unit, "g");
  });
  await t.test("unchanged order lists return a conditional 304", async () => {
    const first = await fetch(base + "/api/orders", { headers: { cookie } }); assert.equal(first.status, 200);
    const etag = first.headers.get("etag"); assert.ok(etag);
    const second = await fetch(base + "/api/orders", { headers: { cookie, "if-none-match": etag } }); assert.equal(second.status, 304);
  });
  await t.test("complete menu drafts round-trip and reject stale revisions", async () => {
    let draft = { items: [], title: "删除所有菜仍保留", template: "romance", templateName: "二人世界", date: "2026-10-02", time: "19:30", fontId: "zcool-xiaowei", showDescriptions: false, subtitle: "验收", occasion: "朋友相聚", chefCredit: "阿德", guestCount: 2, courseEdits: { main: { label: "手工标题", english: "CUSTOM" } }, dishEdits: {}, message: "手工祝福" };
    let revision = 0;
    draft = { ...draft, fontId: customFontId };
    const customSaved = await api("/api/menu-drafts", { scope: "free", draft, revision }, true, "PUT");
    assert.equal(customSaved.status, 200); revision = customSaved.data.revision;
    for (const template of ["jiangnan", "hotpot", "birthday-party", "archive-ledger", "xuan-paper", "ingredient-atlas", "antique-post", "bistro-handwritten"]) {
      draft = { ...draft, template };
      const saved = await api("/api/menu-drafts", { scope: "free", draft, revision }, true, "PUT");
      assert.equal(saved.status, 200); revision = saved.data.revision;
    }
    const result = await api("/api/menu-drafts", undefined, true);
    assert.deepEqual(result.data.drafts.free.draft, draft);
    const temporaryId = "banquet-temporary-test";
    const snapshot = { id: temporaryId, name: "临时加的菜", description: "手填长介绍不会因为千问的字数限制而被截断。".repeat(3), category: "主厨热菜" };
    const withTemporary = { ...draft, items: [{ dishId: temporaryId, course: "main", snapshot }], showDescriptions: true };
    const temporarySaved = await api("/api/menu-drafts", { scope: "free", draft: withTemporary, revision }, true, "PUT");
    assert.equal(temporarySaved.status, 200); revision = temporarySaved.data.revision;
    assert.deepEqual((await api("/api/menu-drafts", undefined, true)).data.drafts.free.draft.items[0].snapshot, snapshot);
    assert.ok(!(await api("/api/dishes")).data.dishes.some(dish => dish.id === temporaryId));
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { ...draft, title: "stale" }, revision: 0 }, true, "PUT")).status, 409);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { ...draft, fontId: "external-font" }, revision }, true, "PUT")).status, 400);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { ...draft, showDescriptions: "false" }, revision }, true, "PUT")).status, 400);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { ...draft, time: "25:80" }, revision }, true, "PUT")).status, 400);
    assert.equal((await api("/api/menu-drafts", { scope: "free", draft: { items: [] }, revision: 1 }, true, "PUT")).status, 400);
    assert.equal((await api("/api/menu-drafts")).status, 401);
    const removed = await api(`/api/menu-fonts/${customFontId}`, undefined, true, "DELETE");
    assert.equal(removed.status, 200);
    assert.ok(!removed.data.fonts.some(font => font.id === customFontId));
    assert.equal((await fetch(base + customFontUrl)).status, 404);
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
    const status = await api("/api/admin/backups", undefined, true);
    assert.equal(status.status, 200); assert.equal(status.data.healthy, true); assert.ok(status.data.versions.some(version => version.name === second && version.hasUploads));
  });
  await t.test("spoofing forwarding headers cannot bypass login attempt limits", async () => {
    let last;
    for (let i = 0; i < 9; i++) last = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", headers: { "x-forwarded-for": `192.0.2.${i}` }, body: new URLSearchParams({ password: "wrong" }) });
    assert.match(last.headers.get("location"), /error=locked/);
  });
});

test("chef access is open only when no password is configured", { timeout: 120000 }, async t => {
  const servers = [];
  t.after(async () => {
    for (const server of servers) {
      if (server.child.exitCode === null) {
        const exited = once(server.child, "exit");
        server.child.kill();
        await exited.catch(() => {});
      }
      await rm(server.temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });

  async function start(password) {
    const temp = await mkdtemp(path.join(tmpdir(), "ade-auth-mode-"));
    const listener = net.createServer();
    listener.listen(0, "127.0.0.1"); await once(listener, "listening");
    const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    const env = { ...process.env, DATA_DIR: temp, DATABASE_PATH: path.join(temp, "ade-kitchen.sqlite"), UPLOADS_DIR: path.join(temp, "uploads"), BACKUP_DIR: path.join(temp, "backups"), TRUST_PROXY: "false" };
    delete env.CHEF_PASSWORD;
    delete env.CHEF_PASSWORD_FILE;
    if (password !== undefined) env.CHEF_PASSWORD = password;
    const child = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let logs = ""; child.stdout.on("data", c => logs += c); child.stderr.on("data", c => logs += c);
    servers.push({ child, temp });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + "/api/health")).ok) return base; } catch { /* boot */ }
      if (child.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`auth-mode test server failed to start: ${logs}`);
  }

  await t.test("empty password opens the chef page and admin APIs", async () => {
    const base = await start();
    const page = await fetch(base + "/chef", { redirect: "manual" });
    assert.equal(page.status, 200);
    assert.doesNotMatch(await page.text(), /class="chef-logout"/);
    const loginPage = await fetch(base + "/chef/login", { redirect: "manual" });
    assert.equal(loginPage.status, 307); assert.equal(loginPage.headers.get("location"), "/chef");
    assert.equal((await fetch(base + "/api/menu-drafts")).status, 200);
    const category = await fetch(base + "/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "免密码验收分类" }) });
    assert.equal(category.status, 201);
    const login = await fetch(base + "/api/auth/login", { method: "POST", redirect: "manual", body: new URLSearchParams() });
    assert.equal(login.status, 303); assert.equal(login.headers.get("location"), "/chef"); assert.equal(login.headers.get("set-cookie"), null);
  });

  await t.test("a configured but invalid short password fails closed", async () => {
    const base = await start("123456789");
    const page = await fetch(base + "/chef", { redirect: "manual" });
    assert.equal(page.status, 307); assert.match(page.headers.get("location"), /^\/chef\/login\?/);
    assert.equal((await fetch(base + "/api/menu-drafts")).status, 401);
    const loginPage = await fetch(base + "/chef/login");
    assert.equal(loginPage.status, 200); assert.match(await loginPage.text(), /主厨密码配置无效/);
  });
});

