import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getStripeContext, LOCKED_PRODUCTS, stripeMode } from "@workspace/stripe";
import { pool } from "@workspace/db";

if (stripeMode() !== "test") throw new Error("Verification refuses production/live mode.");
const { stripe } = await getStripeContext("test");
assert.equal((await stripe.balance.retrieve()).livemode, false);
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
async function api(path: string, method = "GET", body?: unknown, capability?: string) {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { "content-type": "application/json", origin,
      ...(capability ? { "x-guest-capability": capability } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json() as Record<string, any>;
  return { status: response.status, data };
}
try {
  for (const product of LOCKED_PRODUCTS) {
    const email = `sandbox-${randomUUID()}@example.com`;
    const participants = [{ name: "Sandbox API Tester", email }];
    if (product.slug === "verify-both") participants.push({ name: "Sandbox Second Tester", email: `second-${randomUUID()}@example.com` });
    const transaction = await api("/transactions", "POST", { productSlug: product.slug, email, participants });
    assert.equal(transaction.status, 201);
    const { reference, guestCapability } = transaction.data;
    assert.ok(guestCapability);
    const input = { idempotencyKey: randomUUID(), successUrl: `${origin}/transactions/${reference}?payment=success`,
      cancelUrl: `${origin}/transactions/${reference}?payment=cancel` };
    const first = await api(`/transactions/${reference}/payments/checkout`, "POST", input, guestCapability);
    assert.equal(first.status, 201, first.data.error);
    assert.equal(first.data.amountPence, product.amount);
    const session = await stripe.checkout.sessions.retrieve(first.data.checkoutSessionReference);
    assert.equal(session.livemode, false);
    assert.equal(session.amount_total, product.amount);
    const duplicate = await api(`/transactions/${reference}/payments/checkout`, "POST",
      { ...input, idempotencyKey: randomUUID() }, guestCapability);
    assert.equal(duplicate.status, 201, duplicate.data.error);
    assert.equal(duplicate.data.checkoutSessionReference, session.id);
    assert.equal((await api(`/transactions/${reference}`)).status, 403);
    assert.equal((await api(`/transactions/${reference}/payments/checkout`, "POST", input)).status, 403);
    const unsafe = await api(`/transactions/${reference}/payments/checkout`, "POST",
      { ...input, successUrl: `https://attacker.example/transactions/${reference}` }, guestCapability);
    assert.equal(unsafe.status, 400);
    const current = await api(`/transactions/${reference}`, "GET", undefined, guestCapability);
    assert.equal(current.data.status, "PAYMENT_PENDING");
    console.log(JSON.stringify({ product: product.name, amountPence: product.amount, reference, mode: "test",
      checkout: "passed", idempotentReuse: "passed", unauthorizedAccess: "rejected", unsafeReturnUrl: "rejected" }));
  }
  const invalidSignature = await fetch(`${origin}/api/webhooks/stripe`, {
    method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=invalid` },
    body: "{}",
  });
  assert.equal(invalidSignature.status, 400);
  console.log("Invalid Stripe webhook signature rejected: PASS");
} finally { await pool.end(); }