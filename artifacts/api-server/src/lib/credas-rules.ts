// Pure Credas rules: input validation, provider-code mapping and status derivation.
// No database or network access, so everything here is unit-testable in isolation.
import { createHash, randomBytes } from "node:crypto";
import type {
  CredasBankAccountCheck,
  CredasBankAccountInput,
  CredasLandRegistryCheck,
  CredasShareCode,
  CredasTitleOption,
} from "./integrations/credas";

export type CredasCheckKind = "identity" | "right_to_rent" | "bank_account" | "property_ownership";
export type CredasCheckState =
  | "starting"
  | "awaiting_participant"
  | "in_progress"
  | "awaiting_title_selection"
  | "pending"
  | "manual_review"
  | "completed"
  | "failed"
  | "expired";
export type CredasOutcome = "pass" | "refer" | "fail";
export type CredasComponentResult = "pass" | "refer" | "fail" | "action_required" | "not_performed";

/** The Credas checks each DepositSafe product requires, in slot order. */
export const CREDAS_PRODUCT_CHECKS: Record<string, readonly CredasCheckKind[]> = {
  "bank-account-check": ["bank_account"],
  "property-ownership-check": ["property_ownership"],
  verify: ["identity"],
  "verify-both": ["identity", "identity"],
  "verify-plus": ["identity", "bank_account"],
  "right-to-rent": ["right_to_rent"],
};

export class CredasInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredasInputError";
  }
}

const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}' .-]*$/u;
const ADDRESS_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}\p{M} ,.'/&()-]*$/u;
const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const POSTCODE_PATTERN = /^([A-Z]{1,2}[0-9][A-Z0-9]?)([0-9][A-Z]{2})$/;

function clean(value: unknown): string {
  return typeof value === "string" ? value.normalize("NFC").trim().replace(/\s+/g, " ") : "";
}

export function normalizeName(value: unknown, label: string, required = true): string | undefined {
  const name = clean(value);
  if (!name) {
    if (required) throw new CredasInputError(`Enter the ${label}.`);
    return undefined;
  }
  if (name.length > 100 || !NAME_PATTERN.test(name)) {
    throw new CredasInputError(`Enter a valid ${label}.`);
  }
  return name;
}

export function normalizeEmail(value: unknown): string {
  const email = clean(value).toLowerCase();
  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new CredasInputError("Enter a valid email address.");
  }
  return email;
}

export function normalizeAddressLine(value: unknown, label: string, required = true): string | undefined {
  const line = clean(value);
  if (!line) {
    if (required) throw new CredasInputError(`Enter the ${label}.`);
    return undefined;
  }
  if (line.length > 100 || !ADDRESS_PATTERN.test(line)) {
    throw new CredasInputError(`Enter a valid ${label}.`);
  }
  return line;
}

export function normalizePostcode(value: unknown): string {
  const compact = clean(value).toUpperCase().replace(/ /g, "");
  const match = POSTCODE_PATTERN.exec(compact);
  if (!match) throw new CredasInputError("Enter a valid UK postcode.");
  return `${match[1]} ${match[2]}`;
}

export function normalizeSortCode(value: unknown): string {
  const digits = clean(value).replace(/[\s-]/g, "");
  if (!/^[0-9]{6}$/.test(digits)) throw new CredasInputError("Enter a six-digit sort code.");
  return digits;
}

export function normalizeAccountNumber(value: unknown): string {
  const digits = clean(value).replace(/\s/g, "");
  if (!/^[0-9]{8}$/.test(digits)) throw new CredasInputError("Enter an eight-digit account number.");
  return digits;
}

/** Accepts YYYY-MM-DD only and returns the midnight-UTC timestamp Credas expects. */
export function normalizeDateOfBirth(value: unknown, now: Date = new Date()): string | undefined {
  const raw = clean(value);
  if (!raw) return undefined;
  const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(raw);
  if (!match) throw new CredasInputError("Enter a valid date of birth.");
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    year < 1900 ||
    date.getTime() > now.getTime()
  ) {
    throw new CredasInputError("Enter a valid date of birth.");
  }
  return `${raw}T00:00:00Z`;
}

