import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  auditEventsTable,
  credasChecksTable,
  db,
  participantsTable,
  paymentsTable,
  productConfigurationsTable,
  providerEventsTable,
  resultsTable,
  transactionsTable,
  type CredasCheck,
  type Participant,
  type ProductConfiguration,
  type Transaction,
} from "@workspace/db";
import { LOCKED_PRODUCTS } from "@workspace/stripe";
import {
  CredasError,
  credasIntegration,
  credasJourney,
  type CredasJourneyKind,
  type CredasLandRegistryCheck,
} from "./integrations/credas";
import {
  CREDAS_PRODUCT_CHECKS,
  bankAccountResult,
  bankOutcome,
  componentResult,
  credasPublicOrigin,
  credasWebhookUrl,
  deriveTransactionStatus,
  documentTypeLabel,
  hashWebhookToken,
  newWebhookToken,
  parseCredasWebhook,
  processState,
  propertyResult,
  shareCodeResult,
  titleOptions,
  validateBankAccountInput,
  validateParticipants,
  validatePropertyInput,
  verificationLabel,
  verificationOutcome,
  type CredasCheckKind,
  type CredasCheckState,
  type CredasOutcome,
  type PropertyDetails,
} from "./credas-rules";
import { CREDAS_BRAND_LOGO_BASE64 } from "./credas-brand-logo";
import { logger } from "./logger";

// Longer than the slowest Credas call, so a running attempt is never overtaken by a retry.
const ATTEMPT_LEASE_MS = 90_000;
const RETRY_AFTER_SECONDS = "5";
const REFRESH_INTERVAL_MS = 10_000;
const INVITE_INTERVAL_MS = 5 * 60_000;
const MAX_INVITES = 6;
const MAGIC_LINK_INTERVAL_MS = 30_000;
const MAGIC_LINK_TTL_MS = 20 * 60_000;
// Attempts only accumulate when a check fails to produce a result.
const MAX_DATA_CHECK_ATTEMPTS = 5;
// An address with no registered title may be corrected, but each lookup is chargeable.
const MAX_PROPERTY_LOOKUPS = 3;
const WEBHOOK_REFRESH_INTERVAL_MS = 2_000;
const SYNCABLE_STATES = ["awaiting_participant", "in_progress", "pending", "manual_review", "expired"];

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type JsonRecord = Record<string, unknown>;

interface Context {
  transaction: Transaction;
  product: ProductConfiguration;
  participants: Participant[];
  checks: CredasCheck[];
}

