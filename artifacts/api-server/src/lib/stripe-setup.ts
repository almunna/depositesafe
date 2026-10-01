import { runMigrations } from "stripe-replit-sync";
import { getStripeSync, getStripeContext, stripeMode } from "@workspace/stripe";
import { pool } from "@workspace/db";
import type Stripe from "stripe";
import { logger } from "./logger";

let initialization: Promise<void> | undefined;
let retryAfter = 0;
const requiredEvents: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
  "payment_intent.succeeded", "payment_intent.payment_failed",
  "product.created", "product.updated", "price.created", "price.updated",
];

export function stripeWebhookUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("Stripe webhook public origin must be HTTPS without credentials, query or fragment.");
  }
  return new URL("/api/webhooks/stripe", url.origin).toString();
}

export function missingStripeWebhookEvents(events: string[]) {
  return events.includes("*") ? [] : requiredEvents.filter(event => !events.includes(event));
}

async function verifyPublishedSchema() {
  // Replit Publish owns production schema changes. Runtime checks only; no production DDL.
  const sdkTables = [
    "accounts", "_managed_webhooks", "_sync_status", "products", "prices", "plans", "customers",
    "subscriptions", "subscription_schedules", "invoices", "charges", "setup_intents",
    "payment_methods", "payment_intents", "tax_ids", "credit_notes", "disputes",
    "early_fraud_warnings", "refunds", "checkout_sessions", "checkout_session_line_items",
  ];
  const readiness = await pool.query(`
    SELECT name, to_regclass(format('stripe.%I',name)) IS NOT NULL AS present,
      COALESCE(has_table_privilege(current_user,to_regclass(format('stripe.%I',name)),'SELECT'),false) AS can_select,
      COALESCE(has_table_privilege(current_user,to_regclass(format('stripe.%I',name)),'INSERT'),false) AS can_insert,
      COALESCE(has_table_privilege(current_user,to_regclass(format('stripe.%I',name)),'UPDATE'),false) AS can_update,
      COALESCE(has_table_privilege(current_user,to_regclass(format('stripe.%I',name)),'DELETE'),false) AS can_delete
    FROM unnest($1::text[]) AS name`, [sdkTables]);
  if (readiness.rows.some(row => !row.present || !row.can_select || !row.can_insert || !row.can_update || !row.can_delete)) {
    throw new Error("Stripe SDK schema or runtime permissions are incomplete; apply development schema through Publish.");
  }
  await pool.query("SELECT stripe_sandbox_product_id, stripe_sandbox_price_id FROM public.product_configurations LIMIT 0");
  await pool.query("SELECT checkout_session_reference, payment_intent_reference, idempotency_key, last_provider_event_at FROM public.payments LIMIT 0");
  await pool.query("SELECT external_event_id, transaction_id, occurred_at, processing_status, processing_error, processed_at FROM public.provider_events LIMIT 0");
  const indexes = [
    "payments_provider_checkout_session_idx", "payments_provider_payment_intent_idx",
    "payments_transaction_idempotency_idx", "provider_events_provider_external_event_idx",
  ];
  const result = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1::text[])", [indexes]);
  if (result.rowCount !== indexes.length) throw new Error("Payment schema/indexes must be applied through Publish.");
}

export function initializeStripePayments() {
  if (!initialization && Date.now() < retryAfter) {
    return Promise.reject(new Error("Stripe initialization retry is temporarily delayed."));
  }
  initialization ??= (async () => {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
    if (stripeMode() === "test") await runMigrations({ databaseUrl: process.env.DATABASE_URL });
    else await verifyPublishedSchema();
    const { stripe, mode } = await getStripeContext();
    const balance = await stripe.balance.retrieve();
    if (balance.livemode !== (mode === "live")) throw new Error("Stripe environment mismatch.");
    const sync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN;
    const origin = process.env.DEPOSITSAFE_PUBLIC_ORIGIN ?? (domain ? `https://${domain}` : undefined);
    if (!origin) throw new Error("Public origin unavailable for Stripe webhook registration.");
    const url = stripeWebhookUrl(origin);
    // SDK creation deletes untracked stripe-sync endpoints. Refuse rather than
    // disrupt webhooks managed by another project using this Stripe account.
    const storedWebhooks = await sync.listManagedWebhooks();
    const managedIds = new Set(storedWebhooks.map(webhook => webhook.id));
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      const managed = endpoint.metadata.managed_by?.toLowerCase().replace(/[\s-]+/g, "") === "stripesync"
        || endpoint.description?.toLowerCase().replace(/[\s-]+/g, "").includes("stripesync");
      if (managed && !managedIds.has(endpoint.id)) {
        throw new Error("An untracked stripe-sync webhook requires ownership review; no endpoints were changed.");
      }
    }
    const webhook = await sync.findOrCreateManagedWebhook(url, { enabled_events: requiredEvents });
    if (missingStripeWebhookEvents(webhook.enabled_events).length > 0) {
      await sync.updateManagedWebhook(webhook.id, {
        enabled_events: [...new Set([...webhook.enabled_events, ...requiredEvents])] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
      });
    }
    // Backfill is required, but historical synchronization must not block
    // current checkout or verified webhook reconciliation on autoscale cold starts.
    void sync.syncBackfill({ object: "all" }).catch(() => {
      logger.error("Stripe historical backfill failed; current payment handling remains available.");
    });
  })().catch(error => {
    initialization = undefined;
    retryAfter = Date.now() + 5000;
    throw error;
  });
  return initialization;
}