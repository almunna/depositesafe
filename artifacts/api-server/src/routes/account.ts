import { Router, type IRouter } from "express";
import {
  GetCurrentUserResponse,
  GetDashboardSummaryResponse,
} from "@workspace/api-zod";
import { db, transactionsTable } from "@workspace/db";
import { count, desc, eq } from "drizzle-orm";
import {
  ensureLocalUser,
  getPrimaryEmail,
  type AuthenticatedRequest,
  requireAuth,
} from "../lib/auth";
import { activeTransaction, findTransactionsForUser } from "../lib/transactions";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = await ensureLocalUser((req as AuthenticatedRequest).userId);
  const email = await getPrimaryEmail(user.id);
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      email,
      displayName: user.displayName,
      role: user.role,
    }),
  );
});

router.get(
  "/dashboard/summary",
  requireAuth,
  async (req, res): Promise<void> => {
    const user = await ensureLocalUser((req as AuthenticatedRequest).userId);
    const [total] = await db
      .select({ value: count() })
      .from(transactionsTable)
      .where(eq(transactionsTable.userId, user.id));
    const transactions = await findTransactionsForUser(user.id);
    const active = transactions.filter((transaction) =>
      activeTransaction(transaction.status),
    ).length;
    const completed = transactions.filter((transaction) =>
      ["VERIFICATION_COMPLETED", "RESULT_GENERATED", "DELIVERED"].includes(
        transaction.status,
      ),
    ).length;
    res.json(
      GetDashboardSummaryResponse.parse({
        totalTransactions: Number(total?.value ?? 0),
        activeTransactions: active,
        completedTransactions: completed,
        recentTransactions: transactions.slice(0, 5),
      }),
    );
  },
);

export default router;