import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the menu and persistent order workflow", async () => {
  const [page, route, migration, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_absurd_bucky.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /朋友点菜/);
  assert.match(page, /主厨工作台/);
  assert.match(page, /采购清单/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(migration, /CREATE TABLE `orders`/);
  assert.match(hosting, /"d1": "DB"/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
});
