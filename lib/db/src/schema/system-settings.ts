import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

export const systemSettingsTable = pgTable("system_settings", {
  id: integer("id").primaryKey().default(1),
  appName: text("app_name").notNull().default("Vela Inventory Cosmetics Catalog"),
  sessionTimeoutMinutes: integer("session_timeout_minutes").notNull().default(5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SystemSettings = typeof systemSettingsTable.$inferSelect;
