import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { CreateTransactionBody, GetTransactionParams, GetTransactionResponse, ListTransactionsResponse } from "@workspace/api-zod";
import {
  db,
  participantsTable,
  productConfigurationsTable,
  transactionsTable,
} from "@workspace/db";
import { ensureLocalUser, optionalUserId, requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  ensureSeedProducts,
  findTransactionByReference,
  findTransactionsForUser,
  serializeProduct,
  serializeTransactions,
} from "../lib/transactions";

const router: IRouter = Router();

function makeReference(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DS-${new Date().getFullYear()}-${suffix}`;
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const user = await ensureLocalUser((req as AuthenticatedRequest).userId);
  res.json(ListTransactionsResponse.parse(await findTransactionsForUser(user.id)));
});

router.post("/transactions", async (req, res): Promise<void> => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  await ensureSeedProducts();
  const [product] = await db
    .select()
    .from(productConfigurationsTable)
    .where(eq(productConfigurationsTable.slug, parsed.data.productSlug));
  if (!product || !product.active) {
    res.status(400).json({ error: "That product is not available." });
    return;
  }

  const inputParticipants = parsed.data.participants?.length
    ? parsed.data.participants
    : parsed.data.participant
      ? [parsed.data.participant]
      : [{ name: parsed.data.email.split("@")[0] || "Participant", email: parsed.data.email }];
  if (product.participantMode === "multiple" && inputParticipants.length < 2) {
    res.status(400).json({ error: "This product requires multiple participants." });
    return;
  }

  const clerkUserId = optionalUserId(req);
  const localUser = clerkUserId ? await ensureLocalUser(clerkUserId, parsed.data.email) : undefined;
  const [transaction] = await db
    .insert(transactionsTable)
    .values({
      reference: makeReference(),
      userId: localUser?.id,
      productId: product.id,
      guestEmail: parsed.data.email,
      status: "STARTED",
    })
    .returning();
  await db.insert(participantsTable).values(
    inputParticipants.map((participant) => ({
      transactionId: transaction.id,
      name: participant.name,
      email: participant.email,
      role: participant.role,
    })),
  );

  const [result] = await serializeTransactions([transaction]);
  res.status(201).json(GetTransactionResponse.parse(result));
});

router.get("/transactions/:reference", async (req, res): Promise<void> => {
  const parsed = GetTransactionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const transaction = await findTransactionByReference(parsed.data.reference);
  if (!transaction) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(GetTransactionResponse.parse(transaction));
});

export default router;