import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("ships the private menu and chef workflow", async () => {
  const [page, globalStyles, nextConfig, ordersRoute, dishRoute, imageRoute, importRoute, bulkImportRoute, copyRoute, copyStyle, shoppingRoute, categoryRoute, pantryRoute, inviteRoute, orderStatusRoute, statusClient, journalRoute, kitchenStatusRoute, schema, database, layout, shareImageAsset] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dishes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/dish-images/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-bulk-import/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-copy/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/recipe-copy-style.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/shopping/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/categories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pantry/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/invites/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/order-status/[token]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/order/[token]/status-client.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/journals/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/kitchen-status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/wechat-share.jpg", import.meta.url)),
  ]);

  for (const phrase of [
    "朋友点菜", "阿德小厨房", "想吃什么", "主厨工作台", "接单信息汇总", "把点单编成正式宴席菜单",
    "订单和采购提醒", "制作执行台", "合并备菜清单", "倒排烹饪顺序", "单菜计时器", "库存不足提醒",
    "等待通知的饭局", "菜单管理", "自定义新类型", "批量加入大类", "点菜端 slogan", "千问再生成", "家中库存",
    "智能菜谱录入", "批量导入菜谱库", "确认合并导入", "自动备份 · 失败回滚", "生成一场专属饭局", "餐桌日记，想写的时候再写", "温馨家宴", "二人世界", "Fine Dining",
    "新春团圆", "中秋雅宴", "生日烛光", "乔迁暖居", "夏日晚风", "冬日圣诞", "周末早午餐",
  ]) assert.match(page, new RegExp(phrase));
  assert.match(page, /从本地上传照片/);
  assert.match(page, /封面智能取景/);
  assert.match(page, /自动取景/);
  assert.match(page, /chef-portrait\.jpg/);
  assert.match(page, /阿德私厨志/);
  assert.match(page, /chef-studio\.jpg/);
  assert.match(page, /厨房今天休息/);
  assert.match(page, /kitchen-status-toggle/);
  assert.match(page, /menuReadOnly/);
  assert.match(page, /今天先看菜单，不接新点单/);
  assert.match(layout, /\/wechat-share\.jpg/);
  assert.match(layout, /width: 800, height: 800/);
  assert.match(layout, /const protocol = localHost \? forwardedProtocol \|\| "http" : "https"/);
  assert.ok(shareImageAsset.byteLength < 400 * 1024, "微信分享图应保持轻量");
  assert.match(ordersRoute, /kitchenSetting\?\.value === "closed"/);
  assert.doesNotMatch(page, /window\.print/);
  assert.match(page, /html-to-image/);
  assert.match(page, /jspdf/);
  assert.match(page, /function createClientRowId/);
  assert.match(page, /getRandomValues/);
  assert.doesNotMatch(page, /rowId: crypto\.randomUUID\(\)/);
  assert.doesNotMatch(page, /event\.currentTarget\.reset\(\)/);
  assert.match(page, /const formElement = event\.currentTarget/);
  assert.match(page, /order-success-dialog/);
  assert.match(page, /quantity-stepper/);
  assert.match(page, /archivedOrders/);
  assert.match(page, /通知开饭 · 强提醒/);
  assert.match(page, /\/api\/auth\/logout/);
  assert.match(ordersRoute, /export async function POST/);
  assert.match(ordersRoute, /export async function PATCH/);
  assert.match(ordersRoute, /export async function DELETE/);
  assert.match(ordersRoute, /order\.status !== "done" && order\.status !== "cancelled"/);
  assert.match(page, /deleteArchivedOrder/);
  assert.match(page, /删除饭局/);
  assert.match(page, /orderPendingDelete/);
  assert.match(page, /永久删除这场饭局/);
  assert.match(globalStyles, /\.status-actions button\.delete-order/);
  assert.match(globalStyles, /\.delete-order-confirm-actions/);
  assert.match(dishRoute, /getUploads\(\)\.put/);
  assert.match(dishRoute, /normalizeImagePosition/);
  assert.match(dishRoute, /chefApiGuard/);
  assert.match(imageRoute, /getUploads\(\)\.get/);
  assert.match(importRoute, /chat\/completions/);
  assert.match(importRoute, /image_url/);
  assert.match(importRoute, /qwen3-vl-plus/);
  assert.match(importRoute, /slogan/);
  assert.match(importRoute, /process\.env\.OPENAI_BASE_URL/);
  assert.match(importRoute, /process\.env\.OPENAI_MODEL/);
  assert.match(importRoute, /process\.env\.OPENAI_API_KEY/);
  assert.match(bulkImportRoute, /chefApiGuard/);
  assert.match(bulkImportRoute, /sqlite\.backup/);
  assert.match(bulkImportRoute, /sqlite\.transaction/);
  assert.match(bulkImportRoute, /fingerprint !== parsed\.fingerprint/);
  assert.match(bulkImportRoute, /import-backups/);
  assert.match(bulkImportRoute, /UPDATE custom_dishes SET/);
  assert.match(page, /\/api\/recipe-bulk-import/);
  assert.match(globalStyles, /\.bulk-import-preview/);
  assert.match(importRoute, /rotations/);
  assert.match(page, /rotateRecipeScreenshot/);
  assert.match(page, /managed-recipe-details/);
  assert.match(page, /mobile-menu-browser/);
  assert.match(page, /mobile-ade-picks/);
  assert.match(page, /desktop-ade-picks/);
  assert.match(page, /阿德推荐/);
  assert.match(page, /syncMobileCategory/);
  assert.match(page, /recipeLibraryQuery/);
  assert.match(page, /managed-dish-waterfall/);
  assert.doesNotMatch(page, /再显示 12 道/);
  assert.match(page, /category-emoji-editor/);
  assert.match(page, /exportBanquetMenu/);
  assert.match(page, /PNG 图片/);
  assert.match(page, /JPG 图片/);
  assert.match(page, /PDF 文件/);
  assert.match(globalStyles, /\.mobile-category-rail/);
  assert.match(globalStyles, /\.mobile-ade-picks-track/);
  assert.match(globalStyles, /\.desktop-ade-picks-grid/);
  assert.match(globalStyles, /\.recipe-library-toolbar/);
  assert.match(globalStyles, /\.recipe-bulk-category-bar/);
  assert.match(globalStyles, /column-count: 2/);
  assert.match(categoryRoute, /emoji/);
  assert.match(schema, /emoji: text\("emoji"\)/);
  assert.match(database, /addColumn\("menu_categories", categoryColumns, "emoji"/);
  assert.match(globalStyles, /\.screenshot-frame img \{ position: absolute;/);
  assert.match(globalStyles, /max-height: 100%/);
  assert.match(nextConfig, /allowedDevOrigins: \["127\.0\.0\.1", "localhost"\]/);
  assert.match(copyRoute, /OPENAI_API_KEY/);
  assert.match(copyRoute, /qwen3-vl-plus/);
  assert.match(copyRoute, /description/);
  assert.match(copyRoute, /slogan/);
  assert.match(copyRoute, /privateKitchenCopyStyle/);
  assert.match(importRoute, /privateKitchenCopyStyle/);
  assert.match(copyStyle, /22–42 个中文字符/);
  assert.match(copyStyle, /10–24 个中文字符/);
  assert.match(copyStyle, /汤汁请务必留给米饭/);
  assert.match(copyStyle, /软乎乎的一口鲜/);
  assert.match(copyStyle, /简单，但会让人想念/);
  assert.match(copyStyle, /白天不懂夜的黑，白菜不懂虾的鲜/);
  assert.match(copyStyle, /没有虾头，是因为我不做虾头男/);
  assert.match(copyStyle, /内娱真完了/);
  assert.match(schema, /slogan: text\("slogan"\)/);
  assert.match(database, /addColumn\("custom_dishes", columns, "slogan"/);
  assert.match(ordersRoute, /steps: dish\.steps/);
  assert.match(shoppingRoute, /shoppingChecks/);
  assert.match(categoryRoute, /export async function DELETE/);
  assert.match(categoryRoute, /SET category = '未分类'/);
  assert.match(categoryRoute, /sqlite\.transaction/);
  assert.match(categoryRoute, /rows\.splice\(targetIndex, 0, moved\)/);
  assert.match(categoryRoute, /UPDATE menu_categories SET sort_order = \?/);
  assert.match(categoryRoute, /remaining\.forEach\(\(item, index\) => updateOrder\.run\(index, item\.id\)\)/);
  assert.doesNotMatch(categoryRoute, /mergeInto/);
  assert.doesNotMatch(database, /seedCategories/);
  assert.match(dishRoute, /inArray\(customDishes\.id, ids\)/);
  assert.match(dishRoute, /normalizeCategoryDishOrder/);
  assert.match(dishRoute, /move === "top"/);
  assert.match(dishRoute, /active DESC, sort_order ASC/);
  assert.match(page, /moveSelectedRecipesToCategory/);
  assert.match(page, /菜品排序/);
  assert.match(page, /moveDish/);
  assert.match(page, /dishCategorySelection === "__custom__"/);
  assert.doesNotMatch(page, /duplicateDish/);
  assert.doesNotMatch(page, />复制<\/button>/);
  assert.match(page, /managed-card-actions\$\{dish\.active \? "" : " archived"\}/);
  assert.match(page, /恢复菜品/);
  assert.match(pantryRoute, /pantryItems/);
  assert.match(inviteRoute, /recommendedDishIds/);
  assert.match(orderStatusRoute, /progressNote/);
  assert.match(ordersRoute, /statusUpdatedAt/);
  assert.match(statusClient, /status-update-modal/);
  assert.match(statusClient, /localStorage/);
  assert.match(statusClient, /setTimeout\(\(\) => void load\(\), 0\)/);
  assert.match(statusClient, /setInterval\(\(\) => void load\(\), 15000\)/);
  assert.match(statusClient, /每 15 秒自动更新/);
  assert.match(journalRoute, /dinner-journals/);
  assert.match(journalRoute, /export async function DELETE/);
  assert.match(journalRoute, /order\.status !== "done"/);
  assert.match(journalRoute, /eq\(dinnerJournals\.orderId, ""\)/);
  assert.match(page, /deleteJournal/);
  assert.match(page, /journal-workspace/);
  assert.match(schema, /orderId: text\("order_id"\)/);
  assert.match(database, /dinner_journals_order_id_unique_idx/);
  assert.match(orderStatusRoute, /dinnerJournals\.orderId/);
  assert.match(kitchenStatusRoute, /kitchen_open_v1/);
  assert.match(kitchenStatusRoute, /chefApiGuard/);
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
