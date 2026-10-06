# Credas checks

The six Credas products (Bank Account Check, Property Ownership Check, Verify, Verify Both, Verify Plus,
Right to Rent) run entirely server-side. The browser never calls Credas and never sees the API key or a
Credas identifier.

## Where things live

| Piece | File |
|---|---|
| Credas HTTP client, one method per endpoint | `artifacts/api-server/src/lib/integrations/credas.ts` |
| Input validation, provider-code mapping, status derivation (pure) | `artifacts/api-server/src/lib/credas-rules.ts` |
| Orchestration: payment gate, locking, results, webhook, staff actions | `artifacts/api-server/src/lib/credas-checks.ts` |
| Routes | `artifacts/api-server/src/routes/credas.ts` |
| Provider-side record per check | `credas_checks` table, `lib/db/src/schema/credas.ts` |
| Customer screen | `artifacts/depositsafe/src/components/credas-check-panel.tsx` |

## Configuration

| Variable | Purpose |
|---|---|
| `CREDAS_API_KEY` | Required. Per environment. |
| `CREDAS_ENVIRONMENT` | `sandbox` or `production`. Defaults to sandbox in development and production in a production runtime. Requests only ever go to `portal.credasdemo.com` or `portal.credas.com`. |
| `CREDAS_IDENTITY_JOURNEY_ID`, `CREDAS_IDENTITY_ACTOR_ID`, `CREDAS_RIGHT_TO_RENT_JOURNEY_ID`, `CREDAS_RIGHT_TO_RENT_ACTOR_ID` | Required in production (read them from `GET /api/admin/credas/journeys`). The sandbox falls back to Credas's public sandbox IDs. |
| `DEPOSITSAFE_PUBLIC_ORIGIN` | Public HTTPS origin for the webhook URL. Without one, no webhook is registered and results arrive by polling only. |
| `CREDAS_WEBHOOK_HEADER_NAME`, `CREDAS_WEBHOOK_HEADER_VALUE` | Optional shared header, if Credas enables one on the account. When set, webhooks without it are rejected. |
| `CREDAS_LAND_REGISTRY_TITLE_REGISTER` | `true` buys the title register with each property check (chargeable). Off by default. |

## Customer endpoints

All require transaction owner or guest-capability access and a confirmed payment at the locked price.

| Endpoint | Credas calls |
|---|---|
| `GET /transactions/{ref}/credas` | none (stored state) |
| `POST .../credas/start` | `POST /processes` per person |
| `POST .../credas/bank-account` | `POST /entities` (Bank Account Check only), `POST .../data-checks/bank-account` |
| `POST .../credas/property` | `POST /entities`, `POST .../data-checks/land-registry` |
| `POST .../credas/property/title` | `PUT .../land-registry/retrieve-title-deeds`, `GET .../land-registry` |
| `POST .../credas/refresh` | `GET /processes/{id}`, then `GET /entities/{id}/summary`, or `active-checks`, `data-checks/rtr/{id}` and `share-codes`, or `GET .../land-registry` |
| `POST .../credas/checks/{id}/resend-invite` | `PUT /entities/{id}/resend-invite`, or `new-invite` after expiry |
| `POST .../credas/checks/{id}/journey-link` | `GET /processes/{id}/entities/{id}/magic-link` |
| `GET .../credas/checks/{id}/documents/{doc}` | bank account PDF, process PDF export, settled-status PDF, Land Registry file |

Staff endpoints (`/admin/credas/journeys`, `/admin/credas/checks/{id}/actions`) cover `GET /journeys`,
`new-invite`, `expire-invite`, `reinvite-idv`, the Right to Rent outcome `PUT`, `DELETE /processes/{id}` and
`hard-delete`. `GET /processes/{id}/details` is implemented in the client but not exposed: it returns raw
personal data and nothing needs it.

## Security model

- **Payment gate.** Every action checks for a `paid` Stripe payment at the product's locked amount inside the
  same transaction that claims the check.
