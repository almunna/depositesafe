import { Router, type IRouter, type Request, type Response } from "express";
import {
  GetCompaniesHouseResultParams,
  GetCompaniesHouseResultResponse,
  RunCompaniesHouseCheckBody,
  RunCompaniesHouseCheckParams,
  RunCompaniesHouseCheckResponse,
  SearchCompaniesHouseCompaniesQueryParams,
  SearchCompaniesHouseCompaniesResponse,
} from "@workspace/api-zod";
import { db, transactionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  authorizeTransactionAccess,
  ensureLocalUser,
  isAdminRequest,
  optionalUserId,
} from "../lib/auth";
import {
  getCompanyCheckResult,
  runCompanyCheck,
} from "../lib/company-check";
import { hasExplicitCompanyHouseAdminRole } from "../lib/companies-house-access";
import {
  CompaniesHouseError,
  companiesHouseIntegration,
} from "../lib/integrations/companies-house";

const router: IRouter = Router();

function respondError(res: Response, error: unknown): void {
  if (!(error instanceof CompaniesHouseError)) throw error;
  if (error.retryAfter) res.setHeader("Retry-After", error.retryAfter);
  res.status(error.statusCode).json({ error: error.message });
}

async function transactionForRequest(
  req: Request,
  res: Response,
  reference: string,
) {
  const clerkUserId = optionalUserId(req);
  if (clerkUserId) {
    const user = await ensureLocalUser(clerkUserId);
    if (
      hasExplicitCompanyHouseAdminRole(user.role) &&
      await isAdminRequest(req, user.role)
    ) {
      const [transaction] = await db
        .select()
        .from(transactionsTable)
        .where(eq(transactionsTable.reference, reference))
        .limit(1);
      if (!transaction) {
        res.status(404).json({ error: "Transaction not found" });
        return undefined;
      }
      return transaction;
    }
  }
  return authorizeTransactionAccess(req, res, reference);
}

router.get("/companies-house/search", async (req, res): Promise<void> => {
  const parsed = SearchCompaniesHouseCompaniesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const result = await companiesHouseIntegration.search(parsed.data.q);
    res.json(SearchCompaniesHouseCompaniesResponse.parse(result));
  } catch (error) {
    respondError(res, error);
  }
});

router.post(
  "/transactions/:reference/companies-house/check",
  async (req, res): Promise<void> => {
    const parsedParams = RunCompaniesHouseCheckParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const parsedBody = RunCompaniesHouseCheckBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: parsedBody.error.message });
      return;
    }
    const transaction = await transactionForRequest(
      req,
      res,
      parsedParams.data.reference,
    );
    if (!transaction) return;
    try {
      const result = await runCompanyCheck(
        transaction.id,
        transaction.reference,
        parsedBody.data.companyNumber,
      );
      res.json(RunCompaniesHouseCheckResponse.parse(result));
    } catch (error) {
      respondError(res, error);
    }
  },
);

router.get(
  "/transactions/:reference/companies-house/result",
  async (req, res): Promise<void> => {
    const parsedParams = GetCompaniesHouseResultParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const transaction = await transactionForRequest(
      req,
      res,
      parsedParams.data.reference,
    );
    if (!transaction) return;
    try {
      const result = await getCompanyCheckResult(transaction.id, transaction.reference);
      if (!result) {
        res.status(404).json({ error: "No Companies House result exists." });
        return;
      }
      res.json(GetCompaniesHouseResultResponse.parse(result));
    } catch (error) {
      respondError(res, error);
    }
  },
);

export default router;