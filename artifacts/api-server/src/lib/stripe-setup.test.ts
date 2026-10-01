import assert from "node:assert/strict";
import test from "node:test";
import { stripeWebhookUrl, missingStripeWebhookEvents } from "./stripe-setup";

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