import { Router, type IRouter } from "express";
import {
  CreateStripeCheckoutSessionBody,
  CreateStripeCheckoutSessionParams,
  CreateStripeCheckoutSessionResponse,
  SyncStripeCatalogResponse,
} from "@workspace/api-zod";
import { authorizeTransactionAccess, requireAdmin } from "../lib/auth";
import { createCheckoutSession, PaymentError } from "../lib/payments";
import { syncStripeCatalog } from "../lib/stripe-catalog";

const router: IRouter = Router();

router.post("/admin/providers/stripe/catalog-sync", requireAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(SyncStripeCatalogResponse.parse(await syncStripeCatalog()));
  } catch {
    res.status(503).json({ error: "Existing Stripe catalogue mappings could not be verified." });
  }
});

router.post("/transactions/:reference/payments/checkout", async (req, res): Promise<void> => {
  const parsedParams = CreateStripeCheckoutSessionParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: parsedParams.error.message });
    return;
  }
  const parsedBody = CreateStripeCheckoutSessionBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: parsedBody.error.message });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, parsedParams.data.reference);
  if (!transaction) return;

  try {
    const result = await createCheckoutSession(
      parsedParams.data.reference,
      parsedBody.data,
      req.header("origin"),
    );
    res.status(201).json(CreateStripeCheckoutSessionResponse.parse(result));
  } catch (error) {
    if (error instanceof PaymentError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
});

export default router;