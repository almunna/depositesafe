# DepositSafe

DepositSafe is a browser-first foundation for starting and tracking Verify V1 deposit and identity checks with clear transaction references.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for the shared API contract.
- `lib/db/src/schema/` — PostgreSQL/Drizzle entities for the shared DepositSafe core.
- `artifacts/api-server/src/routes/` — API routes for products, accounts, transactions, admin, and reserved webhooks.
- `artifacts/api-server/src/lib/integrations/` — server-side placeholders for Stripe, Companies House, Credas, and Mailgun.
- `artifacts/depositsafe/src/` — responsive public, customer, auth, and admin application shell.

## Architecture decisions

- Clerk owns browser authentication and password storage; the app keeps a permanent internal user ID and supports multiple verified emails.
- Product prices live in the `product_configurations` table and are returned through one controlled product API.
- Guest transactions are first-class records with a unique DepositSafe reference and optional future account association.
- Provider-specific records and statuses are separate from the DepositSafe transaction status model.
- The browser supports only the Build 01 shells; provider verification, payments, reports, and document capture remain structural placeholders.

## Product

Build 01 provides the Verify V1 product directory, guest transaction creation, reference-based transaction tracking, customer dashboard shell, protected admin oversight shell, and shared core data model.

## User preferences

No additional preferences recorded.

## Gotchas

- Keep the OpenAPI spec and generated client/Zod packages in sync after API changes.
- The development admin path is intentionally permissive for foundation testing; production requires an admin role or configured administrator email.
- Clerk development and production environments have separate user stores and credentials.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `docs/credas-checks.md` for the Credas checks: endpoints, configuration and security model
