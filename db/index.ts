import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

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
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

export async function ensureCustomDishesSchema() {
  await getD1().prepare(`CREATE TABLE IF NOT EXISTS custom_dishes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    flavor TEXT NOT NULL DEFAULT '家常风味',
    minutes INTEGER NOT NULL DEFAULT 30,
    image_url TEXT NOT NULL DEFAULT '',
    ingredients TEXT NOT NULL,
    steps TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await getD1().prepare("PRAGMA table_info(custom_dishes)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  if (!names.has("steps")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN steps TEXT NOT NULL DEFAULT '[]'").run();
  if (!names.has("source")) await getD1().prepare("ALTER TABLE custom_dishes ADD COLUMN source TEXT NOT NULL DEFAULT ''").run();
}
