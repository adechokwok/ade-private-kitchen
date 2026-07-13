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
