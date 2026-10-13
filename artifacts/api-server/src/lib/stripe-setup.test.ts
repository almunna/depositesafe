import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isStripeSyncEndpoint, stripeWebhookUrl, missingStripeWebhookEvents } from "./stripe-setup";

test("Stripe callback remains at the actual API root with slash or frontend path configuration", () => {
  assert.equal(stripeWebhookUrl("https://safe.example/"), "https://safe.example/api/webhooks/stripe");
  assert.equal(stripeWebhookUrl("https://safe.example/depositsafe/"), "https://safe.example/api/webhooks/stripe");
  assert.throws(() => stripeWebhookUrl("http://safe.example"), /HTTPS/);
  assert.throws(() => stripeWebhookUrl("https://user:password@safe.example"), /credentials/);
});

test("existing managed Stripe endpoints must subscribe to all required payment events", () => {
  assert.deepEqual(missingStripeWebhookEvents(["*"]), []);
  const missing = missingStripeWebhookEvents(["checkout.session.completed"]);
  assert.ok(missing.includes("checkout.session.async_payment_succeeded"));
  assert.ok(missing.includes("checkout.session.async_payment_failed"));
  assert.ok(missing.includes("checkout.session.expired"));
});

test("only SDK-marked endpoints count as stripe-sync; a shared-sandbox endpoint does not", () => {
  assert.equal(isStripeSyncEndpoint({ metadata: { managed_by: "stripe-sync" }, description: null }), true);
  assert.equal(isStripeSyncEndpoint({ metadata: { managed_by: "Stripe Sync" }, description: null }), true);
  assert.equal(isStripeSyncEndpoint({ metadata: {}, description: "Managed by stripe-sync" }), true);
  assert.equal(isStripeSyncEndpoint({ metadata: { managed_by: "depositsafe", depositsafe_role: "shared-sandbox" }, description: null }), false);
  assert.equal(isStripeSyncEndpoint({ metadata: {}, description: null }), false);
});

test("a shared sandbox adds its own endpoint, and live still refuses an untracked stripe-sync endpoint", async () => {
  const source = await readFile(new URL("./stripe-setup.ts", import.meta.url), "utf8");
  assert.match(source, /if \(mode !== "test"\) \{\s+throw new Error\("An untracked stripe-sync webhook requires ownership review/);
  assert.match(source, /metadata: sharedSandboxMetadata/);
});

test("webhook and SDK initialization is independent of product catalogue matching", async () => {
  const source = await readFile(new URL("./stripe-setup.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /syncStripeCatalog|loadLockedCatalog/);
});