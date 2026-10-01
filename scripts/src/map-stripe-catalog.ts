import { ensureSandboxCatalog, loadLockedCatalog } from "@workspace/stripe";
import { pool } from "@workspace/db";

// This changes only application relationships and, explicitly, sandbox copies.
// It never creates/modifies LIVE Stripe products or prices.
try {
  const live = await loadLockedCatalog("live");
  const test = await ensureSandboxCatalog();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const product of live) {
      const sandbox = test.find(p => p.slug === product.slug)!;
      const result = await client.query(
        `UPDATE public.product_configurations SET stripe_product_id=$1, stripe_price_id=$2,
          stripe_sandbox_product_id=$3, stripe_sandbox_price_id=$4, updated_at=NOW()
          WHERE slug=$5 AND name=$6 AND price_pence=$7 RETURNING slug`,
        [product.productId, product.priceId, sandbox.productId, sandbox.priceId, product.slug, product.name, product.amount],
      );
      if (result.rowCount !== 1) throw new Error(`Existing DepositSafe product mismatch: ${product.slug}`);
      console.log(JSON.stringify({ slug: product.slug, amountPence: product.amount, livePriceId: product.priceId, sandboxPriceId: sandbox.priceId }));
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
} finally { await pool.end(); }