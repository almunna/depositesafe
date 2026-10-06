import { Router, type IRouter, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  CreateCredasJourneyLinkParams,
  CreateCredasJourneyLinkResponse,
  DownloadCredasDocumentParams,
  GetCredasChecksParams,
  GetCredasChecksResponse,
  ListCredasJourneysResponse,
  ReceiveCredasWebhookQueryParams,
  ReceiveCredasWebhookResponse,
  RefreshCredasChecksParams,
  ResendCredasInviteParams,
  RunCredasAdminActionBody,
  RunCredasAdminActionParams,
  RunCredasBankAccountCheckBody,
  RunCredasBankAccountCheckParams,
  RunCredasPropertyCheckBody,
  RunCredasPropertyCheckParams,
  SelectCredasPropertyTitleBody,
  SelectCredasPropertyTitleParams,
  StartCredasVerificationBody,
  StartCredasVerificationParams,
} from "@workspace/api-zod";
import { db, transactionsTable, type Transaction } from "@workspace/db";
import {
  authorizeTransactionAccess,
  ensureLocalUser,
  isStrictAdminRequest,
  optionalUserId,
  requireStrictAdmin,
  type AuthenticatedRequest,
} from "../lib/auth";
import {
  createMagicLink,
  getCredasState,
  getDocument,
  handleCredasWebhook,
  refreshChecks,
  resendInvite,
  runAdminAction,
  runBankAccountCheck,
  runPropertyCheck,
  selectPropertyTitle,
  startVerification,
  type CredasState,
} from "../lib/credas-checks";
import { CredasInputError } from "../lib/credas-rules";
import { CredasError, credasIntegration } from "../lib/integrations/credas";

const router: IRouter = Router();

function respondError(res: Response, error: unknown): void {
  if (error instanceof CredasInputError) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!(error instanceof CredasError)) throw error;
  if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
  res.status(error.statusCode).json({ error: error.message });
}

function sendState(res: Response, state: CredasState): void {
  // Check results are personal data; never let a shared cache keep them.
  res.setHeader("Cache-Control", "no-store");
  res.json(GetCredasChecksResponse.parse(state));
}

async function isStaff(req: Request): Promise<boolean> {
  const clerkUserId = optionalUserId(req);
  if (!clerkUserId) return false;
  const user = await ensureLocalUser(clerkUserId);
  return isStrictAdminRequest(req, user.role);
}

/** Staff may read any transaction's checks; everyone else needs owner or guest access. */
async function transactionForRead(
  req: Request,
  res: Response,
  reference: string,
): Promise<{ transaction: Transaction; staff: boolean } | undefined> {
  if (await isStaff(req)) {
    const [transaction] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reference, reference))
      .limit(1);
    if (!transaction) {
      res.status(404).json({ error: "Transaction not found" });
      return undefined;
    }
    return { transaction, staff: true };
  }
  const transaction = await authorizeTransactionAccess(req, res, reference);
  return transaction ? { transaction, staff: false } : undefined;
}

