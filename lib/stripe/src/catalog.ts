import type Stripe from "stripe";
import { getStripeContext, LOCKED_PRODUCTS, stripeMode, type StripeMode } from "./index";

export type LockedProductSlug = (typeof LOCKED_PRODUCTS)[number]["slug"];

export function matchLockedCatalog(
  prices: Stripe.Price[],
  mode: StripeMode,
  slug?: LockedProductSlug,
) {
  const expectedProducts = slug
    ? LOCKED_PRODUCTS.filter(product => product.slug === slug)
    : LOCKED_PRODUCTS;
  return expectedProducts.map(expected => {
    const matches = prices.filter(price => {
      const product = price.product;
      return price.active && price.livemode === (mode === "live")
        && price.type === "one_time" && price.currency === "gbp"
        && price.unit_amount === expected.amount && !price.custom_unit_amount
        && typeof product !== "string" && !product.deleted
        && product.active && product.livemode === (mode === "live") && product.name === expected.name;
    });
    if (matches.length !== 1) {
      throw new Error(`${expected.name}: expected exactly one active ${mode} GBP price of ${expected.amount}p; found ${matches.length}.`);
    }
    const price = matches[0];
    return { ...expected, priceId: price.id, productId: typeof price.product === "string" ? price.product : price.product.id };
  });
}

export async function loadLockedCatalog(mode: StripeMode, slug?: LockedProductSlug) {
  const { stripe } = await getStripeContext(mode);
  const prices: Stripe.Price[] = [];
  for await (const price of stripe.prices.list({ active: true, limit: 100, expand: ["data.product"] })) {
    prices.push(price);
  }
  return matchLockedCatalog(prices, mode, slug);
}

/** Explicit sandbox-only bootstrap; production objects are NEVER created or changed. */
export async function ensureSandboxCatalog() {
  if (stripeMode() !== "test") {
    throw new Error("Sandbox bootstrap cannot run in production.");
  }
  await loadLockedCatalog("live"); // Verify existing live source before mirroring locked names/prices.
  const { stripe } = await getStripeContext("test");
  const balance = await stripe.balance.retrieve();
  if (balance.livemode) throw new Error("Sandbox bootstrap refused a live Stripe client.");
  const products: Stripe.Product[] = [];
  for await (const product of stripe.products.list({ active: true, limit: 100 })) products.push(product);
  for (const expected of LOCKED_PRODUCTS) {
    const existing = products.filter(p => p.name === expected.name && !p.livemode);
    if (existing.length > 1) throw new Error(`Ambiguous sandbox product: ${expected.name}`);
    const product = existing[0] ?? await stripe.products.create({
      name: expected.name, metadata: { depositsafe_slug: expected.slug, environment: "sandbox" },
    }, { idempotencyKey: `depositsafe:sandbox:product:${expected.slug}` });
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const matching = prices.data.filter(p => !p.livemode && p.currency === "gbp"
      && p.unit_amount === expected.amount && p.type === "one_time");
    if (matching.length > 1) throw new Error(`Ambiguous sandbox price: ${expected.name}`);
    if (matching.length === 0) {
      await stripe.prices.create({ product: product.id, currency: "gbp", unit_amount: expected.amount },
        { idempotencyKey: `depositsafe:sandbox:price:${expected.slug}:${expected.amount}` });
    }
  }
  return loadLockedCatalog("test");
}