export interface BankAccountDetails {
  firstName: string;
  middleNames?: string;
  surname: string;
  dateOfBirth?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county?: string;
  postcode: string;
  sortCode: string;
  accountNumber: string;
}

export function validateBankAccountInput(input: Record<string, unknown>): CredasBankAccountInput {
  const middleNames = normalizeName(input.middleNames, "middle names", false);
  const dateOfBirth = normalizeDateOfBirth(input.dateOfBirth);
  const addressLine2 = normalizeAddressLine(input.addressLine2, "second address line", false);
  const county = normalizeAddressLine(input.county, "county", false);
  return {
    firstName: normalizeName(input.firstName, "account holder’s first name")!,
    ...(middleNames ? { middleNames } : {}),
    surname: normalizeName(input.surname, "account holder’s surname")!,
    ...(dateOfBirth ? { dateOfBirth } : {}),
    addressLine1: normalizeAddressLine(input.addressLine1, "first address line")!,
    ...(addressLine2 ? { addressLine2 } : {}),
    city: normalizeAddressLine(input.city, "town or city")!,
    ...(county ? { county } : {}),
    postcode: normalizePostcode(input.postcode),
    // UK accounts only; the country is never taken from the browser.
    country: "United Kingdom",
    sortcode: normalizeSortCode(input.sortCode),
    accountNumber: normalizeAccountNumber(input.accountNumber),
  };
}

export interface PropertyDetails {
  firstName: string;
  middleName?: string;
  surname: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
}

export function validatePropertyInput(input: Record<string, unknown>): PropertyDetails {
  const middleName = normalizeName(input.middleName, "middle name", false);
  const addressLine2 = normalizeAddressLine(input.addressLine2, "second address line", false);
  return {
    firstName: normalizeName(input.firstName, "owner’s first name")!,
    ...(middleName ? { middleName } : {}),
    surname: normalizeName(input.surname, "owner’s surname")!,
    addressLine1: normalizeAddressLine(input.addressLine1, "first address line")!,
    ...(addressLine2 ? { addressLine2 } : {}),
    city: normalizeAddressLine(input.city, "town or city")!,
    postcode: normalizePostcode(input.postcode),
  };
}

export interface ParticipantDetails {
  firstName: string;
  surname: string;
  email: string;
}

export function validateParticipants(input: unknown, expected: number): ParticipantDetails[] {
  if (!Array.isArray(input) || input.length !== expected) {
    throw new CredasInputError(
      expected === 1 ? "Enter the details of the person to verify." : `Enter the details of all ${expected} people.`,
    );
  }
  const participants = input.map((value) => {
    const entry = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>;
    return {
      firstName: normalizeName(entry.firstName, "first name")!,
      surname: normalizeName(entry.surname, "surname")!,
      email: normalizeEmail(entry.email),
    };
  });
  if (new Set(participants.map((participant) => participant.email)).size !== participants.length) {
    throw new CredasInputError("Each person needs their own email address.");
  }
  return participants;
}

const COMPONENT_RESULTS: CredasComponentResult[] = ["not_performed", "pass", "refer", "fail", "action_required"];

/** Credas CheckResult: 0 NotPerformed, 1 Pass, 2 Refer, 3 Fail, 4 ActionRequired. */
export function componentResult(value: number): CredasComponentResult {
  return COMPONENT_RESULTS[value] ?? "not_performed";
}

/** Credas bank result: 1 Pass, 2 Refer, 3 Fail. */
export function bankOutcome(result: number): CredasOutcome {
  return result === 1 ? "pass" : result === 3 ? "fail" : "refer";
}

/**
 * Credas verification result used by Land Registry and Right to Rent: 0 NotPerformed,
 * 1 AutoPass, 2 AutoFail, 3 PendingManualCheck, 4 ManualPass, 5 ManualFail, 6 ManualRefer, 7 Requested.
 */
export function verificationOutcome(value: number): CredasOutcome | "manual_review" | "pending" {
  if (value === 1 || value === 4) return "pass";
  if (value === 2 || value === 5) return "fail";
  if (value === 6) return "refer";
  if (value === 3) return "manual_review";
  return "pending";
}