router.get("/transactions/:reference/credas", async (req, res): Promise<void> => {
  const params = GetCredasChecksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const access = await transactionForRead(req, res, params.data.reference);
  if (!access) return;
  try {
    sendState(res, await getCredasState(access.transaction.id));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/start", async (req, res): Promise<void> => {
  const params = StartCredasVerificationParams.safeParse(req.params);
  const body = StartCredasVerificationBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter the details of each person to verify." });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await startVerification(transaction.id, body.data.participants));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/bank-account", async (req, res): Promise<void> => {
  const params = RunCredasBankAccountCheckParams.safeParse(req.params);
  const body = RunCredasBankAccountCheckBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter the account holder’s name, address, sort code and account number." });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await runBankAccountCheck(transaction.id, body.data));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/property", async (req, res): Promise<void> => {
  const params = RunCredasPropertyCheckParams.safeParse(req.params);
  const body = RunCredasPropertyCheckBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Enter the owner’s name and the property address." });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await runPropertyCheck(transaction.id, body.data));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/property/title", async (req, res): Promise<void> => {
  const params = SelectCredasPropertyTitleParams.safeParse(req.params);
  const body = SelectCredasPropertyTitleBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose one of the titles listed for this address." });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await selectPropertyTitle(transaction.id, body.data.titleNumber));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/refresh", async (req, res): Promise<void> => {
  const params = RefreshCredasChecksParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await refreshChecks(transaction.id));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/checks/:checkId/resend-invite", async (req, res): Promise<void> => {
  const params = ResendCredasInviteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    sendState(res, await resendInvite(transaction.id, params.data.checkId));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/transactions/:reference/credas/checks/:checkId/journey-link", async (req, res): Promise<void> => {
  const params = CreateCredasJourneyLinkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  // Owner or guest access only: staff never receive a participant's journey link.
  const transaction = await authorizeTransactionAccess(req, res, params.data.reference);
  if (!transaction) return;
  try {
    const link = await createMagicLink(transaction.id, params.data.checkId);
    res.setHeader("Cache-Control", "no-store");
    res.json(CreateCredasJourneyLinkResponse.parse(link));
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/transactions/:reference/credas/checks/:checkId/documents/:documentId", async (req, res): Promise<void> => {
  const params = DownloadCredasDocumentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "That document is not available for this check." });
    return;
  }
  const access = await transactionForRead(req, res, params.data.reference);
  if (!access) return;
  try {
    const document = await getDocument(
      access.transaction.id,
      params.data.checkId,
      params.data.documentId,
      { admin: access.staff },
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${document.filename.replace(/[^A-Za-z0-9._-]/g, "")}"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(document.pdf);
  } catch (error) {
    respondError(res, error);
  }
});

router.get("/admin/credas/journeys", requireStrictAdmin, async (_req, res): Promise<void> => {
  try {
    res.json(ListCredasJourneysResponse.parse(await credasIntegration.listJourneys()));
  } catch (error) {
    respondError(res, error);
  }
});

router.post("/admin/credas/checks/:checkId/actions", requireStrictAdmin, async (req, res): Promise<void> => {
  const params = RunCredasAdminActionParams.safeParse(req.params);
  const body = RunCredasAdminActionBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid action for this check." });
    return;
  }
  const user = await ensureLocalUser((req as AuthenticatedRequest).userId);
  try {
    sendState(res, await runAdminAction(params.data.checkId, body.data.action, body.data, user.id));
  } catch (error) {
    respondError(res, error);
  }
});

function constantTimeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Optional shared header Credas can be asked to send with every webhook. */
function webhookHeaderAccepted(req: Request): boolean {
  const name = process.env.CREDAS_WEBHOOK_HEADER_NAME?.trim();
  const value = process.env.CREDAS_WEBHOOK_HEADER_VALUE?.trim();
  if (!name && !value) return true;
  if (!name || !value) return false;
  return constantTimeEqual(req.header(name) ?? "", value);
}

router.post("/webhooks/credas", async (req, res): Promise<void> => {
  const query = ReceiveCredasWebhookQueryParams.safeParse(req.query);
  // One generic rejection: never reveal whether the token, header or process was wrong.
  if (!query.success || !webhookHeaderAccepted(req)) {
    res.status(401).json({ error: "Notification not accepted." });
    return;
  }
  try {
    const accepted = await handleCredasWebhook(query.data.t, req.body);
    if (!accepted) {
      res.status(401).json({ error: "Notification not accepted." });
      return;
    }
    res.json(ReceiveCredasWebhookResponse.parse({ accepted: true }));
  } catch (error) {
    if (!(error instanceof CredasError)) throw error;
    req.log.warn({ statusCode: error.statusCode }, "Credas webhook could not be reconciled");
    res.status(503).json({ error: "Notification could not be processed; please retry." });
  }
});

export default router;
