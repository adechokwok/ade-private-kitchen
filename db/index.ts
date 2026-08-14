import "server-only";

import mysql from "mysql2/promise";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { and, eq } from "drizzle-orm";
import * as schema from "./schema";
import { dishes as seedDishes } from "../app/menu";
import { getUploads as getConfiguredUploads } from "../storage/uploads";

type SqliteCompatibility = {
  exec(sql: string): void;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes: number };
  };
  transaction<T>(callback: () => T): () => T;
  backup(destination: string): Promise<void>;
};

type RuntimeState = {
  pool?: mysql.Pool;
  db?: MySql2Database<typeof schema>;
  schemaReady?: Promise<void>;
};

const runtime = globalThis as typeof globalThis & { __adeKitchen?: RuntimeState };
runtime.__adeKitchen ??= {};

function databaseUrl() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("CloudBase 云版需要配置 DATABASE_URL（腾讯云 MySQL 内网连接串）");
  return value;
}

export function getMysqlPool() {
  if (!runtime.__adeKitchen!.pool) {
    runtime.__adeKitchen!.pool = mysql.createPool({
      uri: databaseUrl(),
      waitForConnections: true,
      connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 8),
      maxIdle: Number(process.env.MYSQL_MAX_IDLE || 8),
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      namedPlaceholders: false,
    });
  }
  return runtime.__adeKitchen!.pool;
}

export function getDb() {
  runtime.__adeKitchen!.db ??= drizzle(getMysqlPool(), { schema });
  return runtime.__adeKitchen!.db;
}