const VERIFICATION_LABELS = [
  "Not performed", "Passed automatically", "Failed automatically", "Awaiting manual review",
  "Passed on manual review", "Failed on manual review", "Referred on manual review", "Requested",
];

export function verificationLabel(value: number): string {
  return VERIFICATION_LABELS[value] ?? "Unknown";
}

/** Credas process status: 0 NotStarted, 1 InProgress, 2 Complete, 3 Deleted, 4 PendingApproval, 5 Rejected, 6 Expired, 7 Archived. */
export function processState(status: number): CredasCheckState | "complete" {
  if (status === 0) return "awaiting_participant";
  if (status === 1) return "in_progress";
  if (status === 2) return "complete";
  if (status === 4) return "manual_review";
  if (status === 6) return "expired";
  return "failed";
}

const MATCH_LABELS = ["no_match", "match", "partial_match", "not_checked"] as const;
export type CredasMatch = (typeof MATCH_LABELS)[number];

export function matchLabel(value: number | null): CredasMatch {
  return value === null ? "not_checked" : MATCH_LABELS[value] ?? "not_checked";
}

const REMARK_TYPES = ["comment", "match", "warning", "mismatch"] as const;

const DOCUMENT_TYPES = [
  "Unknown", "Agent’s licence", "Driving licence", "Electoral card", "Foreigner identification card",
  "Health card", "Job licence", "Membership card", "Military identification card",
  "National identification card", "Passport", "Proof of age card", "Travel permit", "Visa",
  "Weapons licence", "Share code", "Passport card",
];

export function documentTypeLabel(value: number | null): string | undefined {
  return value === null || value === 0 ? undefined : DOCUMENT_TYPES[value];
}

function safeText(value: string | null, max: number): string | undefined {
  if (!value) return undefined;
  // Provider text is shown to customers as plain text; strip control characters and bound it.
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, max) : undefined;
}

/** Customer-facing bank result. The account number is reduced to its last four digits. */
export function bankAccountResult(check: CredasBankAccountCheck) {
  const { input } = check;
  return {
    accountHolder: `${input.firstName} ${input.surname}`.trim().slice(0, 201),
    sortCode: input.sortcode.replace(/[^0-9]/g, "").slice(0, 6),
    accountNumberEnding: input.accountNumber.replace(/[^0-9]/g, "").slice(-4),
    ...(safeText(check.resultText, 60) ? { resultText: safeText(check.resultText, 60) } : {}),
    remarks: check.remarks.slice(0, 40).flatMap((remark) => {
      const description = safeText(remark.description, 300);
      return description
        ? [{ type: REMARK_TYPES[remark.type] ?? "comment", description }]
        : [];
    }),
  };
}

export function titleOptions(options: CredasTitleOption[]) {
  return options.slice(0, 25).map((option) => ({
    titleNumber: option.titleNumber,
    ...(safeText(option.tenure, 40) ? { tenure: safeText(option.tenure, 40) } : {}),
    ...(safeText(option.address, 200) ? { address: safeText(option.address, 200) } : {}),
    match: matchLabel(option.matchType),
  }));
}

export function propertyResult(check: CredasLandRegistryCheck, input: PropertyDetails) {
  const titleAddress = new Map(check.titles.map((title) => [title.titleNumber, title.address]));
  return {
    ownerName: `${input.firstName} ${input.surname}`,
    address: [input.addressLine1, input.addressLine2, input.city, input.postcode].filter(Boolean).join(", "),
    statusLabel: verificationLabel(check.overallResult),
    titlesFound: check.titles.length,
    matches: check.matches.slice(0, 25).map((match) => ({
      ...(match.titleNumber ? { titleNumber: match.titleNumber } : {}),
      ...(safeText(titleAddress.get(match.titleNumber) ?? null, 200)
        ? { address: safeText(titleAddress.get(match.titleNumber) ?? null, 200) }
        : {}),
      overallMatch: matchLabel(match.overallMatch),
      firstNameMatch: matchLabel(match.firstNameMatch),
      surnameMatch: matchLabel(match.surnameMatch),
      ownership: match.ownershipType === 1 ? "joint" : match.ownershipType === 0 ? "sole" : "unknown",
      ...(safeText(match.tenure, 40) ? { tenure: safeText(match.tenure, 40) } : {}),
      historical: match.isHistorical,
    })),
    files: check.files.slice(0, 10).map((file) => ({
      id: file.fileId,
      label: /Title_Plan/i.test(file.filename ?? "") ? "Title plan" : "Title register",
      ...(file.titleNumber ? { titleNumber: file.titleNumber } : {}),
    })),
  };
}

