import { db, productConfigurationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { loadLockedCatalog, stripeMode, type StripeMode } from "@workspace/stripe";

/** Map existing Stripe objects, never seed or replace the live catalogue. */
export async function syncStripeCatalog(mode: StripeMode = stripeMode()) {
  const catalog = await loadLockedCatalog(mode);
  await db.transaction(async tx => {
    for (const product of catalog) {
      const [updated] = await tx.update(productConfigurationsTable).set(mode === "live"
        ? { stripeProductId: product.productId, stripePriceId: product.priceId }
        : { stripeSandboxProductId: product.productId, stripeSandboxPriceId: product.priceId })
        .where(and(eq(productConfigurationsTable.slug, product.slug),
          eq(productConfigurationsTable.name, product.name), eq(productConfigurationsTable.pricePence, product.amount)))
        .returning({ slug: productConfigurationsTable.slug });
      if (!updated) throw new Error(`DepositSafe product configuration mismatch: ${product.slug}`);
    }
  });
  return { productsSynced: catalog.length, pricesSynced: catalog.length };
}