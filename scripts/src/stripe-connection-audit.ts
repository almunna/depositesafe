import Stripe from "stripe";

// Read-only diagnostics. Credentials never leave this process or enter output.
const host = process.env.REPLIT_CONNECTORS_HOSTNAME;
const token = process.env.REPL_IDENTITY
  ? `repl ${process.env.REPL_IDENTITY}`
  : process.env.WEB_REPL_RENEWAL ? `depl ${process.env.WEB_REPL_RENEWAL}` : undefined;
if (!host || !token) throw new Error("Replit connector identity unavailable");
const response = await fetch(`https://${host}/api/v2/connection?include_secrets=true&connector_names=stripe`, {
  headers: { Accept: "application/json", X_REPLIT_TOKEN: token },
  signal: AbortSignal.timeout(10_000),
});
if (!response.ok) throw new Error(`Connection lookup failed (${response.status})`);
const data = await response.json() as { items?: Array<{ id?: string; settings?: Record<string, string> }> };
for (const item of data.items ?? []) {
  console.log(JSON.stringify({ connectionId: item.id, settingsFields: Object.keys(item.settings ?? {}) }));
  for (const [field, value] of Object.entries(item.settings ?? {})) {
    if (typeof value !== "string" || !/^(?:sk|rk)_(?:test|live)_/.test(value)) continue;
    const stripe = new Stripe(value);
    try {
      const [account, balance, prices] = await Promise.all([
        stripe.accounts.retrieve(item.settings!.account_id), stripe.balance.retrieve(),
        stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] }),
      ]);
      console.log(JSON.stringify({
        credentialField: field, accountId: account.id,
        businessName: account.business_profile?.name, live: balance.livemode,
        chargesEnabled: account.charges_enabled, prices: prices.data.map(p => ({
          id: p.id, amount: p.unit_amount, currency: p.currency, live: p.livemode, type: p.type,
          productId: typeof p.product === "string" ? p.product : p.product.id,
          name: typeof p.product === "string" || p.product.deleted ? null : p.product.name,
        })), hasMore: prices.has_more,
      }));
    } catch (e) {
      const error = e as { type?: string; code?: string; statusCode?: number };
      console.log(JSON.stringify({ credentialField: field, errorType: error.type, errorCode: error.code, status: error.statusCode }));
    }
  }
}