# Company Check handover

## Completed

- Real Companies House Public Data API, authenticated only on the server with
  `COMPANIES_HOUSE_API_KEY` from Replit Secrets. No client key or direct browser provider requests.
- Name search and normalized UK company-number lookup, explicit selection, partial-match/narrowing
  guidance, loading, no-match, upstream failure and retry states.
- Owner/guest-capability authorization; administrative access requires an explicit admin role.
- Only the existing Company Check product is supported, at its locked £4.99 price. A persisted
  confirmed Stripe payment is required before generating a result. No development bypass is in the app.
- Core public record: company name/number/status/type, incorporation/cessation dates, registered
  office, SIC codes, next accounts/confirmation-statement due dates, official source and checked time.
  This is public register information, not identity, creditworthiness or financial-health certification.
- Selection is stored on the existing Companies House verification record. Result JSON is stored on
  the existing results table and atomically moves the transaction to `RESULT_GENERATED`.
- Completed results persist across reloads, are immutable for another company, and repeated requests
  return the same result. Failed checks can retry; abandoned in-progress attempts have a bounded lease.
- Credas remains separate and unchanged. Homepage, Stripe code, dashboards/admin and other products/prices
  are unchanged. Only Company Check transaction detail receives the search/result panel and its status path.

## Verification

- Real Companies House API returned Tesco's profile; name and numeric searches and no-match responses passed.
- The development API harness verified unpaid/unauthorized rejection, failed lookup then successful retry,
  persisted result GET, duplicate result prevention, and rejection of another product.
  Its paid development fixtures are explicitly labelled test fixtures; it makes no Stripe calls or charges.
- Browser verification reused an already-paid sandbox Company Check transaction: no new checkout or charge.
  Tested no matches, ambiguous BARCLAYS search, numeric `445790` → `00445790` selection, real Tesco check,
  `RESULT_GENERATED`, full result display, reload persistence, temporary result-404 recovery, and unauthorized access.
- Integration/access helper tests, workspace typechecks, frontend build and focused review passed.

## Noon handover readiness

**Ready for a development demonstration and technical handover of Company Check.**
The result can be demonstrated on an already-paid development Company Check transaction.

**Not certified for a fresh live purchase-to-result journey.** Existing Stripe configuration errors were
observed separately: development refused untracked managed-webhook cleanup; the published server reported
two matching active LIVE £4.99 Company Check prices. No Stripe configuration, prices or webhooks were changed
as part of this task. Those blockers require a separate review.

Before production use, publish the latest Company Check code and development schema diff (Replit Publish
owns production migrations), confirm the Companies House secret is available in the published runtime,
and resolve/verify the existing Stripe purchase configuration. No automatic publish or production DDL was done.

## Development commands

```sh
pnpm --filter @workspace/scripts exec tsx --test \
  ../artifacts/api-server/src/lib/integrations/companies-house.test.ts \
  ../artifacts/api-server/src/lib/companies-house-access.test.ts
pnpm --filter @workspace/scripts exec tsx src/verify-company-check.ts
```

The harness refuses production runtime. Do not copy its development paid fixtures into production.