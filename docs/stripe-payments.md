# DepositSafe Stripe payments

## Locked catalogue

Existing LIVE products/prices are mapped, not created or modified:

| Product | GBP |
|---|---:|
| Company Check | £4.99 |
| Bank Account Check | £7.99 |
| Verify | £9.99 |
| Property Ownership Check | £12.99 |
| Verify Both | £14.99 |
| Verify Plus | £14.99 |
| Right to Rent | £19.99 |

LIVE references use `stripe_product_id` / `stripe_price_id`. Sandbox references use separate
`stripe_sandbox_product_id` / `stripe_sandbox_price_id` columns. Sandbox copies were explicitly
bootstrapped because that account had no catalogue. Names, amounts and providers remain unchanged.

## Environment and security

- Development uses the allowlisted sandbox account; production/deployment identity uses the allowlisted
  DepositSafe LIVE account. Account ID and secret-key mode must both match. No first-connection or test-key fallback.
- Connector credentials are fetched afresh and never exposed to the browser. Native connection settings
  use `secret`, `publishable` and `account_id`; some inventory views show only one of multiple native connections.
- Checkout requires transaction owner/admin authorization or a valid guest capability. Server-side price
  retrieval validates the transaction's exact active GBP product, amount and mode. Checkout maps only that
  locked product; duplicate prices for other products do not block it, while duplicate matches for its own
  product remain rejected. No caller-controlled amounts or `price_data`.
- Trusted application origins and transaction-specific return paths prevent arbitrary redirects.
- Return URLs never mark a transaction paid. Only signature-verified Stripe Checkout events do that.
- Transaction locks, deterministic payment metadata IDs and Stripe idempotency keys protect retries.
  Duplicate events are stored once; late failures cannot downgrade paid transactions or supersede newer attempts.
- Payment handling does not start or alter Credas verification.

## Webhooks and startup

`POST /api/webhooks/stripe` receives raw bytes before JSON parsing or Clerk middleware.
The managed `stripe-replit-sync` handler verifies the signature and synchronizes its owned schema before
application reconciliation. Invalid signatures return 400; processing problems return a retryable 503.
The callback is always at the API root, regardless of the frontend base path.

The sync package must remain external to the server bundle: its migration runner loads sibling SQL files.
Development initializes the SDK schema using its own migrations. Production performs read-only SDK-table,
permission, application-column and uniqueness-index readiness checks. **Replit Publish applies development
schema changes to production; no custom production migration or startup DDL is used.**

Required webhook subscriptions are verified/reconciled. Untracked stripe-sync endpoints cause initialization
to stop rather than allowing the SDK to delete another project's endpoints. Failed initialization is retriable
after five seconds. Webhook/SDK readiness does not depend on product-catalog matching. Checkout synchronizes
only its own locked product, while explicit all-product catalogue sync remains strict. Historical backfill
runs independently so it cannot block a current payment.

## Verification and publishing

- All seven sandbox products created Checkout sessions at the locked amounts.
- Repeat checkout calls reused the existing session; unauthorized transaction/checkout requests and
  untrusted return URLs were rejected. Invalid webhook signatures were rejected.
- Browser sandbox Company Check payment: cancellation/resume worked; Stripe's genuine completed session
  was paid for £4.99 using a test card. No real card or LIVE charge was used.
- Automatic delivery to the temporary development webhook URL remained pending. The genuine Stripe test
  event was retrieved and replayed with the stored sandbox signing secret through the same raw webhook route:
  HTTP 200, payment `paid`, transaction `PAID`, and browser “Payment confirmed”. This was not a fabricated payment.
- Replay verification confirms one event record and no repeated payment timestamp update.
- Automatic external webhook delivery and deployed LIVE readiness still require a stable published URL.
  The app is not published, and no production charge or production database change was performed.
- During Publish, review/apply the development schema diff and avoid copying sandbox transaction data into
  production. Then verify production initialization, LIVE account selection, all seven mapped prices,
  correct public webhook URL/subscriptions and a real Stripe delivery's HTTP response without taking a real charge.
  Existing live Stripe objects remain untouched.

Development-only scripts (refuse live runtime):

```sh
pnpm --filter @workspace/scripts exec tsx src/verify-stripe-sandbox.ts
pnpm --filter @workspace/scripts exec tsx src/stripe-sandbox-event-audit.ts cs_test_...
# Local replay of a genuine already-paid test event, never a live event:
pnpm --filter @workspace/scripts exec tsx src/stripe-sandbox-event-audit.ts cs_test_... --deliver
```