function isJourney(kind: string): kind is CredasJourneyKind {
  return kind === "identity" || kind === "right_to_rent";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function acquireLock(tx: DbTransaction, transactionId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`credas:${transactionId}`}, 0))`);
}

async function loadContext(tx: DbTransaction, transactionId: string, forUpdate = false): Promise<Context> {
  const query = tx.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
  const [transaction] = forUpdate ? await query.for("update").limit(1) : await query.limit(1);
  if (!transaction) throw new CredasError("Transaction not found.", 404);
  const [product] = await tx
    .select()
    .from(productConfigurationsTable)
    .where(eq(productConfigurationsTable.id, transaction.productId))
    .limit(1);
  if (!product || product.provider !== "Credas" || !CREDAS_PRODUCT_CHECKS[product.slug]) {
    throw new CredasError("This transaction is not a Credas check.", 409);
  }
  const participants = await tx
    .select()
    .from(participantsTable)
    .where(eq(participantsTable.transactionId, transactionId))
    .orderBy(asc(participantsTable.createdAt), asc(participantsTable.id));
  const checks = await tx
    .select()
    .from(credasChecksTable)
    .where(eq(credasChecksTable.transactionId, transactionId))
    .orderBy(asc(credasChecksTable.createdAt));
  return { transaction, product, participants, checks };
}

/** A check may run only against a transaction with a confirmed payment at the locked price. */
async function isPaid(tx: DbTransaction, context: Context): Promise<boolean> {
  const { transaction, product } = context;
  const locked = LOCKED_PRODUCTS.find((entry) => entry.slug === product.slug);
  if (!locked || locked.amount !== product.pricePence || !product.active) return false;
  if (["STARTED", "PAYMENT_PENDING", "PAYMENT_FAILED"].includes(transaction.status)) return false;
  const [payment] = await tx
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(and(
      eq(paymentsTable.transactionId, transaction.id),
      eq(paymentsTable.provider, "stripe"),
      eq(paymentsTable.status, "paid"),
      eq(paymentsTable.amountPence, locked.amount),
    ))
    .limit(1);
  return Boolean(payment);
}

async function assertPaid(tx: DbTransaction, context: Context): Promise<void> {
  if (!(await isPaid(tx, context))) {
    throw new CredasError("A confirmed payment is required before this check.", 402);
  }
}

function findCheck(checks: CredasCheck[], kind: CredasCheckKind, slot = 0): CredasCheck | undefined {
  return checks.find((check) => check.kind === kind && check.slot === slot);
}

function assertNotRunning(check: CredasCheck | undefined): void {
  if (check?.state === "starting" && Date.now() - check.updatedAt.getTime() < ATTEMPT_LEASE_MS) {
    throw new CredasError("This check is already running. Please retry shortly.", 409, {
      retryAfter: RETRY_AFTER_SECONDS,
    });
  }
}

/** Claims a check row for one attempt. The attempt ID guards every later write. */
async function claimAttempt(
  tx: DbTransaction,
  transactionId: string,
  kind: CredasCheckKind,
  slot: number,
  existing: CredasCheck | undefined,
  values: Partial<typeof credasChecksTable.$inferInsert> = {},
): Promise<CredasCheck> {
  const attemptId = randomUUID();
  if (existing) {
    const [updated] = await tx
      .update(credasChecksTable)
      .set({ ...values, state: "starting", attemptId, attempts: existing.attempts + 1, updatedAt: new Date() })
      .where(eq(credasChecksTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await tx
    .insert(credasChecksTable)
    .values({ ...values, transactionId, kind, slot, state: "starting", attemptId, attempts: 1 })
    .returning();
  return created;
}

/** Applies an update only while the caller's attempt is still the active one. */
async function writeAttempt(
  tx: DbTransaction,
  check: CredasCheck,
  values: Partial<typeof credasChecksTable.$inferInsert>,
): Promise<boolean> {
  const updated = await tx
    .update(credasChecksTable)
    .set({ ...values, updatedAt: new Date() })
    .where(and(
      eq(credasChecksTable.id, check.id),
      eq(credasChecksTable.attemptId, check.attemptId ?? ""),
      eq(credasChecksTable.state, "starting"),
    ))
    .returning({ id: credasChecksTable.id });
  return updated.length > 0;
}

/** Moves the transaction to the status its checks imply and stores the final result once. */
async function syncTransactionStatus(tx: DbTransaction, transactionId: string): Promise<void> {
  const context = await loadContext(tx, transactionId, true);
  if (!(await isPaid(tx, context))) return;
  const { transaction, product, checks } = context;
  if (transaction.status === "DELIVERED") return;
  const derived = deriveTransactionStatus(product.slug, checks);

  if (derived.status === "RESULT_GENERATED") {
    const rows = await tx.select().from(resultsTable).where(eq(resultsTable.transactionId, transactionId));
    if (!rows.some((row) => isRecord(row.data) && row.data.provider === "Credas")) {
      const generatedAt = new Date();
      await tx.insert(resultsTable).values({
        transactionId,
        outcome: derived.outcome,
        generatedAt,
        data: {
          provider: "Credas",
          product: product.slug,
          outcome: derived.outcome,
          checks: checks.map((check) => ({ id: check.id, kind: check.kind, outcome: check.outcome })),
          generatedAt: generatedAt.toISOString(),
        },
      });
    }
  }
  if (derived.status !== transaction.status) {
    const now = new Date();
    await tx
      .update(transactionsTable)
      .set({ status: derived.status, statusChangedAt: now, updatedAt: now })
      .where(eq(transactionsTable.id, transactionId));
  }
}

function failureMessage(check: CredasCheck): string | undefined {
  if (check.state === "expired") return "The invitation expired before the verification was completed.";
  if (check.state !== "failed") return undefined;
  if (check.providerStatus === "no_title_found") {
    return "No registered title was found for that address. Check the address and try again.";
  }
  if (check.providerStatus === "closed") return "This verification was closed. Contact DepositSafe for help.";
  return "This check could not be completed. Please try again.";
}

function viewCheck(check: CredasCheck, context: Context) {
  const participant = context.participants.find((entry) => entry.id === check.participantId);
  const journey = isJourney(check.kind);
  const open = check.state === "awaiting_participant" || check.state === "in_progress";
  const result = isRecord(check.result) ? check.result : {};
  const property = isRecord(result.property) ? result.property : undefined;
  const rightToRent = isRecord(result.rightToRent) ? result.rightToRent : undefined;
  const shareCode = rightToRent && isRecord(rightToRent.shareCode) ? rightToRent.shareCode : undefined;
  const documents: { id: string; label: string }[] = [];
  if (check.kind === "bank_account" && check.state === "completed" && check.dataCheckId) {
    documents.push({ id: "report", label: "Bank account report (PDF)" });
  }
  if (check.kind === "right_to_rent" && check.processId && ["completed", "manual_review"].includes(check.state)) {
    documents.push({ id: "report", label: "Right to Rent report (PDF)" });
    if (check.rtrCheckId && shareCode?.hasCertificate === true) {
      documents.push({ id: "settled-status", label: "Home Office status certificate (PDF)" });
    }
  }
  if (check.kind === "property_ownership" && property && Array.isArray(property.files)) {
    for (const file of property.files) {
      if (isRecord(file) && typeof file.id === "string" && typeof file.label === "string") {
        documents.push({ id: `file-${file.id}`, label: `${file.label} (PDF)` });
      }
    }
  }
  const state = check.state === "starting" ? "in_progress" : check.state;
  const message = failureMessage(check);
  return {
    id: check.id,
    kind: check.kind,
    state,
    ...(check.outcome ? { outcome: check.outcome } : {}),
    ...(journey && participant ? { participantName: participant.name, participantEmail: participant.email } : {}),
    canResendInvite: journey && Boolean(check.processId) && (open || check.state === "expired"),
    // The journey link signs the participant in, so it is offered only to that participant.
    canCompleteHere: journey && open && Boolean(check.processId) &&
      participant?.email.trim().toLowerCase() === context.transaction.guestEmail.trim().toLowerCase(),
    documents,
    ...(message ? { message } : {}),
    ...(isRecord(result.identity) ? { identity: result.identity } : {}),
    ...(rightToRent ? { rightToRent } : {}),
    ...(isRecord(result.bankAccount) ? { bankAccount: result.bankAccount } : {}),
    ...(property ? { property } : {}),
    ...(Array.isArray(result.titleOptions) ? { titleOptions: result.titleOptions } : {}),
    ...(check.completedAt ? { checkedAt: check.completedAt.toISOString() } : {}),
  };
}

async function buildState(tx: DbTransaction, transactionId: string) {
  const context = await loadContext(tx, transactionId);
  const { transaction, product, checks } = context;
  const paid = await isPaid(tx, context);
  const required = CREDAS_PRODUCT_CHECKS[product.slug];
  const derived = deriveTransactionStatus(product.slug, checks);
  const retryable = (check: CredasCheck | undefined, limited = true) =>
    !check ||
    (check.state === "failed" && check.providerStatus !== "closed" &&
      (!limited || check.attempts < MAX_DATA_CHECK_ATTEMPTS)) ||
    (check.state === "starting" && Date.now() - check.updatedAt.getTime() >= ATTEMPT_LEASE_MS);

  const actions: string[] = [];
  if (paid) {
    const journeyKinds = required.filter(isJourney);
    const unstarted = journeyKinds.some((kind, index) => {
      const slot = journeyKinds.slice(0, index).filter((entry) => entry === kind).length;
      const check = findCheck(checks, kind, slot);
      return !check?.processId && retryable(check, false);
    });
    if (unstarted) actions.push("start");
    if (required.includes("bank_account")) {
      const needsIdentity = required.includes("identity");
      const identityStarted = Boolean(findCheck(checks, "identity")?.entityId);
      if (retryable(findCheck(checks, "bank_account")) && (!needsIdentity || identityStarted)) {
        actions.push("bank-account");
      }
    }
    if (required.includes("property_ownership")) {
      const check = findCheck(checks, "property_ownership");
      if (check?.state === "awaiting_title_selection") actions.push("select-title");
      else if (retryable(check)) actions.push("property");
    }
    if (checks.some((check) => SYNCABLE_STATES.includes(check.state))) actions.push("refresh");
  }

  return {
    transactionReference: transaction.reference,
    productSlug: product.slug,
    transactionStatus: transaction.status,
    paid,
    requiredChecks: [...required],
    actions,
    ...(derived.outcome ? { outcome: derived.outcome } : {}),
    checks: checks.map((check) => viewCheck(check, context)),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export type CredasState = Awaited<ReturnType<typeof buildState>>;

export async function getCredasState(transactionId: string): Promise<CredasState> {
  return db.transaction((tx) => buildState(tx, transactionId));
}

async function failAttempt(check: CredasCheck, error: unknown, providerStatus = "error"): Promise<CredasError> {
  const safeError = error instanceof CredasError ? error : new CredasError("This check could not be completed.", 502);
  await db.transaction(async (tx) => {
    await acquireLock(tx, check.transactionId);
    const status = safeError.indeterminate ? "indeterminate" : providerStatus;
    if (await writeAttempt(tx, check, { state: "failed", providerStatus: status })) {
      await syncTransactionStatus(tx, check.transactionId);
    }
  });
  return safeError;
}

// ---------------------------------------------------------------------------
// Journeys: Verify, Verify Both, Verify Plus, Right to Rent
// ---------------------------------------------------------------------------

export async function startVerification(transactionId: string, input: unknown): Promise<CredasState> {
  const origin = credasPublicOrigin();
  const claimed = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const context = await loadContext(tx, transactionId, true);
    await assertPaid(tx, context);
    const kinds = CREDAS_PRODUCT_CHECKS[context.product.slug].filter(isJourney);
    if (kinds.length === 0) throw new CredasError("This check does not use an identity journey.", 409);
    const people = validateParticipants(input, kinds.length);

    const work: { check: CredasCheck; kind: CredasJourneyKind; token: string; person: (typeof people)[number] }[] = [];
    for (const [index, kind] of kinds.entries()) {
      const slot = kinds.slice(0, index).filter((entry) => entry === kind).length;
      const existing = findCheck(context.checks, kind, slot);
      if (existing?.processId) continue;
      assertNotRunning(existing);
      const person = people[index];
      const name = `${person.firstName} ${person.surname}`;
      let participant = context.participants[index];
      if (participant) {
        await tx
          .update(participantsTable)
          .set({ name, email: person.email })
          .where(eq(participantsTable.id, participant.id));
      } else {
        [participant] = await tx
          .insert(participantsTable)
          .values({ transactionId, name, email: person.email, role: "participant" })
          .returning();
      }
      const token = newWebhookToken();
      const check = await claimAttempt(tx, transactionId, kind, slot, existing, {
        participantId: participant.id,
        webhookTokenHash: hashWebhookToken(token),
      });
      work.push({ check, kind, token, person });
    }
    return { work, reference: context.transaction.reference };
  });

  let firstError: CredasError | undefined;
  for (const { check, kind, token, person } of claimed.work) {
    try {
      const journey = credasJourney(kind);
      const created = await credasIntegration.createProcess({
        journeyId: journey.journeyId,
        actorId: journey.actorId,
        title: `DepositSafe check ${claimed.reference}`,
        ...(origin ? { webhookUrl: credasWebhookUrl(origin, token) } : {}),
        reference: `${claimed.reference}:${check.slot + 1}`,
        firstName: person.firstName,
        surname: person.surname,
        emailAddress: person.email,
        sendEmailInvite: true,
        clientAliasName: "DepositSafe",
        clientAliasLogoBase64: CREDAS_BRAND_LOGO_BASE64,
      });
      await db.transaction(async (tx) => {
        await acquireLock(tx, transactionId);
        const state = processState(created.status);
        const saved = await writeAttempt(tx, check, {
          processId: created.processId,
          entityId: created.entityId,
          processActorId: created.processActorId,
          state: state === "complete" ? "in_progress" : state,
          providerStatus: `process:${created.status}`,
          inviteCount: 1,
          lastInviteAt: new Date(),
        });
        if (saved) await syncTransactionStatus(tx, transactionId);
      });
    } catch (error) {
      firstError ??= await failAttempt(check, error);
    }
  }
  if (firstError) throw firstError;
  return getCredasState(transactionId);
}

function identityResult(entry: {
  overallResult: number;
  livenessResult: number;
  documentResult: number;
  faceMatchResult: number;
  nameMatchResult: number;
  documentType: number | null;
}) {
  const documentType = documentTypeLabel(entry.documentType);
  return {
    overall: componentResult(entry.overallResult),
    liveness: componentResult(entry.livenessResult),
    document: componentResult(entry.documentResult),
    faceMatch: componentResult(entry.faceMatchResult),
    nameMatch: componentResult(entry.nameMatchResult),
    ...(documentType ? { documentType } : {}),
  };
}

type CheckUpdate = Partial<typeof credasChecksTable.$inferInsert>;

function settled(outcome: CredasOutcome | "manual_review" | "pending", result: JsonRecord, extra: CheckUpdate = {}): CheckUpdate {
  if (outcome === "pending") return { ...extra, state: "in_progress", result };
  if (outcome === "manual_review") return { ...extra, state: "manual_review", result };
  return { ...extra, state: "completed", outcome, result, completedAt: new Date() };
}

async function collectIdentity(check: CredasCheck): Promise<CheckUpdate> {
  const summary = await credasIntegration.getEntitySummary(check.entityId!);
  const entry = summary.identityVerifications
    .filter((verification) => verification.processId === check.processId)
    .sort((a, b) => (a.dateCompleted ?? "").localeCompare(b.dateCompleted ?? ""))
    .at(-1);
  if (!entry) return { state: "in_progress", providerStatus: "awaiting_result" };
  const identity = identityResult(entry);
  const outcome = identity.overall === "pass" || identity.overall === "refer" || identity.overall === "fail"
    ? identity.overall
    : identity.overall === "action_required" ? "manual_review" : "pending";
  return settled(outcome, { identity }, { providerStatus: `identity:${entry.overallResult}` });
}

async function collectRightToRent(check: CredasCheck): Promise<CheckUpdate> {
  const entityId = check.entityId!;
  let rtrCheckId = check.rtrCheckId;
  if (!rtrCheckId) {
    const active = await credasIntegration.getActiveChecks(entityId);
    rtrCheckId = active.find((entry) => entry.type === 12)?.rtxCheckId ?? null;
  }
  if (!rtrCheckId) {
    const summary = await credasIntegration.getEntitySummary(entityId);
    rtrCheckId = summary.rightToRentChecks.find((entry) => entry.processId === check.processId)?.rightToRentCheckId ?? null;
  }
  if (!rtrCheckId) return { state: "in_progress", providerStatus: "awaiting_result" };
  const rtr = await credasIntegration.getRightToRentCheck(entityId, rtrCheckId);
  const shareCode = shareCodeResult(await credasIntegration.getShareCodes(entityId));
  const rightToRent = {
    statusLabel: verificationLabel(rtr.status),
    shareCodeUsed: Boolean(shareCode),
    ...(shareCode ? { shareCode } : {}),
  };
  return settled(verificationOutcome(rtr.status), { rightToRent }, { rtrCheckId, providerStatus: `rtr:${rtr.status}` });
}

function evaluateProperty(check: CredasCheck, registry: CredasLandRegistryCheck, input: PropertyDetails): CheckUpdate {
  const property = propertyResult(registry, input);
  const result = { property, propertyInput: input };
  const base = { dataCheckId: registry.id, providerStatus: `land-registry:${registry.overallResult}` };
  if (registry.isOutOfHours || registry.titles.some((title) => title.isOutOfHours)) {
    return { ...base, state: "pending", result };
  }
  const outcome = verificationOutcome(registry.overallResult);
  if (outcome === "pending") return { ...base, state: "pending", result };
  if (outcome === "manual_review") return { ...base, state: "manual_review", result };
  // An unknown address returns no titles at all; allow a bounded number of corrections.
  if (
    outcome === "fail" && registry.titles.length === 0 && registry.matches.length === 0 &&
    check.attempts < MAX_PROPERTY_LOOKUPS
  ) {
    return { ...base, state: "failed", providerStatus: "no_title_found", result: { propertyInput: input } };
  }
  return { ...base, state: "completed", outcome, result, completedAt: new Date() };
}

function storedPropertyInput(check: CredasCheck): PropertyDetails | undefined {
  const stored = isRecord(check.result) ? check.result.propertyInput : undefined;
  try {
    return isRecord(stored) ? validatePropertyInput(stored) : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the provider's current state for one open check. No database writes. */
async function readProviderState(check: CredasCheck): Promise<CheckUpdate | undefined> {
  if (isJourney(check.kind)) {
    if (!check.processId || !check.entityId) return undefined;
    if (!["awaiting_participant", "in_progress", "manual_review", "expired"].includes(check.state)) return undefined;
    let process: { status: number };
    try {
      process = await credasIntegration.getProcess(check.processId);
    } catch (error) {
      // Credas also notifies on deletion; a process that no longer exists is closed.
      if (error instanceof CredasError && error.statusCode === 404) {
        return { state: "failed", providerStatus: "closed" };
      }
      throw error;
    }
    const state = processState(process.status);
    if (state !== "complete") {
      return {
        state,
        providerStatus: state === "failed" ? "closed" : `process:${process.status}`,
      };
    }
    return check.kind === "identity" ? collectIdentity(check) : collectRightToRent(check);
  }
  if (check.kind === "property_ownership") {
    if (!check.entityId || !check.dataCheckId || !["pending", "manual_review"].includes(check.state)) return undefined;
    const input = storedPropertyInput(check);
    if (!input) return undefined;
    const registry = await credasIntegration.getLandRegistryCheck(check.entityId, check.dataCheckId);
    return evaluateProperty(check, registry, input);
  }
  return undefined;
}

/**
 * Re-reads every open check from Credas. This is the only path that records a journey
 * result, so results always come from an authenticated server-to-server read.
 */
export async function refreshChecks(
  transactionId: string,
  options: { minIntervalMs?: number; checkId?: string } = {},
): Promise<CredasState> {
  const context = await db.transaction(async (tx) => {
    const loaded = await loadContext(tx, transactionId);
    await assertPaid(tx, loaded);
    return loaded;
  });
  const now = Date.now();
  const minInterval = options.minIntervalMs ?? REFRESH_INTERVAL_MS;
  for (const check of context.checks) {
    if (options.checkId && check.id !== options.checkId) continue;
    if (!SYNCABLE_STATES.includes(check.state)) continue;
    if (check.lastSyncedAt && now - check.lastSyncedAt.getTime() < minInterval) continue;
    let update: CheckUpdate | undefined;
    try {
      update = await readProviderState(check);
    } catch (error) {
      if (!(error instanceof CredasError)) throw error;
      // A failed read leaves the stored state untouched; the next refresh retries.
      update = undefined;
      if (options.checkId) throw error;
    }
    await db.transaction(async (tx) => {
      await acquireLock(tx, transactionId);
      const [current] = await tx
        .select()
        .from(credasChecksTable)
        .where(eq(credasChecksTable.id, check.id))
        .limit(1);
      // Never overwrite a result recorded while this read was in flight.
      if (!current || current.state === "completed" || current.state !== check.state) return;
      await tx
        .update(credasChecksTable)
        .set({ ...(update ?? {}), lastSyncedAt: new Date(), updatedAt: new Date() })
        .where(eq(credasChecksTable.id, check.id));
      if (update) await syncTransactionStatus(tx, transactionId);
    });
  }
  return getCredasState(transactionId);
}

// ---------------------------------------------------------------------------
// Datachecks: Bank Account Check, Verify Plus, Property Ownership Check
// ---------------------------------------------------------------------------

export async function runBankAccountCheck(transactionId: string, rawInput: Record<string, unknown>): Promise<CredasState> {
  const input = validateBankAccountInput(rawInput);
  const claimed = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const context = await loadContext(tx, transactionId, true);
    await assertPaid(tx, context);
    const required = CREDAS_PRODUCT_CHECKS[context.product.slug];
    if (!required.includes("bank_account")) {
      throw new CredasError("This transaction does not include a bank account check.", 409);
    }
    const existing = findCheck(context.checks, "bank_account");
    if (existing?.state === "completed") return undefined;
    assertNotRunning(existing);
    if (existing && existing.attempts >= MAX_DATA_CHECK_ATTEMPTS) {
      throw new CredasError("This check has been attempted too many times. Contact DepositSafe for help.", 409);
    }
    // Verify Plus runs the bank check against the person created by the identity journey.
    const identityEntity = required.includes("identity") ? findCheck(context.checks, "identity")?.entityId : undefined;
    if (required.includes("identity") && !identityEntity) {
      throw new CredasError("Start the identity verification before the bank account check.", 409);
    }
    const check = await claimAttempt(tx, transactionId, "bank_account", 0, existing, {
      entityId: existing?.entityId ?? identityEntity ?? null,
    });
    return { check, previousStatus: existing?.providerStatus, reference: context.transaction.reference };
  });
  if (!claimed) return getCredasState(transactionId);

  const { check } = claimed;
  try {
    let entityId = check.entityId;
    if (!entityId) {
      entityId = await credasIntegration.createEntity({
        firstName: input.firstName,
        surname: input.surname,
        reference: `${claimed.reference}:bank`,
      });
      const createdEntity = entityId;
      await db.transaction(async (tx) => {
        await tx
          .update(credasChecksTable)
          .set({ entityId: createdEntity })
          .where(and(eq(credasChecksTable.id, check.id), eq(credasChecksTable.attemptId, check.attemptId ?? "")));
      });
    }
    // If an earlier attempt may have reached Credas, adopt its check instead of paying for another.
    let result = undefined;
    if (claimed.previousStatus === "indeterminate") {
      const summary = await credasIntegration.getEntitySummary(entityId);
      const earlier = summary.bankAccountChecks.at(-1);
      if (earlier) result = await credasIntegration.getBankAccountCheck(entityId, earlier.dataCheckId);
    }
    result ??= await credasIntegration.runBankAccountCheck(entityId, input);
    if (result.entityId !== entityId) throw new CredasError("Credas returned an unexpected record.", 502);
    const completed = result;
    await db.transaction(async (tx) => {
      await acquireLock(tx, transactionId);
      const saved = await writeAttempt(tx, check, {
        dataCheckId: completed.id,
        state: "completed",
        outcome: bankOutcome(completed.result),
        providerStatus: `bank:${completed.result}`,
        result: { bankAccount: bankAccountResult(completed) },
        completedAt: new Date(),
      });
      if (saved) await syncTransactionStatus(tx, transactionId);
    });
  } catch (error) {
    throw await failAttempt(check, error);
  }
  return getCredasState(transactionId);
}

function downloadTitleRegister(): boolean {
  return process.env.CREDAS_LAND_REGISTRY_TITLE_REGISTER?.trim().toLowerCase() === "true";
}

async function saveProperty(check: CredasCheck, update: CheckUpdate): Promise<void> {
  await db.transaction(async (tx) => {
    await acquireLock(tx, check.transactionId);
    if (await writeAttempt(tx, check, update)) await syncTransactionStatus(tx, check.transactionId);
  });
}

export async function runPropertyCheck(transactionId: string, rawInput: Record<string, unknown>): Promise<CredasState> {
  const input = validatePropertyInput(rawInput);
  const claimed = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const context = await loadContext(tx, transactionId, true);
    await assertPaid(tx, context);
    if (!CREDAS_PRODUCT_CHECKS[context.product.slug].includes("property_ownership")) {
      throw new CredasError("This transaction does not include a property ownership check.", 409);
    }
    const existing = findCheck(context.checks, "property_ownership");
    if (existing && ["completed", "pending", "manual_review", "awaiting_title_selection"].includes(existing.state)) {
      return undefined;
    }
    assertNotRunning(existing);
    if (existing && existing.attempts >= MAX_DATA_CHECK_ATTEMPTS) {
      throw new CredasError("This check has been attempted too many times. Contact DepositSafe for help.", 409);
    }
    const check = await claimAttempt(tx, transactionId, "property_ownership", 0, existing);
    return { check, previous: existing, reference: context.transaction.reference };
  });
  if (!claimed) return getCredasState(transactionId);

  const { check } = claimed;
  try {
    let entityId = check.entityId;
    if (!entityId) {
      entityId = await credasIntegration.createEntity({
        firstName: input.firstName,
        surname: input.surname,
        reference: `${claimed.reference}:property`,
      });
      const createdEntity = entityId;
      await db.transaction(async (tx) => {
        await tx
          .update(credasChecksTable)
          .set({ entityId: createdEntity })
          .where(and(eq(credasChecksTable.id, check.id), eq(credasChecksTable.attemptId, check.attemptId ?? "")));
      });
    }
    // If an earlier attempt may have reached Credas, adopt its check instead of paying for another.
    if (claimed.previous?.providerStatus === "indeterminate") {
      const summary = await credasIntegration.getEntitySummary(entityId);
      const earlier = summary.proofOfOwnershipChecks
        .filter((entry) => entry.dataCheckId > (claimed.previous?.dataCheckId ?? 0))
        .at(-1);
      const earlierInput = storedPropertyInput(claimed.previous);
      if (earlier && earlierInput) {
        const registry = await credasIntegration.getLandRegistryCheck(entityId, earlier.dataCheckId);
        await saveProperty(check, evaluateProperty(check, registry, earlierInput));
        return getCredasState(transactionId);
      }
    }
    const response = await credasIntegration.runLandRegistryCheck(entityId, {
      runProofOfOwnershipCheck: true,
      downloadTitleDeed: downloadTitleRegister(),
      downloadTitlePlan: false,
      firstName: input.firstName,
      ...(input.middleName ? { middleName: input.middleName } : {}),
      surname: input.surname,
      addressLine1: input.addressLine1,
      ...(input.addressLine2 ? { addressLine2: input.addressLine2 } : {}),
      city: input.city,
      postcode: input.postcode,
    });
    if (response.check.entityId !== entityId) throw new CredasError("Credas returned an unexpected record.", 502);
    if (response.requiresAdditionalTitleRetrieval && response.titleOptions.length > 0) {
      await saveProperty(check, {
        dataCheckId: response.check.id,
        state: "awaiting_title_selection",
        providerStatus: "title-selection",
        result: { propertyInput: input, titleOptions: titleOptions(response.titleOptions) },
      });
    } else {
      await saveProperty(check, evaluateProperty(check, response.check, input));
    }
  } catch (error) {
    // Keep the submitted address so an indeterminate attempt can be recovered on retry.
    await db.transaction(async (tx) => {
      await tx
        .update(credasChecksTable)
        .set({ result: { propertyInput: input } })
        .where(and(eq(credasChecksTable.id, check.id), eq(credasChecksTable.attemptId, check.attemptId ?? "")));
    });
    throw await failAttempt(check, error);
  }
  return getCredasState(transactionId);
}

/** One title per purchase: each retrieval is a chargeable Land Registry request. */
export async function selectPropertyTitle(transactionId: string, titleNumber: string): Promise<CredasState> {
  const claimed = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const context = await loadContext(tx, transactionId, true);
    await assertPaid(tx, context);
    const existing = findCheck(context.checks, "property_ownership");
    if (!existing || existing.state !== "awaiting_title_selection" || !existing.entityId || !existing.dataCheckId) {
      throw new CredasError("There is no title to choose for this check.", 409);
    }
    const options = isRecord(existing.result) && Array.isArray(existing.result.titleOptions)
      ? existing.result.titleOptions
      : [];
    const chosen = options.find((option) => isRecord(option) && option.titleNumber === titleNumber);
    const input = storedPropertyInput(existing);
    if (!chosen || !input) throw new CredasError("Choose one of the titles listed for this address.", 400);
    const [check] = await tx
      .update(credasChecksTable)
      .set({ state: "starting", attemptId: randomUUID(), updatedAt: new Date() })
      .where(eq(credasChecksTable.id, existing.id))
      .returning();
    return { check, input, options };
  });

  const { check, input } = claimed;
  try {
    await credasIntegration.retrieveTitleDeeds(check.entityId!, check.dataCheckId!, [titleNumber]);
    const registry = await credasIntegration.getLandRegistryCheck(check.entityId!, check.dataCheckId!);
    await saveProperty(check, evaluateProperty(check, registry, input));
  } catch (error) {
    const safeError = error instanceof CredasError ? error : new CredasError("This check could not be completed.", 502);
    // Return to the selection step rather than a fresh, chargeable check.
    await saveProperty(check, {
      state: "awaiting_title_selection",
      result: { propertyInput: input, titleOptions: claimed.options },
    });
    throw safeError;
  }
  return getCredasState(transactionId);
}

// ---------------------------------------------------------------------------
// Invites, journey links and documents
// ---------------------------------------------------------------------------

async function loadCheck(tx: DbTransaction, transactionId: string, checkId: string) {
  const context = await loadContext(tx, transactionId);
  const check = context.checks.find((entry) => entry.id === checkId);
  if (!check) throw new CredasError("Check not found.", 404);
  return { context, check };
}

export async function resendInvite(transactionId: string, checkId: string): Promise<CredasState> {
  const check = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const { context, check: loaded } = await loadCheck(tx, transactionId, checkId);
    await assertPaid(tx, context);
    if (
      !isJourney(loaded.kind) || !loaded.entityId ||
      !["awaiting_participant", "in_progress", "expired"].includes(loaded.state)
    ) {
      throw new CredasError("An invitation cannot be sent for this check.", 409);
    }
    if (loaded.inviteCount >= MAX_INVITES) {
      throw new CredasError("The invitation limit has been reached. Contact DepositSafe for help.", 429);
    }
    const elapsed = Date.now() - (loaded.lastInviteAt?.getTime() ?? 0);
    if (elapsed < INVITE_INTERVAL_MS) {
      throw new CredasError("An invitation was sent recently. Please wait before sending another.", 429, {
        retryAfter: String(Math.ceil((INVITE_INTERVAL_MS - elapsed) / 1000)),
      });
    }
    // Count the attempt before calling Credas so concurrent requests cannot multiply emails.
    await tx
      .update(credasChecksTable)
      .set({ inviteCount: loaded.inviteCount + 1, lastInviteAt: new Date() })
      .where(eq(credasChecksTable.id, loaded.id));
    return loaded;
  });

  if (check.state === "expired") {
    await credasIntegration.newInvite(check.entityId!);
    await db.transaction(async (tx) => {
      await acquireLock(tx, transactionId);
      await tx
        .update(credasChecksTable)
        .set({ state: "awaiting_participant", providerStatus: "reinvited", updatedAt: new Date() })
        .where(and(eq(credasChecksTable.id, check.id), eq(credasChecksTable.state, "expired")));
      await syncTransactionStatus(tx, transactionId);
    });
  } else {
    await credasIntegration.resendInvite(check.entityId!);
  }
  return getCredasState(transactionId);
}

export async function createMagicLink(transactionId: string, checkId: string): Promise<{ url: string; expiresAt: string }> {
  const check = await db.transaction(async (tx) => {
    await acquireLock(tx, transactionId);
    const { context, check: loaded } = await loadCheck(tx, transactionId, checkId);
    await assertPaid(tx, context);
    if (!viewCheck(loaded, context).canCompleteHere || !loaded.processId || !loaded.entityId) {
      throw new CredasError("This verification must be completed by the invited person from their own invitation.", 403);
    }
    const elapsed = Date.now() - (loaded.lastMagicLinkAt?.getTime() ?? 0);
    if (elapsed < MAGIC_LINK_INTERVAL_MS) {
      throw new CredasError("A link was created moments ago. Please wait before requesting another.", 429, {
        retryAfter: String(Math.ceil((MAGIC_LINK_INTERVAL_MS - elapsed) / 1000)),
      });
    }
    await tx
      .update(credasChecksTable)
      .set({ lastMagicLinkAt: new Date() })
      .where(eq(credasChecksTable.id, loaded.id));
    return loaded;
  });
  // The journey is shown inside DepositSafe, so Credas's own page header is left out.
  const url = await credasIntegration.getMagicLink(check.processId!, check.entityId!, { hideHeader: true });
  return { url, expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString() };
}

export async function getDocument(
  transactionId: string,
  checkId: string,
  document: string,
  options: { admin?: boolean } = {},
): Promise<{ pdf: Buffer; filename: string }> {
  const { context, check } = await db.transaction(async (tx) => {
    const loaded = await loadCheck(tx, transactionId, checkId);
    await assertPaid(tx, loaded.context);
    return loaded;
  });
  const reference = context.transaction.reference;
  const offered = viewCheck(check, context).documents.some((entry) => entry.id === document);

  if (check.kind === "bank_account" && document === "report" && offered) {
    return {
      pdf: await credasIntegration.getBankAccountPdf(check.entityId!, check.dataCheckId!),
      filename: `${reference}-bank-account-report.pdf`,
    };
  }
  if (check.kind === "right_to_rent" && document === "report" && offered) {
    return {
      pdf: await credasIntegration.getProcessPdf(check.processId!),
      filename: `${reference}-right-to-rent-report.pdf`,
    };
  }
  if (check.kind === "right_to_rent" && document === "settled-status" && offered) {
    return {
      pdf: await credasIntegration.getSettledStatusPdf(check.entityId!, check.rtrCheckId!),
      filename: `${reference}-home-office-status.pdf`,
    };
  }
  if (check.kind === "property_ownership" && document.startsWith("file-") && offered) {
    return {
      pdf: await credasIntegration.getLandRegistryFile(check.entityId!, check.dataCheckId!, document.slice(5)),
      filename: `${reference}-land-registry.pdf`,
    };
  }
  // The identity report contains the participant's document images, so it is staff-only
  // and excludes the liveness (selfie) section.
  if (check.kind === "identity" && document === "report" && options.admin && check.processId && check.state === "completed") {
    return {
      pdf: await credasIntegration.exportProcessPdf(check.processId, {
        includeCoverPage: true,
        includeOverviewPage: true,
        includePersonalDetails: true,
        includeIdentityChecks: true,
        includeLiveness: false,
        includeSanctionsAndPeps: false,
        includeAddressAndMortalityChecks: false,
        includeBankAccountChecks: false,
        includeForms: false,
        includeAmlChecks: false,
        includeCappChecks: false,
        includeEsignDocuments: false,
        includeOpenBanking: false,
      }),
      filename: `${reference}-identity-report.pdf`,
    };
  }
  throw new CredasError("That document is not available for this check.", 404);
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

/**
 * Credas webhooks are unsigned, so the body is treated as a hint only. The secret token
 * in the callback URL identifies the check, the process ID must match it, and the
 * status and result are then read back from Credas with the API key.
 */
export async function handleCredasWebhook(token: unknown, body: unknown): Promise<boolean> {
  const tokenHash = hashWebhookToken(token);
  const parsed = parseCredasWebhook(body);
  if (!tokenHash || !parsed) return false;
  const [check] = await db
    .select()
    .from(credasChecksTable)
    .where(eq(credasChecksTable.webhookTokenHash, tokenHash))
    .limit(1);
  if (!check || !check.processId || check.processId !== parsed.processId) return false;
  // A recorded result is final; repeated callbacks need no further provider calls.
  if (check.state === "completed") return true;

  const [event] = await db
    .insert(providerEventsTable)
    .values({
      provider: "credas",
      externalEventId: `${check.processId}:${randomUUID()}`,
      eventType: "process.webhook",
      externalReference: check.processId,
      transactionId: check.transactionId,
      occurredAt: new Date(),
      payload: {},
      processingStatus: "processing",
    })
    .returning({ id: providerEventsTable.id });
  try {
    await refreshChecks(check.transactionId, { minIntervalMs: WEBHOOK_REFRESH_INTERVAL_MS, checkId: check.id });
    await db
      .update(providerEventsTable)
      .set({ processingStatus: "processed", processedAt: new Date() })
      .where(eq(providerEventsTable.id, event.id));
  } catch (error) {
    await db
      .update(providerEventsTable)
      .set({ processingStatus: "error", processingError: "Credas status could not be read.", processedAt: new Date() })
      .where(eq(providerEventsTable.id, event.id));
    throw error;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Staff actions
// ---------------------------------------------------------------------------

export type CredasAdminAction =
  | "refresh"
  | "new-invite"
  | "expire-invite"
  | "reinvite-idv"
  | "set-right-to-rent-outcome"
  | "delete-process"
  | "hard-delete-entity";

const RTR_OUTCOMES = { pass: 4, fail: 5, refer: 6 } as const;

async function reopen(tx: DbTransaction, check: CredasCheck, values: CheckUpdate): Promise<void> {
  await tx
    .update(credasChecksTable)
    .set({ outcome: null, completedAt: null, updatedAt: new Date(), ...values })
    .where(eq(credasChecksTable.id, check.id));
  const rows = await tx.select().from(resultsTable).where(eq(resultsTable.transactionId, check.transactionId));
  for (const row of rows) {
    if (isRecord(row.data) && row.data.provider === "Credas") {
      await tx.delete(resultsTable).where(eq(resultsTable.id, row.id));
    }
  }
  await syncTransactionStatus(tx, check.transactionId);
}

export async function runAdminAction(
  checkId: string,
  action: CredasAdminAction,
  input: { outcome?: string; comments?: string },
  actorUserId: string,
): Promise<CredasState> {
  const [check] = await db.select().from(credasChecksTable).where(eq(credasChecksTable.id, checkId)).limit(1);
  if (!check) throw new CredasError("Check not found.", 404);
  const transactionId = check.transactionId;
  const journey = isJourney(check.kind);
  const locked = async (run: (tx: DbTransaction) => Promise<void>) =>
    db.transaction(async (tx) => {
      await acquireLock(tx, transactionId);
      await run(tx);
    });

  if (action === "refresh") {
    await refreshChecks(transactionId, { minIntervalMs: 0 });
  } else if (action === "new-invite") {
    if (!journey || !check.entityId) throw new CredasError("This check has no invitation.", 409);
    await credasIntegration.newInvite(check.entityId);
    await locked((tx) => reopen(tx, check, {
      state: "awaiting_participant" satisfies CredasCheckState,
      providerStatus: "reinvited",
      inviteCount: check.inviteCount + 1,
      lastInviteAt: new Date(),
    }));
  } else if (action === "expire-invite") {
    if (!journey || !check.entityId) throw new CredasError("This check has no invitation.", 409);
    await credasIntegration.expireInvite(check.entityId);
    await locked((tx) => reopen(tx, check, { state: "expired" satisfies CredasCheckState, providerStatus: "invite-expired" }));
  } else if (action === "reinvite-idv") {
    if (!journey || !check.entityId || !check.processId || !check.processActorId) {
      throw new CredasError("This check has no identity journey.", 409);
    }
    await credasIntegration.reinviteIdv(check.processId, check.processActorId, check.entityId);
    await locked((tx) => reopen(tx, check, {
      state: "awaiting_participant" satisfies CredasCheckState,
      providerStatus: "reinvited",
      result: {},
      inviteCount: check.inviteCount + 1,
      lastInviteAt: new Date(),
    }));
  } else if (action === "set-right-to-rent-outcome") {
    const status = RTR_OUTCOMES[input.outcome as keyof typeof RTR_OUTCOMES];
    const comments = (input.comments ?? "").trim();
    if (check.kind !== "right_to_rent" || !check.entityId || !check.rtrCheckId) {
      throw new CredasError("This check has no Right to Rent result to update.", 409);
    }
    if (!status || comments.length < 3 || comments.length > 500) {
      throw new CredasError("Choose an outcome and give a comment of 3 to 500 characters.", 400);
    }
    await credasIntegration.setRightToRentOutcome(check.entityId, check.rtrCheckId, status, comments);
    await locked((tx) => reopen(tx, check, { state: "manual_review" satisfies CredasCheckState }));
    await refreshChecks(transactionId, { minIntervalMs: 0, checkId: check.id });
  } else if (action === "delete-process") {
    if (!check.processId) throw new CredasError("This check has no Credas process.", 409);
    await credasIntegration.deleteProcess(check.processId);
    await locked((tx) => reopen(tx, check, { state: "failed" satisfies CredasCheckState, providerStatus: "closed" }));
  } else if (action === "hard-delete-entity") {
    if (!check.entityId) throw new CredasError("This check has no Credas record.", 409);
    const [participant] = check.participantId
      ? await db.select().from(participantsTable).where(eq(participantsTable.id, check.participantId)).limit(1)
      : [];
    await credasIntegration.hardDeleteEntity(check.entityId, journey ? participant?.email : undefined);
    await locked(async (tx) => {
      // Other checks on the same Credas record (Verify Plus) are erased with it.
      const siblings = await tx
        .select()
        .from(credasChecksTable)
        .where(and(eq(credasChecksTable.transactionId, transactionId), eq(credasChecksTable.entityId, check.entityId!)));
      for (const sibling of siblings) {
        await reopen(tx, sibling, {
          state: "failed" satisfies CredasCheckState,
          providerStatus: "closed",
          result: {},
          entityId: null,
          processId: null,
          processActorId: null,
          dataCheckId: null,
          rtrCheckId: null,
          webhookTokenHash: null,
        });
      }
    });
  } else {
    throw new CredasError("Unknown action.", 400);
  }

  await db.insert(auditEventsTable).values({
    userId: actorUserId,
    transactionId,
    action: `credas.${action}`,
    entityType: "credas_check",
    entityId: check.id,
    metadata: action === "set-right-to-rent-outcome" ? { outcome: input.outcome } : {},
  });
  logger.info({ action, checkId: check.id }, "Credas staff action completed");
  return getCredasState(transactionId);
}
