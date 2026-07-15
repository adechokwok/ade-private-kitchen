import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  mealDate: text("meal_date").notNull(),
  guestCount: integer("guest_count").notNull(),
  note: text("note").notNull().default(""),
  dishes: text("dishes").notNull(),
  dishSnapshot: text("dish_snapshot").notNull().default("[]"),
  status: text("status", { enum: ["new", "confirmed", "done"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const customDishes = sqliteTable("custom_dishes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  flavor: text("flavor").notNull().default("家常风味"),
  minutes: integer("minutes").notNull().default(30),
  baseServings: integer("base_servings").notNull().default(4),
  imageUrl: text("image_url").notNull().default(""),
  ingredients: text("ingredients").notNull(),
  steps: text("steps").notNull().default("[]"),
  source: text("source").notNull().default(""),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const shoppingChecks = sqliteTable("shopping_checks", {
  itemKey: text("item_key").primaryKey(),
  checked: integer("checked").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
