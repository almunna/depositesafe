import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { ListAdminTransactionsResponse } from "@workspace/api-zod";
import { db, transactionsTable } from "@workspace/db";
import { requireAdmin } from "../lib/auth";
import { serializeTransactions } from "../lib/transactions";

const router: IRouter = Router();

router.get("/admin/transactions", requireAdmin, async (_req, res): Promise<void> => {
  const transactions = await db
    .select()
    .from(transactionsTable)
    .orderBy(desc(transactionsTable.createdAt));
  res.json(ListAdminTransactionsResponse.parse(await serializeTransactions(transactions)));
});

export default router;