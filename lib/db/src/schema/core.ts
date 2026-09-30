import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productConfigurationsTable } from "./products";

export const transactionStatus = pgEnum("transaction_status", [
  "STARTED",
  "PAYMENT_PENDING",
  "PAID",
  "VERIFICATION_PENDING",
  "VERIFICATION_IN_PROGRESS",
  "VERIFICATION_COMPLETED",
  "RESULT_GENERATED",
  "DELIVERED",
  "PAYMENT_FAILED",
  "AWAITING_PARTICIPANT",
  "EXPIRED",
  "VERIFICATION_FAILED",
  "MANUAL_ATTENTION",
]);

export const userRole = pgEnum("user_role", ["customer", "admin"]);

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").unique(),
    displayName: text("display_name").notNull(),
    role: userRole("role").notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId)],
);

export const userEmailsTable = pgTable(
  "user_emails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("user_emails_email_idx").on(table.email)],
);

export const transactionsTable = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reference: text("reference").notNull().unique(),
    guestCapabilityHash: text("guest_capability_hash"),
    userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    productId: uuid("product_id").notNull().references(() => productConfigurationsTable.id),
    guestEmail: text("guest_email").notNull(),
    status: transactionStatus("status").notNull().default("STARTED"),
    statusChangedAt: timestamp("status_changed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("transactions_reference_idx").on(table.reference)],
);

export const participantsTable = pgTable("participants", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentsTable = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("stripe"),
  providerReference: text("provider_reference"),
  checkoutSessionReference: text("checkout_session_reference"),
  paymentIntentReference: text("payment_intent_reference"),
  idempotencyKey: text("idempotency_key"),
  lastProviderEventAt: timestamp("last_provider_event_at", { withTimezone: true }),
  amountPence: integer("amount_pence").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("payments_provider_checkout_session_idx").on(table.provider, table.checkoutSessionReference),
  uniqueIndex("payments_provider_payment_intent_idx").on(table.provider, table.paymentIntentReference),
  uniqueIndex("payments_transaction_idempotency_idx").on(table.transactionId, table.idempotencyKey),
]);

export const verificationsTable = pgTable("verifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  participantId: uuid("participant_id").references(() => participantsTable.id, { onDelete: "set null" }),
  provider: text("provider").notNull(),
  providerReference: text("provider_reference"),
  providerStatus: text("provider_status"),
  companyNumber: text("company_number"),
  companyName: text("company_name"),
  status: text("status").notNull().default("pending"),
  lastProviderEventAt: timestamp("last_provider_event_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("verifications_provider_reference_idx").on(table.provider, table.providerReference),
]);

export const providerEventsTable = pgTable("provider_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id"),
  eventType: text("event_type").notNull(),
  externalReference: text("external_reference"),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  processingStatus: text("processing_status").notNull().default("received"),
  processingError: text("processing_error"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("provider_events_provider_external_event_idx").on(table.provider, table.externalEventId),
]);

export const resultsTable = pgTable("results", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  outcome: text("outcome"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentsTable = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  transactionId: uuid("transaction_id").notNull().references(() => transactionsTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(),
  objectPath: text("object_path"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id, { onDelete: "cascade" }),
  channel: text("channel").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEventsTable = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  transactionId: uuid("transaction_id").references(() => transactionsTable.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserEmailSchema = createInsertSchema(userEmailsTable).omit({ id: true, createdAt: true });
export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertParticipantSchema = createInsertSchema(participantsTable).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVerificationSchema = createInsertSchema(verificationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderEventSchema = createInsertSchema(providerEventsTable).omit({ id: true, receivedAt: true });
export const insertResultSchema = createInsertSchema(resultsTable).omit({ id: true, createdAt: true });
export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({ id: true, createdAt: true });
export const insertAuditEventSchema = createInsertSchema(auditEventsTable).omit({ id: true, createdAt: true });

export type User = typeof usersTable.$inferSelect;
export type UserEmail = typeof userEmailsTable.$inferSelect;
export type Transaction = typeof transactionsTable.$inferSelect;
export type Participant = typeof participantsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type Verification = typeof verificationsTable.$inferSelect;
export type ProviderEvent = typeof providerEventsTable.$inferSelect;
export type Result = typeof resultsTable.$inferSelect;
export type Document = typeof documentsTable.$inferSelect;
export type Notification = typeof notificationsTable.$inferSelect;
export type AuditEvent = typeof auditEventsTable.$inferSelect;
export type TransactionStatus = z.infer<typeof insertTransactionSchema>["status"];