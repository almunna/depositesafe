import { and, desc, eq, inArray } from "drizzle-orm";
import {
  db,
  participantsTable,
  productConfigurationsTable,
  transactionsTable,
  type ProductConfiguration,
  type Transaction,
} from "@workspace/db";

export const transactionStatuses = [
  "STARTED",
  "PAYMENT_PENDING",
  "PAID",
  "VERIFICATION_PENDING",
  "VERIFICATION_IN_PROGRESS",
  "VERIFICATION_COMPLETED",
  "RESULT_GENERATED",
  "DELIVERED",
  "PAYMENT_FAILED",
  "AWAITING_PARTICIPANT",
  "EXPIRED",
  "VERIFICATION_FAILED",
  "MANUAL_ATTENTION",
] as const;

const seedProducts = [
  { slug: "company-check", name: "Company Check", pricePence: 499, provider: "Companies House", participantMode: "single" },
  { slug: "bank-account-check", name: "Bank Account Check", pricePence: 799, provider: "Credas", participantMode: "single" },
  { slug: "verify", name: "Verify", pricePence: 999, provider: "Credas", participantMode: "single" },
  { slug: "property-ownership-check", name: "Property Ownership Check", pricePence: 1299, provider: "Credas", participantMode: "single" },
  { slug: "verify-both", name: "Verify Both", pricePence: 1499, provider: "Credas", participantMode: "multiple" },
  { slug: "verify-plus", name: "Verify Plus", pricePence: 1499, provider: "Credas", participantMode: "single" },
  { slug: "right-to-rent", name: "Right to Rent", pricePence: 1499, provider: "Credas", participantMode: "single" },
] as const;

export async function ensureSeedProducts(): Promise<void> {
  for (const product of seedProducts) {
    await db
      .insert(productConfigurationsTable)
      .values(product)
      .onConflictDoUpdate({
        target: productConfigurationsTable.slug,
        set: product,
      });
  }
}

export function serializeProduct(product: ProductConfiguration) {
  return {
    slug: product.slug,
    name: product.name,
    pricePence: product.pricePence,
    price: `£${(product.pricePence / 100).toFixed(2)}`,
    provider: product.provider,
    participantMode: product.participantMode as "single" | "multiple",
    active: product.active,
  };
}

export async function serializeTransactions(
  transactions: Transaction[],
) {
  if (transactions.length === 0) return [];
  const transactionIds = transactions.map((transaction) => transaction.id);
  const participants = await db
    .select()
    .from(participantsTable)
    .where(inArray(participantsTable.transactionId, transactionIds));
  const products = await db
    .select()
    .from(productConfigurationsTable)
    .where(
      inArray(
        productConfigurationsTable.id,
        transactions.map((transaction) => transaction.productId),
      ),
    );
  const productById = new Map(products.map((product) => [product.id, product]));
  const participantsByTransaction = new Map<string, typeof participants>();
  for (const participant of participants) {
    const collection = participantsByTransaction.get(participant.transactionId) ?? [];
    collection.push(participant);
    participantsByTransaction.set(participant.transactionId, collection);
  }

  return transactions.map((transaction) => ({
    reference: transaction.reference,
    product: serializeProduct(productById.get(transaction.productId)!),
    email: transaction.guestEmail,
    status: transaction.status,
    participants: (participantsByTransaction.get(transaction.id) ?? []).map(
      (participant) => ({
        id: participant.id,
        name: participant.name,
        email: participant.email,
        ...(participant.role ? { role: participant.role } : {}),
      }),
    ),
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
    isGuest: !transaction.userId,
  }));
}

export async function findTransactionsForUser(userId: string) {
  const rows = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt));
  return serializeTransactions(rows);
}

export async function findTransactionByReference(reference: string) {
  const [transaction] = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.reference, reference));
  if (!transaction) return undefined;
  const [serialized] = await serializeTransactions([transaction]);
  return serialized;
}

export function activeTransaction(status: string): boolean {
  return !["DELIVERED", "EXPIRED", "VERIFICATION_FAILED"].includes(status);
}