import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the menu and persistent order workflow", async () => {
  const [page, chefPage, route, dishRoute, imageRoute, importRoute, shoppingRoute, migration, dishMigration, recipeMigration, upgradeMigration, hosting] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/chef/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dishes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dish-images/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopping/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_absurd_bucky.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_opposite_ulik.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_charming_madripoor.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_furry_gideon.sql", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /朋友点菜/);
  assert.match(page, /阿德小厨房/);
  assert.match(page, /想吃什么/);
  assert.match(page, /今天也要被好好招待/);
  assert.match(page, /点菜不用客气/);
  assert.match(page, /主厨保证书/);
  assert.match(page, /主厨工作台/);
  assert.match(page, /采购清单/);
  assert.match(page, /菜单管理/);
  assert.match(page, /菜品类型（可自定义）/);
  assert.match(page, /保存修改/);
  assert.match(page, /基础人数和订单人数自动换算/);
  assert.match(page, /setInterval/);
  assert.match(page, /从本地上传照片/);
  assert.match(page, /智能菜谱录入/);
  assert.match(page, /开始识别并填入/);
  assert.match(page, /宴席菜单编排器/);
  assert.match(page, /温馨家宴/);
  assert.match(page, /二人世界/);
  assert.match(page, /Fine Dining/);
  assert.match(page, /新春团圆/);
  assert.match(page, /中秋雅宴/);
  assert.match(page, /生日庆典/);
  assert.match(page, /window\.print/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.match(dishRoute, /getUploads\(\)\.put/);
  assert.match(dishRoute, /export async function DELETE/);
  assert.match(dishRoute, /export async function PUT/);
  assert.match(dishRoute, /chefApiGuard/);
  assert.match(imageRoute, /getUploads\(\)\.get/);
  assert.match(importRoute, /input_image/);
  assert.match(importRoute, /json_schema/);
  assert.match(importRoute, /OPENAI_API_KEY/);
  assert.match(shoppingRoute, /shoppingChecks/);
  assert.match(chefPage, /requireChatGPTUser/);
  assert.match(migration, /CREATE TABLE `orders`/);
  assert.match(dishMigration, /CREATE TABLE `custom_dishes`/);
  assert.match(recipeMigration, /ADD `steps`/);
  assert.match(recipeMigration, /ADD `source`/);
  assert.match(upgradeMigration, /CREATE TABLE `shopping_checks`/);
  assert.match(upgradeMigration, /ADD `dish_snapshot`/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
});
