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

/** True for endpoints the sync SDK treats as its own, and deletes when its database does not track them. */
export function isStripeSyncEndpoint(endpoint: Pick<Stripe.WebhookEndpoint, "metadata" | "description">) {
  const normalize = (value?: string | null) => value?.toLowerCase().replace(/[\s-]+/g, "") ?? "";
  return normalize(endpoint.metadata?.managed_by) === "stripesync" || normalize(endpoint.description).includes("stripesync");
}

// Sandbox only. Another environment (for example a staging deployment with its own
// database) owns the account's stripe-sync endpoint, so this one registers an endpoint
// of its own beside it. It is deliberately not marked stripe-sync: neither the SDK
// cleanup nor the other environment's ownership check will then touch it. Each
// endpoint keeps its own signing secret, so signature verification is unchanged.
const sharedSandboxMetadata = { managed_by: "depositsafe", depositsafe_role: "shared-sandbox" } as const;

async function sharedSandboxWebhook(
  stripe: Stripe,
  sync: Awaited<ReturnType<typeof getStripeSync>>,
  accountId: string,
  url: string,
) {
  return sync.postgresClient.withAdvisoryLock(`webhook:${accountId}:${url}`, async () => {
    // Webhook verification reads a single stored secret, so keep exactly one row.
    const missing = (error: unknown) => {
      const { statusCode, code } = error as { statusCode?: number; code?: string };
      if (statusCode === 404 || code === "resource_missing") return undefined;
      throw error;
    };
    let kept: Stripe.WebhookEndpoint | undefined;
    for (const stored of await sync.listManagedWebhooks()) {
      const current = await stripe.webhookEndpoints.retrieve(stored.id).catch(missing);
      if (!kept && current && stored.url === url && current.status === "enabled") {
        kept = current;
        continue;
      }
      if (current) await stripe.webhookEndpoints.del(stored.id).catch(missing);
      await sync.postgresClient.delete("_managed_webhooks", stored.id);
    }
    if (kept) return kept;
    const webhook = await stripe.webhookEndpoints.create({
      url, enabled_events: requiredEvents, metadata: sharedSandboxMetadata,
    });
    await sync.upsertManagedWebhooks([webhook], accountId);
    return webhook;
  });
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
    const { stripe, mode, accountId } = await getStripeContext();
    const balance = await stripe.balance.retrieve();
    if (balance.livemode !== (mode === "live")) throw new Error("Stripe environment mismatch.");
    const sync = await getStripeSync();
    const domain = process.env.REPLIT_DOMAINS?.split(",")[0] ?? process.env.REPLIT_DEV_DOMAIN;
    const origin = process.env.DEPOSITSAFE_PUBLIC_ORIGIN ?? (domain ? `https://${domain}` : undefined);
    if (!origin) throw new Error("Public origin unavailable for Stripe webhook registration.");
    const url = stripeWebhookUrl(origin);
    // SDK creation deletes untracked stripe-sync endpoints. Never disrupt webhooks
    // managed by another project using this Stripe account: live refuses to start,
    // the sandbox registers its own endpoint beside them.
    const storedWebhooks = await sync.listManagedWebhooks();
    const managedIds = new Set(storedWebhooks.map(webhook => webhook.id));
    let sharedSandbox = false;
    for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
      if (isStripeSyncEndpoint(endpoint) && !managedIds.has(endpoint.id)) {
        if (mode !== "test") {
          throw new Error("An untracked stripe-sync webhook requires ownership review; no endpoints were changed.");
        }
        sharedSandbox = true;
      }
    }
    const webhook = sharedSandbox
      ? await sharedSandboxWebhook(stripe, sync, accountId, url)
      : await sync.findOrCreateManagedWebhook(url, { enabled_events: requiredEvents });
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