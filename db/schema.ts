import { mysqlTable, int, double, text, timestamp, varchar } from "drizzle-orm/mysql-core";

const id = (name: string) => varchar(name, { length: 96 });
const shortText = (name: string) => varchar(name, { length: 512 });
const longText = (name: string) => text(name);

export const orders = mysqlTable("orders", {
  id: id("id").primaryKey(),
  customerName: shortText("customer_name").notNull(),
  mealDate: shortText("meal_date").notNull(),
  guestCount: int("guest_count").notNull(),
  note: longText("note").notNull().default(""),
  dishes: longText("dishes").notNull(),
  dishSnapshot: longText("dish_snapshot").notNull().default("[]"),
  inviteId: id("invite_id").notNull().default(""),
  guestToken: id("guest_token").notNull().default(""),
  progressNote: longText("progress_note").notNull().default(""),
  statusUpdatedAt: shortText("status_updated_at").notNull().default(""),
  statusReadAt: shortText("status_read_at").notNull().default(""),
  publishedMenu: longText("published_menu").notNull().default(""),
  publishedMenuUpdatedAt: shortText("published_menu_updated_at").notNull().default(""),
  menuReadAt: shortText("menu_read_at").notNull().default(""),
  archivedAt: shortText("archived_at").notNull().default(""),
  status: shortText("status").notNull().default("new"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const customDishes = mysqlTable("custom_dishes", {
  id: id("id").primaryKey(),
  name: shortText("name").notNull(),
  category: shortText("category").notNull(),
  description: longText("description").notNull().default(""),
  slogan: longText("slogan").notNull().default(""),
  flavor: shortText("flavor").notNull().default("家常风味"),
  minutes: int("minutes").notNull().default(30),
  baseServings: int("base_servings").notNull().default(4),
  imageUrl: longText("image_url").notNull().default(""),
  imagePosition: shortText("image_position").notNull().default("center"),
  gallery: longText("gallery").notNull().default("[]"),
  ingredients: longText("ingredients").notNull(),
  steps: longText("steps").notNull().default("[]"),
  source: longText("source").notNull().default(""),
  active: int("active").notNull().default(1),
  featured: int("featured").notNull().default(0),
  available: int("available").notNull().default(1),
  soldOut: int("sold_out").notNull().default(0),
  seasons: longText("seasons").notNull().default("[]"),
  occasions: longText("occasions").notNull().default("[]"),
  dietary: longText("dietary").notNull().default("[]"),
  difficulty: shortText("difficulty").notNull().default("适中"),
  recipeSummary: longText("recipe_summary").notNull().default(""),
  substitutions: longText("substitutions").notNull().default("[]"),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const shoppingChecks = mysqlTable("shopping_checks", {
  itemKey: id("item_key").primaryKey(),
  checked: int("checked").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const menuCategories = mysqlTable("menu_categories", {
  id: id("id").primaryKey(),
  name: shortText("name").notNull().unique(),
  emoji: shortText("emoji").notNull().default(""),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const pantryItems = mysqlTable("pantry_items", {
  id: id("id").primaryKey(),
  name: shortText("name").notNull(),
  amount: double("amount").notNull(),
  unit: shortText("unit").notNull(),
  type: shortText("type").notNull().default("其他"),
  location: shortText("location").notNull().default("家中库存"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const appSettings = mysqlTable("app_settings", {
  key: id("key").primaryKey(),
  value: longText("value").notNull().default(""),
});

export const dinnerInvites = mysqlTable("dinner_invites", {
  id: id("id").primaryKey(),
  token: id("token").notNull().unique(),
  title: shortText("title").notNull(),
  message: longText("message").notNull().default(""),
  mealDate: shortText("meal_date").notNull(),
  theme: shortText("theme").notNull().default("warm"),
  dishIds: longText("dish_ids").notNull().default("[]"),
  recommendedDishIds: longText("recommended_dish_ids").notNull().default("[]"),
  mode: shortText("mode").notNull().default("single"),
  sharedOrderId: id("shared_order_id").notNull().default(""),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  active: int("active").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});

export const dinnerInviteGuests = mysqlTable("dinner_invite_guests", {
  id: id("id").primaryKey(),
  inviteId: id("invite_id").notNull(),
  guestToken: id("guest_token").notNull().unique(),
  displayName: shortText("display_name").notNull().default("朋友"),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const dinnerInviteSelections = mysqlTable("dinner_invite_selections", {
  id: id("id").primaryKey(),
  inviteId: id("invite_id").notNull(),
  guestId: id("guest_id").notNull(),
  dishId: id("dish_id").notNull(),
  quantity: int("quantity").notNull().default(0),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
});

export const dinnerJournals = mysqlTable("dinner_journals", {
  id: id("id").primaryKey(),
  inviteId: id("invite_id").notNull().default(""),
  orderId: id("order_id").notNull().default(""),
  title: shortText("title").notNull().default("今晚的餐桌日记"),
  note: longText("note").notNull().default(""),
  imageUrls: longText("image_urls").notNull().default("[]"),
  updatedAt: timestamp("updated_at", { mode: "string" }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
});