export function shareCodeResult(codes: CredasShareCode[]) {
  const code = codes.at(-1);
  return code
    ? { valid: code.valid, faceMatch: code.faceMatch, nameMatch: code.nameMatch, hasCertificate: code.hasCertificate }
    : undefined;
}

export function overallOutcome(outcomes: CredasOutcome[]): CredasOutcome {
  if (outcomes.includes("fail")) return "fail";
  if (outcomes.includes("refer")) return "refer";
  return "pass";
}

export type DerivedStatus =
  | "PAID"
  | "AWAITING_PARTICIPANT"
  | "VERIFICATION_IN_PROGRESS"
  | "VERIFICATION_FAILED"
  | "MANUAL_ATTENTION"
  | "EXPIRED"
  | "RESULT_GENERATED";

/** The transaction status implied by a paid transaction's Credas checks. */
export function deriveTransactionStatus(
  productSlug: string,
  checks: { kind: string; slot: number; state: string; outcome: string | null }[],
): { status: DerivedStatus; outcome?: CredasOutcome } {
  const required = CREDAS_PRODUCT_CHECKS[productSlug] ?? [];
  const slots = new Map<string, number>();
  const expected = required.map((kind) => {
    const slot = slots.get(kind) ?? 0;
    slots.set(kind, slot + 1);
    return checks.find((check) => check.kind === kind && check.slot === slot);
  });
  const present = expected.filter((check): check is NonNullable<typeof check> => Boolean(check));
  if (present.length === 0) return { status: "PAID" };

  const completed = present.filter((check) => check.state === "completed");
  if (completed.length === required.length) {
    const outcomes = completed.map((check) => check.outcome);
    if (outcomes.every((outcome): outcome is CredasOutcome =>
      outcome === "pass" || outcome === "refer" || outcome === "fail")) {
      return { status: "RESULT_GENERATED", outcome: overallOutcome(outcomes) };
    }
    return { status: "MANUAL_ATTENTION" };
  }
  if (present.some((check) => check.state === "manual_review")) return { status: "MANUAL_ATTENTION" };
  if (present.some((check) => check.state === "expired")) return { status: "EXPIRED" };
  if (present.some((check) => check.state === "failed")) return { status: "VERIFICATION_FAILED" };
  if (present.some((check) => check.state === "awaiting_participant")) return { status: "AWAITING_PARTICIPANT" };
  return { status: "VERIFICATION_IN_PROGRESS" };
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function newWebhookToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Returns the stored hash for a presented webhook token, or undefined if it is malformed. */
export function hashWebhookToken(token: unknown): string | undefined {
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return undefined;
  return createHash("sha256").update(token).digest("hex");
}

/** The public HTTPS origin Credas calls back to, from server configuration only. */
export function credasPublicOrigin(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const domain = env.REPLIT_DOMAINS?.split(",")[0]?.trim() || env.REPLIT_DEV_DOMAIN?.trim();
  const configured = env.DEPOSITSAFE_PUBLIC_ORIGIN?.trim() || (domain ? `https://${domain.replace(/^https?:\/\//, "")}` : "");
  if (!configured) return undefined;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** The token travels in the query string, which request logging strips; the callback stays at the API root. */
export function credasWebhookUrl(origin: string, token: string): string {
  const url = new URL("/api/webhooks/credas", origin);
  url.searchParams.set("t", token);
  return url.toString();
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Credas sends capitalised keys. Only the process ID is used; the status is re-read from Credas. */
export function parseCredasWebhook(body: unknown): { processId: string } | undefined {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const record = body as Record<string, unknown>;
  const processId = record.ProcessId ?? record.processId;
  if (typeof processId !== "string" || !UUID_PATTERN.test(processId)) return undefined;
  return { processId: processId.toLowerCase() };
}
