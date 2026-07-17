import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { categories as seedCategories, dishes as seedDishes } from "../app/menu";

export function getD1() {
  if (!env.DB) throw new Error("订单数据库暂不可用");
  return env.DB;
}

export function getDb() {
  return drizzle(getD1(), { schema });
}

export function getUploads() {
  if (!env.UPLOADS) throw new Error("菜品图片空间暂不可用");
  return env.UPLOADS;
}

export async function ensureOrdersSchema() {
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    customer_name TEXT NOT NULL,
    meal_date TEXT NOT NULL,
    guest_count INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    dishes TEXT NOT NULL,
    dish_snapshot TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await getD1().prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("dish_snapshot")) await getD1().prepare("ALTER TABLE orders ADD COLUMN dish_snapshot TEXT NOT NULL DEFAULT '[]'").run();
}

export async function ensureCustomDishesSchema() {
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS custom_dishes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    flavor TEXT NOT NULL DEFAULT '家常风味',
    minutes INTEGER NOT NULL DEFAULT 30,
    base_servings INTEGER NOT NULL DEFAULT 4,
    image_url TEXT NOT NULL DEFAULT '',
    image_position TEXT NOT NULL DEFAULT 'center',
    gallery TEXT NOT NULL DEFAULT '[]',
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    featured INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 1,
    sold_out INTEGER NOT NULL DEFAULT 0,
    seasons TEXT NOT NULL DEFAULT '[]',
    occasions TEXT NOT NULL DEFAULT '[]',
    dietary TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await getD1().prepare("PRAGMA table_info(custom_dishes)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("steps")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("source")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN source TEXT NOT NULL DEFAULT ''").run();
  if (!names.has("base_servings")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN base_servings INTEGER NOT NULL DEFAULT 4").run();
  if (!names.has("image_position")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN image_position TEXT NOT NULL DEFAULT 'center'").run();
  if (!names.has("gallery")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN gallery TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("featured")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN featured INTEGER NOT NULL DEFAULT 0").run();
  if (!names.has("available")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN available INTEGER NOT NULL DEFAULT 1").run();
  if (!names.has("sold_out")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN sold_out INTEGER NOT NULL DEFAULT 0").run();
  if (!names.has("seasons")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN seasons TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("occasions")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN occasions TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("dietary")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN dietary TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("sort_order")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0").run();
}

export async function ensureShoppingChecksSchema() {
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS shopping_checks (
    item_key TEXT PRIMARY KEY NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function ensureMenuLibrary() {
  await ensureCustomDishesSchema();
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL DEFAULT ''
  )`).run();
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();

  const seeded = await getDb().select().from(schema.appSettings).where(eq(schema.appSettings.key, "classic_menu_v1")).limit(1);
  if (!seeded.length) {
    for (const [index, dish] of seedDishes.entries()) {
      await getDb().insert(schema.customDishes).values({
        id: dish.id, name: dish.name, category: dish.category, description: dish.description,
        flavor: dish.flavor, minutes: dish.minutes, baseServings: dish.baseServings || 4,
        imageUrl: dish.imageUrl || "", imagePosition: dish.imagePosition || "center", gallery: JSON.stringify(dish.gallery || []), ingredients: JSON.stringify(dish.ingredients), steps: JSON.stringify(dish.steps || []),
        source: dish.source || "阿德经典菜单", active: 1, featured: dish.tag ? 1 : 0, available: 1, soldOut: 0,
        seasons: "[]", occasions: "[]", dietary: "[]", sortOrder: index,
      }).onConflictDoNothing();
    }
    await getDb().insert(schema.appSettings).values({ key: "classic_menu_v1", value: new Date().toISOString() }).onConflictDoNothing();
  }

  const dishCategories = await getD1().prepare("SELECT DISTINCT category AS name FROM custom_dishes WHERE category <> ''").all<{ name: string }>();
  const names = Array.from(new Set([...seedCategories, ...dishCategories.results.map((item) => item.name)]));
  for (const [index, name] of names.entries()) {
    await getDb().insert(schema.menuCategories).values({ id: crypto.randomUUID(), name, sortOrder: index }).onConflictDoNothing();
  }
}

export async function ensurePantrySchema() {
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS pantry_items (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '其他',
    location TEXT NOT NULL DEFAULT '家中库存',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}
