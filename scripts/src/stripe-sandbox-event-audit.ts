import assert from "node:assert/strict";
import { getStripeContext, STRIPE_ACCOUNTS, stripeMode } from "@workspace/stripe";
import { pool } from "@workspace/db";

if (stripeMode() !== "test") throw new Error("Sandbox event audit refuses production.");
const sessionId = process.argv[2];
if (!sessionId?.startsWith("cs_test_")) throw new Error("A sandbox Checkout session ID is required.");
const { stripe } = await getStripeContext("test");
try {
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  assert.equal(session.livemode, false);
  console.log(JSON.stringify({ sessionId, status: session.status, paymentStatus: session.payment_status,
    amountPence: session.amount_total, reference: session.client_reference_id }));
  for await (const webhook of stripe.webhookEndpoints.list({ limit: 100 })) {
    console.log(JSON.stringify({ webhookId: webhook.id, url: webhook.url, status: webhook.status, events: webhook.enabled_events }));
  }
  const events = await stripe.events.list({ type: "checkout.session.completed", limit: 100 });
  const event = events.data.find(event => (event.data.object as { id?: string }).id === sessionId);
  if (!event) throw new Error("No genuine completed Checkout event exists for this sandbox session.");
  assert.equal(event.livemode, false);
  console.log(JSON.stringify({ eventId: event.id, type: event.type, pendingWebhooks: event.pending_webhooks }));
  if (process.argv.includes("--deliver")) {
    assert.equal(session.payment_status, "paid", "Never redeliver a paid event without verified actual Stripe payment.");
    const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const url = `${origin}/api/webhooks/stripe`;
    const managed = await pool.query(
      "SELECT secret FROM stripe._managed_webhooks WHERE account_id=$1 AND url=$2",
      [STRIPE_ACCOUNTS.test, url],
    );
    assert.equal(managed.rowCount, 1);
    // Local development replay of a GENUINE retrieved test event, not a fabricated paid payload.
    // No secrets are printed. This exercises the same raw signature/reconciliation route.
    const payload = JSON.stringify(event);
    const before = await pool.query(
      "SELECT status, updated_at FROM public.payments WHERE checkout_session_reference=$1", [sessionId],
    );
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: managed.rows[0].secret });
    const response = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json", "stripe-signature": signature }, body: payload,
    });
    console.log(JSON.stringify({ replayHttpStatus: response.status, result: await response.json() }));
    const payment = await pool.query(
      `SELECT t.reference, t.status AS transaction_status, p.status AS payment_status,
       e.processing_status, e.processing_error FROM public.transactions t JOIN public.payments p ON p.transaction_id=t.id
       LEFT JOIN public.provider_events e ON e.external_event_id=$1 AND e.provider='stripe'
       WHERE p.checkout_session_reference=$2`, [event.id, sessionId],
    );
    console.log(JSON.stringify({ reconciliation: payment.rows }));
    assert.equal(response.status, 200);
    assert.equal(payment.rows[0]?.transaction_status, "PAID");
    const duplicateCheck = await pool.query(`
      SELECT (SELECT count(*)::int FROM public.provider_events WHERE provider='stripe' AND external_event_id=$1) AS event_rows,
        status, updated_at FROM public.payments WHERE checkout_session_reference=$2`, [event.id, sessionId]);
    assert.equal(duplicateCheck.rows[0].event_rows, 1);
    assert.equal(duplicateCheck.rows[0].status, "paid");
    if (before.rows[0]?.status === "paid") {
      assert.equal(duplicateCheck.rows[0].updated_at.getTime(), before.rows[0].updated_at.getTime());
      console.log("Genuine paid-event replay was idempotent: one event record; payment timestamp unchanged.");
    }
  }
} finally { await pool.end(); }