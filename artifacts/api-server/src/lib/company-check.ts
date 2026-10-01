import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { GetCompaniesHouseResultResponse } from "@workspace/api-zod";
import {
  db,
  paymentsTable,
  productConfigurationsTable,
  resultsTable,
  transactionsTable,
  verificationsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  CompaniesHouseError,
  companiesHouseIntegration,
  normalizeCompanyNumber,
  type CompaniesHouseProfile,
} from "./integrations/companies-house";

export { normalizeCompanyNumber };

const IN_PROGRESS_LEASE_MS = 30_000;
const RETRY_AFTER_SECONDS = "3";

export interface CompanyCheckResult {
  verificationId: string;
  transactionReference: string;
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType?: string;
  dateOfCreation?: string | null;
  dateOfCessation?: string | null;
  registeredOfficeAddress?: string | null;
  sicCodes?: string[];
  nextAccountsDue?: string | null;
  nextConfirmationStatementDue?: string | null;
  sourceUrl?: string;
  outcome: string;
  transactionStatus: "RESULT_GENERATED";
  checkedAt: string;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asResult(
  value: unknown,
  expectedReference: string,
): CompanyCheckResult | undefined {
  if (!isObject(value) || value.provider !== "Companies House") return undefined;
  const parsed = GetCompaniesHouseResultResponse.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.transactionReference !== expectedReference ||
    parsed.data.transactionStatus !== "RESULT_GENERATED"
  ) {
    return undefined;
  }
  return {
    ...parsed.data,
    transactionStatus: "RESULT_GENERATED",
    checkedAt: parsed.data.checkedAt.toISOString(),
  };
}

