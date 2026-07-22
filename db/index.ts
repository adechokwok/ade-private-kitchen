import "server-only";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { dishes as seedDishes } from "../app/menu";
import { ensureDataDirectories, getDatabasePath } from "../storage/paths";
import { getUploads as getLocalUploads } from "../storage/uploads";

type RuntimeState = {
  sqlite?: Database.Database;
  db?: BetterSQLite3Database<typeof schema>;
};

const runtime = globalThis as typeof globalThis & { __adeKitchen?: RuntimeState };
runtime.__adeKitchen ??= {};

export function getSqlite() {
  if (!runtime.__adeKitchen!.sqlite) {
    ensureDataDirectories();
    const sqlite = new Database(getDatabasePath());
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("synchronous = NORMAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");
    runtime.__adeKitchen!.sqlite = sqlite;
  }
  return runtime.__adeKitchen!.sqlite;
}

export function getDb() {
  runtime.__adeKitchen!.db ??= drizzle(getSqlite(), { schema });
  return runtime.__adeKitchen!.db;
}

export function getUploads() {
  return getLocalUploads();
}

function tableColumns(table: string) {
  return new Set(getSqlite().prepare(`PRAGMA table_info(${table})`).all().map((column) => String((column as { name: unknown }).name)));
}

function addColumn(table: string, columns: Set<string>, name: string, definition: string) {
  if (!columns.has(name)) getSqlite().exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

export async function ensureOrdersSchema() {
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY NOT NULL,
    customer_name TEXT NOT NULL,
    meal_date TEXT NOT NULL,
    guest_count INTEGER NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    dishes TEXT NOT NULL,
    dish_snapshot TEXT NOT NULL DEFAULT '[]',
    invite_id TEXT NOT NULL DEFAULT '',
    guest_token TEXT NOT NULL DEFAULT '',
    progress_note TEXT NOT NULL DEFAULT '',
    status_updated_at TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = tableColumns("orders");
  addColumn("orders", columns, "dish_snapshot", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("orders", columns, "invite_id", "TEXT NOT NULL DEFAULT ''");
  addColumn("orders", columns, "guest_token", "TEXT NOT NULL DEFAULT ''");
  addColumn("orders", columns, "progress_note", "TEXT NOT NULL DEFAULT ''");
  addColumn("orders", columns, "status_updated_at", "TEXT NOT NULL DEFAULT ''");
}

export async function ensureCustomDishesSchema() {
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS custom_dishes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    slogan TEXT NOT NULL DEFAULT '',
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
    difficulty TEXT NOT NULL DEFAULT '适中',
    recipe_summary TEXT NOT NULL DEFAULT '',
    substitutions TEXT NOT NULL DEFAULT '[]',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const columns = tableColumns("custom_dishes");
  addColumn("custom_dishes", columns, "slogan", "TEXT NOT NULL DEFAULT ''");
  addColumn("custom_dishes", columns, "steps", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("custom_dishes", columns, "source", "TEXT NOT NULL DEFAULT ''");
  addColumn("custom_dishes", columns, "base_servings", "INTEGER NOT NULL DEFAULT 4");
  addColumn("custom_dishes", columns, "image_position", "TEXT NOT NULL DEFAULT 'center'");
  addColumn("custom_dishes", columns, "gallery", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("custom_dishes", columns, "featured", "INTEGER NOT NULL DEFAULT 0");
  addColumn("custom_dishes", columns, "available", "INTEGER NOT NULL DEFAULT 1");
  addColumn("custom_dishes", columns, "sold_out", "INTEGER NOT NULL DEFAULT 0");
  addColumn("custom_dishes", columns, "seasons", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("custom_dishes", columns, "occasions", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("custom_dishes", columns, "dietary", "TEXT NOT NULL DEFAULT '[]'");
  addColumn("custom_dishes", columns, "sort_order", "INTEGER NOT NULL DEFAULT 0");
  addColumn("custom_dishes", columns, "difficulty", "TEXT NOT NULL DEFAULT '适中'");
  addColumn("custom_dishes", columns, "recipe_summary", "TEXT NOT NULL DEFAULT ''");
  addColumn("custom_dishes", columns, "substitutions", "TEXT NOT NULL DEFAULT '[]'");
}

export async function ensureDinnerInvitesSchema() {
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS dinner_invites (
    id TEXT PRIMARY KEY NOT NULL,
    token TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    message TEXT NOT NULL DEFAULT '',
    meal_date TEXT NOT NULL,
    theme TEXT NOT NULL DEFAULT 'warm',
    dish_ids TEXT NOT NULL DEFAULT '[]',
    recommended_dish_ids TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS dinner_journals (
    id TEXT PRIMARY KEY NOT NULL,
    invite_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '今晚的餐桌日记',
    note TEXT NOT NULL DEFAULT '',
    image_urls TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  getSqlite().exec("CREATE INDEX IF NOT EXISTS dinner_journals_invite_id_idx ON dinner_journals (invite_id)");
}

export async function ensureShoppingChecksSchema() {
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS shopping_checks (
    item_key TEXT PRIMARY KEY NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function ensureMenuLibrary() {
  await ensureCustomDishesSchema();
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL DEFAULT ''
  )`);
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    emoji TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const categoryColumns = tableColumns("menu_categories");
  addColumn("menu_categories", categoryColumns, "emoji", "TEXT NOT NULL DEFAULT ''");

  const seeded = await getDb().select().from(schema.appSettings).where(eq(schema.appSettings.key, "classic_menu_v1")).limit(1);
  if (!seeded.length) {
    const insertSeed = getSqlite().transaction(() => {
      for (const [index, dish] of seedDishes.entries()) {
        getDb().insert(schema.customDishes).values({
          id: dish.id, name: dish.name, category: dish.category, description: dish.description, slogan: dish.slogan || "",
          flavor: dish.flavor, minutes: dish.minutes, baseServings: dish.baseServings || 4,
          imageUrl: dish.imageUrl || "", imagePosition: dish.imagePosition || "center", gallery: JSON.stringify(dish.gallery || []), ingredients: JSON.stringify(dish.ingredients), steps: JSON.stringify(dish.steps || []),
          source: dish.source || "阿德经典菜单", active: 1, featured: dish.tag ? 1 : 0, available: 1, soldOut: 0,
          seasons: "[]", occasions: "[]", dietary: "[]", sortOrder: index,
        }).onConflictDoNothing().run();
      }
      getDb().insert(schema.appSettings).values({ key: "classic_menu_v1", value: new Date().toISOString() }).onConflictDoNothing().run();
    });
    insertSeed();
  }

  for (const dish of seedDishes) {
    if (dish.slogan) getSqlite().prepare("UPDATE custom_dishes SET slogan = ? WHERE id = ? AND slogan = ''").run(dish.slogan, dish.id);
    if (dish.recipeSummary) getSqlite().prepare("UPDATE custom_dishes SET recipe_summary = ? WHERE id = ? AND recipe_summary = ''").run(dish.recipeSummary, dish.id);
    if (dish.steps?.length) getSqlite().prepare("UPDATE custom_dishes SET steps = ? WHERE id = ? AND (steps = '' OR steps = '[]')").run(JSON.stringify(dish.steps), dish.id);
  }

  const dishCategories = getSqlite().prepare("SELECT DISTINCT category AS name FROM custom_dishes WHERE category <> ''").all() as Array<{ name: string }>;
  const names = Array.from(new Set(dishCategories.map((item) => item.name)));
  for (const [index, name] of names.entries()) {
    await getDb().insert(schema.menuCategories).values({ id: crypto.randomUUID(), name, sortOrder: index }).onConflictDoNothing();
  }
}

export async function ensurePantrySchema() {
  getSqlite().exec(`CREATE TABLE IF NOT EXISTS pantry_items (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    unit TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT '其他',
    location TEXT NOT NULL DEFAULT '家中库存',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function ensureAllSchema() {
  await ensureOrdersSchema();
  await ensureMenuLibrary();
  await ensureShoppingChecksSchema();
  await ensurePantrySchema();
  await ensureDinnerInvitesSchema();
}
