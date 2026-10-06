import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { participantsTable, transactionsTable } from "./core";

/**
 * Provider-side record for one Credas check on a transaction. Credas identifiers
 * stay server-side; `result` holds only the sanitised outcome shown to the customer.
 */
export const credasChecksTable = pgTable("credas_checks", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => participantsTable.id, { onDelete: "set null" }),
  kind: text("kind").notNull(),
  slot: integer("slot").notNull().default(0),
  state: text("state").notNull().default("starting"),
  outcome: text("outcome"),
  attemptId: text("attempt_id"),
  attempts: integer("attempts").notNull().default(0),
  entityId: text("entity_id"),
  processId: text("process_id"),
  processActorId: integer("process_actor_id"),
  dataCheckId: integer("data_check_id"),
  rtrCheckId: integer("rtr_check_id"),
  webhookTokenHash: text("webhook_token_hash"),
  providerStatus: text("provider_status"),
  result: jsonb("result").$type<Record<string, unknown>>().notNull().default({}),
  inviteCount: integer("invite_count").notNull().default(0),
  lastInviteAt: timestamp("last_invite_at", { withTimezone: true }),
  lastMagicLinkAt: timestamp("last_magic_link_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("credas_checks_transaction_kind_slot_idx").on(table.transactionId, table.kind, table.slot),
  uniqueIndex("credas_checks_process_idx").on(table.processId),
  uniqueIndex("credas_checks_webhook_token_idx").on(table.webhookTokenHash),
]);

export type CredasCheck = typeof credasChecksTable.$inferSelect;