async function acquireLock(tx: DbTransaction, reference: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${reference}))`);
}

async function getVerification(tx: DbTransaction, transactionId: string) {
  const [verification] = await tx
    .select()
    .from(verificationsTable)
    .where(and(
      eq(verificationsTable.transactionId, transactionId),
      eq(verificationsTable.provider, "Companies House"),
    ))
    .orderBy(desc(verificationsTable.createdAt))
    .limit(1);
  return verification;
}

async function getStoredResult(
  tx: DbTransaction,
  transactionId: string,
  reference: string,
): Promise<CompanyCheckResult | undefined> {
  const verification = await getVerification(tx, transactionId);
  if (!verification || verification.status !== "completed") return undefined;
  const rows = await tx
    .select()
    .from(resultsTable)
    .where(eq(resultsTable.transactionId, transactionId))
    .orderBy(desc(resultsTable.createdAt));
  for (const row of rows) {
    const result = asResult(row.data, reference);
    if (
      result &&
      result.verificationId === verification.id &&
      result.companyNumber === verification.companyNumber &&
      result.companyName === verification.companyName
    ) {
      return result;
    }
  }
  return undefined;
}

async function assertPaidProduct(
  tx: DbTransaction,
  transactionId: string,
): Promise<void> {
  const [transaction] = await tx
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.id, transactionId))
    .for("update")
    .limit(1);
  if (!transaction) throw new CompaniesHouseError("Transaction not found.", 404);
  if (
    ![
      "PAID",
      "VERIFICATION_PENDING",
      "VERIFICATION_IN_PROGRESS",
      "VERIFICATION_COMPLETED",
      "RESULT_GENERATED",
      "DELIVERED",
      "VERIFICATION_FAILED",
    ].includes(transaction.status)
  ) {
    throw new CompaniesHouseError("A confirmed payment is required before this check.", 402);
  }

  const [product] = await tx
    .select()
    .from(productConfigurationsTable)
    .where(eq(productConfigurationsTable.id, transaction.productId))
    .limit(1);
  if (
    !product ||
    product.slug !== "company-check" ||
    product.provider !== "Companies House" ||
    product.pricePence !== 499
  ) {
    throw new CompaniesHouseError("This transaction is not a Company Check purchase.", 409);
  }

  const [payment] = await tx
    .select()
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.transactionId, transactionId),
      eq(paymentsTable.provider, "stripe"),
      eq(paymentsTable.status, "paid"),
      eq(paymentsTable.amountPence, 499),
    ))
    .limit(1);
  if (!payment) {
    throw new CompaniesHouseError("A confirmed £4.99 payment is required before this check.", 402);
  }
}

async function saveVerificationSelection(
  tx: DbTransaction,
  transactionId: string,
  reference: string,
  companyNumber: string,
): Promise<{ verificationId: string; attemptId: string }> {
  const existing = await getVerification(tx, transactionId);
  if (existing?.status === "in_progress") {
    if (Date.now() - existing.updatedAt.getTime() < IN_PROGRESS_LEASE_MS) {
      throw new CompaniesHouseError(
        "A company check is already in progress. Please retry shortly.",
        409,
        RETRY_AFTER_SECONDS,
      );
    }
  }
  if (existing?.status === "completed") {
    throw new CompaniesHouseError(
      "The completed company result could not be verified and cannot be overwritten.",
      409,
    );
  }
  const attemptId = randomUUID();
  if (existing) {
    await tx
      .update(verificationsTable)
      .set({
        companyNumber,
        companyName: null,
        providerStatus: attemptId,
        status: "in_progress",
        updatedAt: new Date(),
      })
      .where(eq(verificationsTable.id, existing.id));
    return { verificationId: existing.id, attemptId };
  }
  const [created] = await tx
    .insert(verificationsTable)
    .values({
      transactionId,
      provider: "Companies House",
      providerReference: reference,
      providerStatus: attemptId,
      companyNumber,
      status: "in_progress",
    })
    .returning();
  return { verificationId: created.id, attemptId };
}

function makeResult(
  verificationId: string,
  reference: string,
  profile: CompaniesHouseProfile,
  checkedAt: Date,
): CompanyCheckResult {
  return {
    verificationId,
    transactionReference: reference,
    companyNumber: profile.companyNumber,
    companyName: profile.companyName,
    companyStatus: profile.companyStatus,
    ...(profile.companyType ? { companyType: profile.companyType } : {}),
    dateOfCreation: profile.dateOfCreation,
    dateOfCessation: profile.dateOfCessation,
    registeredOfficeAddress: profile.registeredOfficeAddress,
    sicCodes: profile.sicCodes,
    nextAccountsDue: profile.nextAccountsDue,
    nextConfirmationStatementDue: profile.nextConfirmationStatementDue,
    sourceUrl: profile.sourceUrl,
    outcome: `Company status: ${profile.companyStatus}`,
    transactionStatus: "RESULT_GENERATED",
    checkedAt: checkedAt.toISOString(),
  };
}

async function saveFailure(
  transactionId: string,
  reference: string,
  verificationId: string,
  attemptId: string,
  companyNumber: string,
  error: CompaniesHouseError,
): Promise<CompanyCheckResult | undefined> {
  return db.transaction(async (tx) => {
    await acquireLock(tx, reference);
    const stored = await getStoredResult(tx, transactionId, reference);
    if (stored) {
      if (stored.companyNumber !== companyNumber) {
        throw new CompaniesHouseError("A different company has already been checked for this transaction.", 409);
      }
      return stored;
    }
    const activeAttempt = await getVerification(tx, transactionId);
    if (
      !activeAttempt ||
      activeAttempt.id !== verificationId ||
      activeAttempt.companyNumber !== companyNumber ||
      activeAttempt.providerStatus !== attemptId ||
      activeAttempt.status !== "in_progress"
    ) {
      throw new CompaniesHouseError(
        "This company check attempt was superseded. Please retry.",
        409,
        RETRY_AFTER_SECONDS,
      );
    }
    await tx
      .update(verificationsTable)
      .set({
        companyNumber,
        providerStatus: error.statusCode === 404 ? "not_found" : "failed",
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(verificationsTable.id, verificationId));
    await tx
      .update(transactionsTable)
      .set({
        status: "VERIFICATION_FAILED",
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactionsTable.id, transactionId));
    return undefined;
  });
}

async function saveSuccess(
  transactionId: string,
  reference: string,
  verificationId: string,
  attemptId: string,
  result: CompanyCheckResult,
): Promise<CompanyCheckResult> {
  return db.transaction(async (tx) => {
    await acquireLock(tx, reference);
    const stored = await getStoredResult(tx, transactionId, reference);
    if (stored) {
      if (stored.companyNumber !== result.companyNumber) {
        throw new CompaniesHouseError("A different company has already been checked for this transaction.", 409);
      }
      return stored;
    }

    const existingVerification = await getVerification(tx, transactionId);
    if (
      !existingVerification ||
      existingVerification.id !== verificationId ||
      existingVerification.companyNumber !== result.companyNumber ||
      existingVerification.providerStatus !== attemptId ||
      existingVerification.status !== "in_progress"
    ) {
      throw new CompaniesHouseError("A different company was selected while this check was running.", 409);
    }
    await tx
      .update(verificationsTable)
      .set({
        companyNumber: result.companyNumber,
        companyName: result.companyName,
        providerStatus: result.companyStatus,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(verificationsTable.id, verificationId));

    const existingRows = await tx
      .select()
      .from(resultsTable)
      .where(eq(resultsTable.transactionId, transactionId))
      .orderBy(desc(resultsTable.createdAt));
    const existingRow = existingRows.find(
      (row) => isObject(row.data) && row.data.provider === "Companies House",
    );
    if (existingRow) {
      throw new CompaniesHouseError(
        "An existing Companies House result cannot be overwritten.",
        409,
      );
    }
    const values = {
      outcome: result.outcome,
      generatedAt: new Date(result.checkedAt),
      data: { provider: "Companies House", ...result },
    };
    await tx
      .insert(resultsTable)
      .values({ transactionId, ...values });
    await tx
      .update(transactionsTable)
      .set({
        status: "RESULT_GENERATED",
        statusChangedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(transactionsTable.id, transactionId));
    return result;
  });
}

export async function runCompanyCheck(
  transactionId: string,
  reference: string,
  selectedNumber: string,
): Promise<CompanyCheckResult> {
  const companyNumber = normalizeCompanyNumber(selectedNumber);
  const attempt = await db.transaction(async (tx) => {
    await acquireLock(tx, reference);
    await assertPaidProduct(tx, transactionId);
    const stored = await getStoredResult(tx, transactionId, reference);
    if (stored) {
      if (stored.companyNumber !== companyNumber) {
        throw new CompaniesHouseError("A different company has already been checked for this transaction.", 409);
      }
      return { verificationId: stored.verificationId };
    }
    return saveVerificationSelection(tx, transactionId, reference, companyNumber);
  });

  const verificationId = attempt.verificationId;
  if (!("attemptId" in attempt)) {
    const stored = await getStoredResultFromDb(transactionId, reference);
    if (stored) return stored;
    throw new CompaniesHouseError("The stored company result could not be verified.", 409);
  }

  const existing = await getStoredResultFromDb(transactionId, reference);
  if (existing) return existing;

  let profile: CompaniesHouseProfile | null;
  try {
    profile = await companiesHouseIntegration.getProfile(companyNumber);
    if (!profile) {
      throw new CompaniesHouseError("No company was found for that company number.", 404);
    }
    let returnedNumber: string;
    try {
      returnedNumber = normalizeCompanyNumber(profile.companyNumber);
    } catch {
      throw new CompaniesHouseError("Companies House returned an invalid company record.", 502);
    }
    if (returnedNumber !== companyNumber) {
      throw new CompaniesHouseError("Companies House returned an unexpected company record.", 502);
    }
    profile = { ...profile, companyNumber };
  } catch (error) {
    const safeError = error instanceof CompaniesHouseError
      ? error
      : new CompaniesHouseError("Companies House could not complete the check.", 502);
    const racedResult = await saveFailure(
      transactionId,
      reference,
      verificationId,
      attempt.attemptId,
      companyNumber,
      safeError,
    );
    if (racedResult) return racedResult;
    throw safeError;
  }

  const checkedAt = new Date();
  const result = makeResult(verificationId, reference, profile, checkedAt);
  return saveSuccess(transactionId, reference, verificationId, attempt.attemptId, result);
}

async function getStoredResultFromDb(
  transactionId: string,
  reference: string,
): Promise<CompanyCheckResult | undefined> {
  return db.transaction(async (tx) => getStoredResult(tx, transactionId, reference));
}

export async function getCompanyCheckResult(
  transactionId: string,
  reference: string,
): Promise<CompanyCheckResult | undefined> {
  return getStoredResultFromDb(transactionId, reference);
}