import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicPaymentId,
  isSuccessfulCheckoutPaymentEvent,
  isPostPaymentTransactionStatus,
  shouldApplyPaymentEvent,
  shouldMarkTransactionPaymentFailed,
  stripeCheckoutIdempotencyKey,
  trustedCheckoutOrigins,
  validateCheckoutReturnUrls,
} from "./payments";

test("checkout idempotency key is stable per transaction, mode, key, and retry attempt", () => {
  const key = stripeCheckoutIdempotencyKey("transaction-id", "test", "browser-key-123", 0);
  assert.equal(key, stripeCheckoutIdempotencyKey("transaction-id", "test", "browser-key-123", 0));
  assert.notEqual(key, stripeCheckoutIdempotencyKey("transaction-id", "live", "browser-key-123", 0));
  assert.notEqual(key, stripeCheckoutIdempotencyKey("transaction-id", "test", "other-key-123", 0));
  assert.notEqual(key, stripeCheckoutIdempotencyKey("transaction-id", "test", "browser-key-123", 1));
  assert.equal(key.includes("browser-key-123"), false);
});

test("Stripe retries reuse a deterministic valid UUID for the persisted payment metadata", () => {
  const key = stripeCheckoutIdempotencyKey("transaction-id", "test", "browser-key-123", 1);
  const firstPaymentId = deterministicPaymentId(key);
  assert.equal(firstPaymentId, deterministicPaymentId(key));
  assert.match(
    firstPaymentId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.notEqual(firstPaymentId, deterministicPaymentId(`${key}:different`));
});

test("paid checkout events can promote despite stale timestamps, but stale failures cannot apply", () => {
  const laterFailureTime = new Date("2026-06-02T12:00:00Z");
  const earlierPaidTime = new Date("2026-06-02T11:00:00Z");
  assert.equal(
    isSuccessfulCheckoutPaymentEvent("checkout.session.completed", "paid"),
    true,
  );
  assert.equal(
    shouldApplyPaymentEvent(earlierPaidTime, laterFailureTime, true),
    true,
  );
  assert.equal(
    shouldApplyPaymentEvent(
      earlierPaidTime,
      laterFailureTime,
      isSuccessfulCheckoutPaymentEvent("checkout.session.async_payment_failed", "unpaid"),
    ),
    false,
  );
});

test("older failed attempts cannot set the transaction failed while a newer attempt is current", () => {
  assert.equal(shouldMarkTransactionPaymentFailed("attempt-new", "attempt-new"), true);
  assert.equal(shouldMarkTransactionPaymentFailed("attempt-old", "attempt-new"), false);
  assert.equal(shouldMarkTransactionPaymentFailed("attempt-old", undefined), false);
});

test("checkout return URLs accept transaction paths beneath configured app base paths", () => {
  const env = {
    NODE_ENV: "development",
    DEPOSITSAFE_PUBLIC_ORIGIN: "https://safe.example/app/",
    REPLIT_DEV_DOMAIN: "safe-dev.example",
  };
  const origin = "https://safe-dev.example";
  const result = validateCheckoutReturnUrls(
    {
      successUrl: `${origin}/base/transactions/DS-2026-ABC?payment=success`,
      cancelUrl: `${origin}/transactions/DS-2026-ABC?payment=cancel`,
    },
    "DS-2026-ABC",
    origin,
    env,
  );
  assert.equal(new URL(result.successUrl).origin, origin);
  assert.equal(new URL(result.cancelUrl).pathname, "/transactions/DS-2026-ABC");
});

test("checkout return URL validation rejects caller-selected origins and wrong paths", () => {
  const env = { NODE_ENV: "development", DEPOSITSAFE_PUBLIC_ORIGIN: "https://safe.example" };
  assert.throws(
    () => validateCheckoutReturnUrls(
      {
        successUrl: "https://attacker.example/transactions/DS-2026-ABC",
        cancelUrl: "https://safe.example/transactions/DS-2026-ABC",
      },
      "DS-2026-ABC",
      "https://safe.example",
      env,
    ),
    /trusted application origin/,
  );
  assert.throws(
    () => validateCheckoutReturnUrls(
      {
        successUrl: "https://safe.example/other/DS-2026-ABC",
        cancelUrl: "https://safe.example/transactions/DS-2026-ABC",
      },
      "DS-2026-ABC",
      "https://safe.example",
      env,
    ),
    /trusted application origin/,
  );
});

test("production checkout origins use public configuration or REPLIT_DOMAINS, not dev domains", () => {
  const trusted = trustedCheckoutOrigins({
    NODE_ENV: "production",
    REPLIT_DOMAINS: "app.example, www.example",
    REPLIT_DEV_DOMAIN: "untrusted-dev.example",
  });
  assert.deepEqual([...trusted.origins], ["https://app.example", "https://www.example"]);
  assert.equal(trusted.origins.has("https://untrusted-dev.example"), false);
});

test("paid and post-payment transaction statuses are protected from payment regressions", () => {
  assert.equal(isPostPaymentTransactionStatus("PAID"), true);
  assert.equal(isPostPaymentTransactionStatus("DELIVERED"), true);
  assert.equal(isPostPaymentTransactionStatus("PAYMENT_PENDING"), false);
  assert.equal(isPostPaymentTransactionStatus("PAYMENT_FAILED"), false);
});