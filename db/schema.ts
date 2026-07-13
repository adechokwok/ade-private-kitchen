import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  mealDate: text("meal_date").notNull(),
  guestCount: integer("guest_count").notNull(),
  note: text("note").notNull().default(""),
  dishes: text("dishes").notNull(),
  status: text("status", { enum: ["new", "confirmed", "done"] }).notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