export function getUploads() {
  return getConfiguredUploads();
}

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    customer_name VARCHAR(512) NOT NULL,
    meal_date VARCHAR(512) NOT NULL,
    guest_count INT NOT NULL,
    note LONGTEXT NOT NULL DEFAULT (''),
    dishes LONGTEXT NOT NULL,
    dish_snapshot LONGTEXT NOT NULL DEFAULT ('[]'),
    invite_id VARCHAR(96) NOT NULL DEFAULT (''),
    guest_token VARCHAR(96) NOT NULL DEFAULT (''),
    progress_note LONGTEXT NOT NULL DEFAULT (''),
    status_updated_at VARCHAR(512) NOT NULL DEFAULT (''),
    status_read_at VARCHAR(512) NOT NULL DEFAULT (''),
    published_menu LONGTEXT NOT NULL DEFAULT (''),
    published_menu_updated_at VARCHAR(512) NOT NULL DEFAULT (''),
    menu_read_at VARCHAR(512) NOT NULL DEFAULT (''),
    archived_at VARCHAR(512) NOT NULL DEFAULT (''),
    status VARCHAR(512) NOT NULL DEFAULT ('new'),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS custom_dishes (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    category VARCHAR(512) NOT NULL,
    description LONGTEXT NOT NULL DEFAULT (''),
    slogan LONGTEXT NOT NULL DEFAULT (''),
    flavor VARCHAR(512) NOT NULL DEFAULT ('家常风味'),
    minutes INT NOT NULL DEFAULT 30,
    base_servings INT NOT NULL DEFAULT 4,
    image_url LONGTEXT NOT NULL DEFAULT (''),
    image_position VARCHAR(512) NOT NULL DEFAULT ('center'),
    gallery LONGTEXT NOT NULL DEFAULT ('[]'),
    ingredients LONGTEXT NOT NULL,
    steps LONGTEXT NOT NULL DEFAULT ('[]'),
    source LONGTEXT NOT NULL DEFAULT (''),
    active INT NOT NULL DEFAULT 1,
    featured INT NOT NULL DEFAULT 0,
    available INT NOT NULL DEFAULT 1,
    sold_out INT NOT NULL DEFAULT 0,
    seasons LONGTEXT NOT NULL DEFAULT ('[]'),
    occasions LONGTEXT NOT NULL DEFAULT ('[]'),
    dietary LONGTEXT NOT NULL DEFAULT ('[]'),
    difficulty VARCHAR(512) NOT NULL DEFAULT ('适中'),
    recipe_summary LONGTEXT NOT NULL DEFAULT (''),
    substitutions LONGTEXT NOT NULL DEFAULT ('[]'),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS shopping_checks (
    item_key VARCHAR(96) NOT NULL PRIMARY KEY,
    checked INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS menu_categories (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    name VARCHAR(512) NOT NULL UNIQUE,
    emoji VARCHAR(512) NOT NULL DEFAULT (''),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS pantry_items (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    name VARCHAR(512) NOT NULL,
    amount DOUBLE NOT NULL,
    unit VARCHAR(512) NOT NULL,
    type VARCHAR(512) NOT NULL DEFAULT ('其他'),
    location VARCHAR(512) NOT NULL DEFAULT ('家中库存'),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    \`key\` VARCHAR(96) NOT NULL PRIMARY KEY,
    value LONGTEXT NOT NULL DEFAULT ('')
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS dinner_invites (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    token VARCHAR(96) NOT NULL UNIQUE,
    title VARCHAR(512) NOT NULL,
    message LONGTEXT NOT NULL DEFAULT (''),
    meal_date VARCHAR(512) NOT NULL,
    theme VARCHAR(512) NOT NULL DEFAULT ('warm'),
    dish_ids LONGTEXT NOT NULL DEFAULT ('[]'),
    recommended_dish_ids LONGTEXT NOT NULL DEFAULT ('[]'),
    mode VARCHAR(512) NOT NULL DEFAULT ('single'),
    shared_order_id VARCHAR(96) NOT NULL DEFAULT (''),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    active INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS dinner_invite_guests (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    invite_id VARCHAR(96) NOT NULL,
    guest_token VARCHAR(96) NOT NULL UNIQUE,
    display_name VARCHAR(512) NOT NULL DEFAULT ('朋友'),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY dinner_invite_guests_invite_idx (invite_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS dinner_invite_selections (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    invite_id VARCHAR(96) NOT NULL,
    guest_id VARCHAR(96) NOT NULL,
    dish_id VARCHAR(96) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY dinner_invite_selections_unique (invite_id, guest_id, dish_id),
    KEY dinner_invite_selections_invite_idx (invite_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS dinner_journals (
    id VARCHAR(96) NOT NULL PRIMARY KEY,
    invite_id VARCHAR(96) NOT NULL DEFAULT (''),
    order_id VARCHAR(96) NOT NULL DEFAULT (''),
    title VARCHAR(512) NOT NULL DEFAULT ('今晚的餐桌日记'),
    note LONGTEXT NOT NULL DEFAULT (''),
    image_urls LONGTEXT NOT NULL DEFAULT ('[]'),
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY dinner_journals_invite_id_idx (invite_id),
    KEY dinner_journals_order_id_idx (order_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
] as const;

async function seedMenu() {
  const db = getDb();
  const seeded = await db.select({ key: schema.appSettings.key }).from(schema.appSettings).where(eq(schema.appSettings.key, "classic_menu_v1")).limit(1);
  if (!seeded.length) {
    for (const [index, dish] of seedDishes.entries()) {
      await db.insert(schema.customDishes).values({
        id: dish.id,
        name: dish.name,
        category: dish.category,
        description: dish.description,
        slogan: dish.slogan || "",
        flavor: dish.flavor,
        minutes: dish.minutes,
        baseServings: dish.baseServings || 4,
        imageUrl: dish.imageUrl || "",
        imagePosition: dish.imagePosition || "center",
        gallery: JSON.stringify(dish.gallery || []),
        ingredients: JSON.stringify(dish.ingredients),
        steps: JSON.stringify(dish.steps || []),
        source: dish.source || "阿德经典菜单",
        active: 1,
        featured: dish.tag ? 1 : 0,
        available: 1,
        soldOut: 0,
        seasons: "[]",
        occasions: "[]",
        dietary: "[]",
        difficulty: "适中",
        recipeSummary: dish.recipeSummary || "",
        substitutions: "[]",
        sortOrder: index,
      }).onDuplicateKeyUpdate({ set: { name: dish.name } });
    }
    await db.insert(schema.appSettings).values({ key: "classic_menu_v1", value: new Date().toISOString() }).onDuplicateKeyUpdate({ set: { value: new Date().toISOString() } });
  }

  for (const dish of seedDishes) {
    if (dish.slogan) await db.update(schema.customDishes).set({ slogan: dish.slogan }).where(and(eq(schema.customDishes.id, dish.id), eq(schema.customDishes.slogan, "")));
    if (dish.recipeSummary) await db.update(schema.customDishes).set({ recipeSummary: dish.recipeSummary }).where(and(eq(schema.customDishes.id, dish.id), eq(schema.customDishes.recipeSummary, "")));
    if (dish.steps?.length) await db.update(schema.customDishes).set({ steps: JSON.stringify(dish.steps) }).where(and(eq(schema.customDishes.id, dish.id), eq(schema.customDishes.steps, "[]")));
  }

  const dishCategories = await db.select({ name: schema.customDishes.category }).from(schema.customDishes);
  const names = Array.from(new Set(dishCategories.map((item) => item.name).filter(Boolean)));
  const categoryRows = await db.select({ name: schema.menuCategories.name }).from(schema.menuCategories);
  const existingNames = new Set(categoryRows.map((item) => item.name));
  for (const [index, name] of names.entries()) {
    if (!existingNames.has(name)) {
      await db.insert(schema.menuCategories).values({ id: crypto.randomUUID(), name, sortOrder: index }).onDuplicateKeyUpdate({ set: { name } });
    }
  }
}

async function ensureReady() {
  if (!runtime.__adeKitchen!.schemaReady) {
    runtime.__adeKitchen!.schemaReady = (async () => {
      const pool = getMysqlPool();
      for (const statement of schemaStatements) await pool.query(statement);
      await seedMenu();
    })().catch((error) => {
      runtime.__adeKitchen!.schemaReady = undefined;
      throw error;
    });
  }
  await runtime.__adeKitchen!.schemaReady;
}

export async function ensureOrdersSchema() { await ensureReady(); }
export async function ensureCustomDishesSchema() { await ensureReady(); }
export async function ensureDinnerInvitesSchema() { await ensureReady(); }
export async function ensureShoppingChecksSchema() { await ensureReady(); }
export async function ensureMenuLibrary() { await ensureReady(); }
export async function ensurePantrySchema() { await ensureReady(); }
export async function ensureAllSchema() { await ensureReady(); }

export function getSqlite(): SqliteCompatibility {
  throw new Error("CloudBase 云版已切换到 MySQL；该接口只允许由尚未迁移的 NAS 兼容路由调用");
}
