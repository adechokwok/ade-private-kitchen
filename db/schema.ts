import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  mealDate: text("meal_date").notNull(),
  guestCount: integer("guest_count").notNull(),
  note: text("note").notNull().default(""),
  dishes: text("dishes").notNull(),
  dishSnapshot: text("dish_snapshot").notNull().default("[]"),
  inviteId: text("invite_id").notNull().default(""),
  guestToken: text("guest_token").notNull().default(""),
  progressNote: text("progress_note").notNull().default(""),
  statusUpdatedAt: text("status_updated_at").notNull().default(""),
  publishedMenu: text("published_menu").notNull().default(""),
  publishedMenuUpdatedAt: text("published_menu_updated_at").notNull().default(""),
  status: text("status", { enum: ["new", "confirmed", "shopping", "preparing", "done", "cancelled"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const customDishes = sqliteTable("custom_dishes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull().default(""),
  slogan: text("slogan").notNull().default(""),
  flavor: text("flavor").notNull().default("家常风味"),
  minutes: integer("minutes").notNull().default(30),
  baseServings: integer("base_servings").notNull().default(4),
  imageUrl: text("image_url").notNull().default(""),
  imagePosition: text("image_position").notNull().default("center"),
  gallery: text("gallery").notNull().default("[]"),
  ingredients: text("ingredients").notNull(),
  steps: text("steps").notNull().default("[]"),
  source: text("source").notNull().default(""),
  active: integer("active").notNull().default(1),
  featured: integer("featured").notNull().default(0),
  available: integer("available").notNull().default(1),
  soldOut: integer("sold_out").notNull().default(0),
  seasons: text("seasons").notNull().default("[]"),
  occasions: text("occasions").notNull().default("[]"),
  dietary: text("dietary").notNull().default("[]"),
  difficulty: text("difficulty").notNull().default("适中"),
  recipeSummary: text("recipe_summary").notNull().default(""),
  substitutions: text("substitutions").notNull().default("[]"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const shoppingChecks = sqliteTable("shopping_checks", {
  itemKey: text("item_key").primaryKey(),
  checked: integer("checked").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const menuCategories = sqliteTable("menu_categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  emoji: text("emoji").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pantryItems = sqliteTable("pantry_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  unit: text("unit").notNull(),
  type: text("type").notNull().default("其他"),
  location: text("location").notNull().default("家中库存"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

export const dinnerInvites = sqliteTable("dinner_invites", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  mealDate: text("meal_date").notNull(),
  theme: text("theme").notNull().default("warm"),
  dishIds: text("dish_ids").notNull().default("[]"),
  recommendedDishIds: text("recommended_dish_ids").notNull().default("[]"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const dinnerJournals = sqliteTable("dinner_journals", {
  id: text("id").primaryKey(),
  inviteId: text("invite_id").notNull().default(""),
  orderId: text("order_id").notNull().default(""),
  title: text("title").notNull().default("今晚的餐桌日记"),
  note: text("note").notNull().default(""),
  imageUrls: text("image_urls").notNull().default("[]"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
