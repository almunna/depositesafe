import Stripe from "stripe";
import { StripeSync } from "stripe-replit-sync";
export { matchLockedCatalog, loadLockedCatalog, ensureSandboxCatalog } from "./catalog";
export type { LockedProductSlug } from "./catalog";

export type StripeMode = "test" | "live";

// Explicit account allowlist: never select the first connector or another business.
export const STRIPE_ACCOUNTS = {
  test: "acct_1ULc6GIBxY0qS13J",
  live: "acct_1ULHxnRkgAdtD3xZ",
} as const;

export const LOCKED_PRODUCTS = [
  { slug: "company-check", name: "Company Check", amount: 499 },
  { slug: "bank-account-check", name: "Bank Account Check", amount: 799 },
  { slug: "verify", name: "Verify", amount: 999 },
  { slug: "property-ownership-check", name: "Property Ownership Check", amount: 1299 },
  { slug: "verify-both", name: "Verify Both", amount: 1499 },
  { slug: "verify-plus", name: "Verify Plus", amount: 1499 },
  { slug: "right-to-rent", name: "Right to Rent", amount: 1999 },
] as const;

export function stripeMode(): StripeMode {
  const production = process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT === "1"
    || Boolean(process.env.WEB_REPL_RENEWAL && !process.env.REPL_IDENTITY);
  // A production runtime hosted outside Replit (a staging deployment) may opt down
  // to the sandbox. Nothing opts a runtime up to live.
  if (production && !connectorIdentity() && process.env.STRIPE_MODE === "test") return "test";
  return production ? "live" : "test";
}

function connectorIdentity() {
  const host = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const token = process.env.REPL_IDENTITY ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : undefined;
  return host && token ? { host, token } : undefined;
}

// Outside Replit there is no connector, so the key comes from the environment.
// It is used only for the runtime's own mode, the key's mode must match, and a live
// key is accepted only for the allowlisted DepositSafe account. Never applies when
// the Replit connector identity is present.
function environmentCredentials(mode: StripeMode) {
  const key = process.env.STRIPE_SECRET_KEY;
  const accountId = process.env.STRIPE_ACCOUNT_ID;
  if (mode !== stripeMode() || connectorIdentity()) return undefined;
  if (!key || !accountId || !new RegExp(`^(?:sk|rk)_${mode}_`).test(key)) return undefined;
  if (mode === "live" && accountId !== STRIPE_ACCOUNTS.live) return undefined;
  return { key, accountId };
}

/** The Stripe account the runtime's credentials belong to. */
export function stripeAccountId(mode: StripeMode = stripeMode()): string {
  return environmentCredentials(mode)?.accountId ?? STRIPE_ACCOUNTS[mode];
}

async function credentials(mode: StripeMode) {
  const fromEnvironment = environmentCredentials(mode);
  if (fromEnvironment) return fromEnvironment;
  const identity = connectorIdentity();
  if (!identity) {
    throw new Error(`No Replit Stripe connector identity, and no ${mode} STRIPE_SECRET_KEY with a permitted STRIPE_ACCOUNT_ID.`);
  }
  const { host, token } = identity;
  const response = await fetch(`https://${host}/api/v2/connection?include_secrets=true&connector_names=stripe`, {
    headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Stripe connection lookup failed (${response.status}).`);
  const data = await response.json() as { items?: Array<{ settings?: Record<string, string> }> };
  const candidates = (data.items ?? []).filter((item: { settings?: Record<string, string> }) => {
    const settings = item.settings ?? {};
    const key = settings.secret ?? settings.secret_key;
    return settings.account_id === STRIPE_ACCOUNTS[mode]
      && typeof key === "string" && new RegExp(`^(?:sk|rk)_${mode}_`).test(key);
  });
  if (candidates.length !== 1) {
    throw new Error(`Exactly one authorized DepositSafe ${mode} Stripe connection is required.`);
  }
  const settings = candidates[0].settings!;
  return { key: settings.secret ?? settings.secret_key, accountId: STRIPE_ACCOUNTS[mode] };
}

// Fetch credentials afresh for every operation: never cache rotating keys/clients.
export async function getStripeContext(mode: StripeMode = stripeMode()) {
  const { key, accountId } = await credentials(mode);
  return { stripe: new Stripe(key), accountId, mode };
}

export async function getUncachableStripeClient(mode: StripeMode = stripeMode()) {
  return (await getStripeContext(mode)).stripe;
}

export async function getStripeSync(mode: StripeMode = stripeMode()) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for Stripe sync.");
  const { key, accountId } = await credentials(mode);
  return new StripeSync({
    poolConfig: {
      connectionString: process.env.DATABASE_URL,
      max: 2, idleTimeoutMillis: 1000, allowExitOnIdle: true,
    },
    stripeSecretKey: key,
    stripeAccountId: accountId,
    backfillRelatedEntities: false,
  });
}