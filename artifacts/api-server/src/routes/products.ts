import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, productConfigurationsTable } from "@workspace/db";
import {
  GetProductParams,
  GetProductResponse,
  ListProductsResponse,
} from "@workspace/api-zod";
import { ensureSeedProducts, serializeProduct } from "../lib/transactions";

const router: IRouter = Router();

router.get("/products", async (_req, res): Promise<void> => {
  await ensureSeedProducts();
  const products = await db
    .select()
    .from(productConfigurationsTable)
    .where(eq(productConfigurationsTable.active, true));
  res.json(ListProductsResponse.parse(products.map(serializeProduct)));
});

router.get("/products/:slug", async (req, res): Promise<void> => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureSeedProducts();
  const [product] = await db
    .select()
    .from(productConfigurationsTable)
    .where(eq(productConfigurationsTable.slug, parsed.data.slug));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(GetProductResponse.parse(serializeProduct(product)));
});

export default router;