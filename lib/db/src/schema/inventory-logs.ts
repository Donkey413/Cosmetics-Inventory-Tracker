import { pgTable, text, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { productsTable } from "./products";
import { usersTable } from "./users";
import { locationsTable } from "./locations";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inventoryLogsTable = pgTable("inventory_logs", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  locationId: integer("location_id").references(() => locationsTable.id, { onDelete: "set null" }),
  type: text("type").notNull(), // 'initial' | 'in' | 'out' | 'adjustment'
  quantityChange: integer("quantity_change").notNull(), // positive = in, negative = out
  openingBalance: integer("opening_balance").notNull(),
  closingBalance: integer("closing_balance").notNull(),
  notes: text("notes"),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventoryLogSchema = createInsertSchema(inventoryLogsTable).omit({ id: true, createdAt: true });
export type InsertInventoryLog = z.infer<typeof insertInventoryLogSchema>;
export type InventoryLog = typeof inventoryLogsTable.$inferSelect;
