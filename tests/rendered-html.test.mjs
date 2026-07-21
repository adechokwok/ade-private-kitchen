import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the private menu and chef workflow", async () => {
  const [page, ordersRoute, dishRoute, imageRoute, importRoute, shoppingRoute, categoryRoute, pantryRoute, inviteRoute, orderStatusRoute, journalRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dishes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dish-images/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopping/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/categories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pantry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/invites/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/order-status/[token]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/journals/route.ts", import.meta.url), "utf8"),
  ]);

  for (const phrase of ["朋友点菜", "阿德小厨房", "想吃什么", "今天也要被好好招待", "点菜不用客气", "主厨保证书", "主厨工作台", "采购清单", "菜单管理", "菜品类型（可自定义）", "家中库存", "智能菜谱录入", "宴席菜单编排器", "生成一场专属饭局", "饭后留一页"]) assert.match(page, new RegExp(phrase));
  assert.match(page, /从本地上传照片/);
  assert.match(page, /window\.print/);
  assert.match(page, /function createClientRowId/);
  assert.match(page, /getRandomValues/);
  assert.doesNotMatch(page, /rowId: crypto\.randomUUID\(\)/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(ordersRoute, /export async function POST/);
  assert.match(ordersRoute, /export async function PATCH/);
  assert.match(dishRoute, /getUploads\(\)\.put/);
  assert.match(dishRoute, /chefApiGuard/);
  assert.match(imageRoute, /getUploads\(\)\.get/);
  assert.match(importRoute, /input_image/);
  assert.match(importRoute, /process\.env\.OPENAI_API_KEY/);
  assert.match(shoppingRoute, /shoppingChecks/);
  assert.match(categoryRoute, /mergeInto/);
  assert.match(pantryRoute, /pantryItems/);
  assert.match(inviteRoute, /recommendedDishIds/);
  assert.match(orderStatusRoute, /progressNote/);
  assert.match(journalRoute, /dinner-journals/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview/);
});

test("uses NAS-local persistence and app-owned chef authentication", async () => {
  const [database, uploads, paths, auth, chefPage, loginRoute, healthRoute] = await Promise.all([
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../storage/uploads.ts", import.meta.url), "utf8"),
    readFile(new URL("../storage/paths.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chef-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/chef/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(database, /better-sqlite3/);
  assert.match(database, /journal_mode = WAL/);
  assert.match(database, /ensureAllSchema/);
  assert.doesNotMatch(database, /cloudflare:workers|drizzle-orm\/d1/);
  assert.match(uploads, /getUploadsDir/);
  assert.match(uploads, /writeFile/);
  assert.match(uploads, /\.meta\.json/);
  assert.match(paths, /DATA_DIR/);
  assert.match(auth, /httpOnly: true/);
  assert.match(auth, /timingSafeEqual/);
  assert.match(auth, /SESSION_SECRET/);
  assert.match(chefPage, /getChefSession/);
  assert.match(loginRoute, /MAX_ATTEMPTS/);
  assert.match(healthRoute, /nas-local/);
});

test("includes a reproducible amd64 Docker deployment, updates, and backups", async () => {
  const [dockerfile, compose, nasCompose, workflow, backup, readme, packageJson] = await Promise.all([
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../compose.nas.yaml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/publish-nas-image.yml", import.meta.url), "utf8"),
    readFile(new URL("../scripts/backup.mjs", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(dockerfile, /node:22-bookworm-slim/);
  assert.match(dockerfile, /pnpm@11\.9\.0/);
  assert.match(dockerfile, /\.next\/standalone/);
  assert.match(dockerfile, /HEALTHCHECK/);
  assert.match(compose, /platform: linux\/amd64/);
  assert.match(compose, /NAS_DATA_PATH/);
  assert.match(compose, /NAS_BACKUP_PATH/);
  assert.match(compose, /service_healthy/);
  assert.match(nasCompose, /ghcr\.io\/adechokwok\/ade-private-kitchen:latest/);
  assert.match(nasCompose, /NAS_DATA_PATH/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /pnpm test/);
  assert.match(workflow, /platforms: linux\/amd64/);
  assert.match(workflow, /packages: write/);
  assert.match(backup, /database\.backup/);
  assert.match(backup, /uploads-latest/);
  assert.match(readme, /极空间 Z4Pro 部署/);
  const manifest = JSON.parse(packageJson);
  assert.equal(manifest.scripts.build, "next build");
  assert.equal(manifest.dependencies["better-sqlite3"].startsWith("^"), true);
  assert.equal(manifest.devDependencies.vinext, undefined);
});