- **One result per purchase.** A check row is claimed under a per-transaction advisory lock with an attempt ID.
  A completed check is immutable; repeat submissions return the stored result without calling Credas. If an
  attempt may have reached Credas without a response, the next attempt adopts that check instead of buying another.
- **Webhooks are unsigned, so the body is never trusted.** Each process gets a random 256-bit token in its
  callback URL; only its SHA-256 hash is stored. A webhook must present a known token and the matching process
  ID. The status and result are then read back from Credas with the API key. The token is in the query string,
  which request logging strips.
- **Journey links are the participant's sign-in.** Credas's magic link contains the participant's email and
  registration code. It is issued only when the participant's email is the transaction owner's own email,
  never to staff, and only if it is HTTPS on the Credas domain.
- **The journey is embedded, not linked.** `credas-journey-frame.tsx` shows it in a dialog on the transaction
  page. The frame is sandboxed without `allow-top-navigation`, so it cannot move the DepositSafe page; camera
  and microphone are delegated to the journey's origin only; no referrer is sent; and the link is held in
  memory, never in storage or the address bar. Messages from the frame are only a prompt to ask the server
  for the latest state. A new-tab fallback covers browsers that block the camera inside frames.
- **Input validation.** Names, addresses, UK postcodes, sort codes, account numbers and dates are validated
  and normalised server-side before any provider call. The country is fixed to the United Kingdom.
- **Data minimisation.** The account number is stored and shown as its last four digits. Document numbers,
  dates of birth, share codes and Credas IDs are never stored in results or returned to the browser.
- **Documents.** PDFs are streamed through the API with access checks, verified as real PDFs, sent as
  attachments and never cached. Owners can download the bank report, the Right to Rent report, the Home
  Office certificate and Land Registry files. The identity report contains ID images and is staff-only.
- **Staff actions** require an administrator role, claim or configured verified email. The development
  administrator bypass does not apply. Every action is written to `audit_events`.
- **Provider errors** are mapped to fixed messages; Credas response text is never forwarded.

## Status mapping

| Situation | Transaction status |
|---|---|
| Invitation sent, journey not started | `AWAITING_PARTICIPANT` |
| Journey in progress, or waiting on a second check | `VERIFICATION_IN_PROGRESS` |
| Every required check has a pass, refer or fail result | `RESULT_GENERATED` |
| Credas needs a manual review | `MANUAL_ATTENTION` |
| Invitation expired | `EXPIRED` |
| A check could not be run, or its process was deleted | `VERIFICATION_FAILED` |

Verify Both releases its result only when both people are complete. Verify Plus needs both the identity
and the bank result.

## Observed in the sandbox (3 October 2026)

- The documented bank "pass" data (Ruth Goodwin, 56-00-36, 44444443) returns **Refer**, not Pass.
- Invalid bank input returns HTTP 500, not 400. `resend-invite` for a never-invited person also returns 500.
- An address with no registered title returns `AutoFail` with no titles. This is treated as a correctable
  input error for up to three lookups, then recorded as a fail.
- `requiresAdditionalTitleRetrieval` is only true when a title document is requested.
- Credas sends a webhook when a process is deleted, not only on completion.
- `hard-delete` returns 200 and sets the entity's status to Deleted, but the entity and its data were still
  readable through the API afterwards. Confirm the erasure behaviour with Credas before relying on it.

## Not yet proven

A real person completing an identity or Right to Rent journey has not been run, so the completed-journey
result mapping is covered by unit tests and the Credas schema only. There is no background job: an expired
or abandoned journey is detected when the transaction page is open or a webhook arrives.

## Development commands

```sh
pnpm --filter @workspace/scripts exec tsx --test \
  ../artifacts/api-server/src/lib/credas-rules.test.ts \
  ../artifacts/api-server/src/lib/integrations/credas.test.ts
```

Production schema changes go through Replit Publish; `credas_checks` is new and must be included.
