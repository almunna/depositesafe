import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const productConfigurationsTable = pgTable("product_configurations", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  pricePence: integer("price_pence").notNull(),
  provider: text("provider").notNull(),
  participantMode: text("participant_mode").notNull().default("single"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductConfigurationSchema = createInsertSchema(productConfigurationsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ProductConfiguration = typeof productConfigurationsTable.$inferSelect;
export type InsertProductConfiguration = z.infer<typeof insertProductConfigurationSchema>;