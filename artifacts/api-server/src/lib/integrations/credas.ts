// Server-side Credas Connect API client. The API key never leaves this module and
// every request goes to one of two fixed Credas hosts; nothing here is caller-routable.

const API_PATH = "/api/v2/ci";
const HOSTS = {
  sandbox: { api: "https://portal.credasdemo.com", journeyDomain: "credasdemo.com" },
  production: { api: "https://portal.credas.com", journeyDomain: "credas.com" },
} as const;
// Public sandbox journeys from Credas; production IDs differ and must be configured.
const SANDBOX_JOURNEYS = {
  identity: { journeyId: "fae35444-2710-43db-98a0-23fbfeef6f8b", actorId: 42 },
  right_to_rent: { journeyId: "60b818e9-9ada-4bf3-a43c-793ee4c8fc6c", actorId: 18 },
} as const;

const DEFAULT_TIMEOUT_MS = 15_000;
const CHECK_TIMEOUT_MS = 30_000;
const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CredasEnvironment = keyof typeof HOSTS;
export type CredasJourneyKind = keyof typeof SANDBOX_JOURNEYS;

export class CredasError extends Error {
  readonly retryAfter?: string;
  /** True when Credas may have acted on the request even though no result came back. */
  readonly indeterminate: boolean;

  constructor(
    message: string,
    readonly statusCode: number,
    options: { retryAfter?: string; indeterminate?: boolean } = {},
  ) {
    super(message);
    this.name = "CredasError";
    this.retryAfter = options.retryAfter;
    this.indeterminate = options.indeterminate ?? false;
  }
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.REPLIT_DEPLOYMENT === "1" ||
    Boolean(env.WEB_REPL_RENEWAL && !env.REPL_IDENTITY)
  );
}

export function credasEnvironment(env: NodeJS.ProcessEnv = process.env): CredasEnvironment {
  const configured = env.CREDAS_ENVIRONMENT?.trim().toLowerCase();
  if (configured === "sandbox" || configured === "production") return configured;
  if (configured) throw new CredasError("Credas is not configured.", 503);
  return isProductionRuntime(env) ? "production" : "sandbox";
}

export function credasJourney(
  kind: CredasJourneyKind,
  env: NodeJS.ProcessEnv = process.env,
): { journeyId: string; actorId: number } {
  const prefix = kind === "identity" ? "CREDAS_IDENTITY" : "CREDAS_RIGHT_TO_RENT";
  const journeyId = env[`${prefix}_JOURNEY_ID`]?.trim();
  const actorValue = env[`${prefix}_ACTOR_ID`]?.trim();
  if (journeyId || actorValue) {
    const actorId = Number(actorValue);
    if (!journeyId || !UUID_PATTERN.test(journeyId) || !Number.isInteger(actorId) || actorId <= 0) {
      throw new CredasError("Credas journeys are not configured.", 503);
    }
    return { journeyId: journeyId.toLowerCase(), actorId };
  }
  if (credasEnvironment(env) !== "sandbox") {
    throw new CredasError("Credas journeys are not configured.", 503);
  }
  return SANDBOX_JOURNEYS[kind];
}

/** A journey link is the participant's own sign-in; accept only HTTPS on the Credas domain. */
export function isTrustedJourneyUrl(value: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const domain = HOSTS[credasEnvironment(env)].journeyDomain;
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    url.hostname.toLowerCase().endsWith(`.${domain}`)
  );
}

function apiKey(): string {
  const key = process.env.CREDAS_API_KEY?.trim();
  if (!key) throw new CredasError("Credas is not configured.", 503);
  return key;
}

function uuidSegment(value: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new CredasError("An invalid Credas identifier was used.", 500);
  }
  return value.toLowerCase();
}

function intSegment(value: number): string {
  if (!Number.isInteger(value) || value <= 0) {
    throw new CredasError("An invalid Credas identifier was used.", 500);
  }
  return String(value);
}

function retryAfter(response: Response): string | undefined {
  const value = response.headers.get("retry-after");
  return value && /^[0-9]{1,6}$/.test(value) ? value : undefined;
}

type Expect = "json" | "pdf" | "none";

async function readBody(response: Response, limit: number): Promise<Buffer> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) {
    throw new CredasError("Credas returned an unexpectedly large response.", 502);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > limit) {
    throw new CredasError("Credas returned an unexpectedly large response.", 502);
  }
  return buffer;
}

async function request(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options: { expect: Expect; body?: unknown; query?: Record<string, string>; timeoutMs?: number },
): Promise<unknown> {
  const key = apiKey();
  const url = new URL(`${HOSTS[credasEnvironment()].api}${API_PATH}${path}`);
  for (const [name, value] of Object.entries(options.query ?? {})) url.searchParams.set(name, value);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "x-api-key": key,
        accept: options.expect === "pdf" ? "application/pdf" : "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // The API key must never follow a redirect to another host.
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new CredasError(
      timedOut ? "Credas did not respond in time." : "Credas could not be reached.",
      timedOut ? 504 : 502,
      { indeterminate: method !== "GET" },
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new CredasError("Credas credentials could not be verified.", 503);
  }
  if (response.status === 404) throw new CredasError("The Credas record was not found.", 404);
  if (response.status === 429) {
    throw new CredasError("Credas is temporarily rate limiting requests.", 429, {
      retryAfter: retryAfter(response),
    });
  }
  if (response.status === 400 || response.status === 422) {
    throw new CredasError("Credas could not accept the details provided.", 422);
  }
  if (!response.ok) {
    throw new CredasError(
      response.status >= 500 ? "Credas is temporarily unavailable." : "Credas rejected the request.",
      response.status >= 500 ? 503 : 502,
      { retryAfter: retryAfter(response), indeterminate: method !== "GET" && response.status >= 500 },
    );
  }

  if (options.expect === "none") return undefined;
  if (options.expect === "pdf") {
    const pdf = await readBody(response, MAX_PDF_BYTES);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new CredasError("Credas returned an invalid document.", 502);
    }
    return pdf;
  }
  if (response.status === 204) return null;
  const text = (await readBody(response, MAX_JSON_BYTES)).toString("utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CredasError("Credas returned an invalid response.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function invalid(): CredasError {
  return new CredasError("Credas returned an invalid response.", 502);
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw invalid();
  return value;
}

function requireUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw invalid();
  return value.toLowerCase();
}

function requireInt(value: unknown): number {
  const parsed = int(value);
  if (parsed === null) throw invalid();
  return parsed;
}

export interface CredasJourney {
  id: string;
  title: string | null;
  isActive: boolean;
  isRightToRent: boolean;
  webhookEnabled: boolean;
  actors: { id: number; title: string | null; isClient: boolean }[];
}

export interface CredasBankAccountInput {
  firstName: string;
  middleNames?: string;
  surname: string;
  dateOfBirth?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  county?: string;
  postcode: string;
  country: string;
  sortcode: string;
  accountNumber: string;
}

export interface CredasBankAccountCheck {
  id: number;
  entityId: string;
  result: number;
  resultText: string | null;
  dateCreated: string | null;
  remarks: { source: string | null; type: number; description: string }[];
  /** The details Credas recorded for this check, echoed back by the provider. */
  input: { firstName: string; surname: string; sortcode: string; accountNumber: string };
}

export interface CredasLandRegistryInput {
  runProofOfOwnershipCheck: boolean;
  downloadTitleDeed: boolean;
  downloadTitlePlan: boolean;
  firstName?: string;
  middleName?: string;
  surname?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postcode: string;
}

export interface CredasLandRegistryCheck {
  id: number;
  entityId: string;
  dateCreated: string | null;
  isOutOfHours: boolean;
  overallResult: number;
  matches: {
    titleNumber: string | null;
    firstNameMatch: number | null;
    middleNameMatch: number | null;
    surnameMatch: number | null;
    overallMatch: number | null;
    isHistorical: boolean;
    ownershipType: number | null;
    tenure: string | null;
  }[];
  titles: { titleNumber: string | null; address: string | null; tenure: string | null; isOutOfHours: boolean }[];
  files: { fileId: string; filename: string | null; titleNumber: string | null }[];
}

export interface CredasTitleOption {
  titleNumber: string;
  tenure: string | null;
  address: string | null;
  matchType: number | null;
}

export interface CredasProcessInput {
  journeyId: string;
  actorId: number;
  title: string;
  webhookUrl?: string;
  reference: string;
  firstName: string;
  surname: string;
  emailAddress: string;
  phoneNumber?: string;
  sendEmailInvite: boolean;
  clientAliasName?: string;
  /** Shown by Credas with the alias name on its emails and journey screens. */
  clientAliasLogoBase64?: string;
}

export interface CredasProcess {
  processId: string;
  entityId: string;
  processActorId: number;
  status: number;
}

export interface CredasEntitySummary {
  identityVerifications: {
    processId: string | null;
    dateCompleted: string | null;
    overallResult: number;
    livenessResult: number;
    documentResult: number;
    faceMatchResult: number;
    nameMatchResult: number;
    documentType: number | null;
  }[];
  bankAccountChecks: { dataCheckId: number; overallResult: number }[];
  proofOfOwnershipChecks: { dataCheckId: number; overallResult: number }[];
  rightToRentChecks: {
    processId: string | null;
    rightToRentCheckId: number;
    overallResult: number;
    shareCode: boolean;
  }[];
}

export interface CredasActiveCheck {
  type: number;
  status: number;
  dataCheckId: number | null;
  rtxCheckId: number | null;
}

export interface CredasRightToRentCheck {
  id: number;
  status: number;
  dateCreated: string | null;
  history: { dateCreated: string | null; previousStatus: number | null; newStatus: number | null }[];
}

export interface CredasShareCode {
  valid: boolean;
  faceMatch: boolean;
  nameMatch: boolean;
  hasCertificate: boolean;
}

export type CredasPdfSections = Record<
  | "includeCoverPage"
  | "includeOverviewPage"
  | "includePersonalDetails"
  | "includeIdentityChecks"
  | "includeLiveness"
  | "includeSanctionsAndPeps"
  | "includeAddressAndMortalityChecks"
  | "includeBankAccountChecks"
  | "includeForms"
  | "includeAmlChecks"
  | "includeCappChecks"
  | "includeEsignDocuments"
  | "includeOpenBanking",
  boolean
>;

function mapBankAccountCheck(value: unknown): CredasBankAccountCheck {
  const check = requireRecord(value);
  const result = requireInt(check.result);
  if (![1, 2, 3].includes(result)) throw invalid();
  const input = requireRecord(check.input);
  const sortcode = text(input.sortcode);
  const accountNumber = text(input.accountNumber);
  if (!sortcode || !accountNumber) throw invalid();
  return {
    id: requireInt(check.id),
    entityId: requireUuid(check.entityId),
    result,
    resultText: text(check.resultText),
    dateCreated: text(check.dateCreated),
    input: {
      firstName: text(input.firstName) ?? "",
      surname: text(input.surname) ?? "",
      sortcode,
      accountNumber,
    },
    remarks: records(check.dataSources).flatMap((source) =>
      records(source.remarks).flatMap((remark) => {
        const description = text(remark.description);
        const type = int(remark.type);
        return description && type !== null ? [{ source: text(source.name), type, description }] : [];
      }),
    ),
  };
}

function mapLandRegistryCheck(value: unknown): CredasLandRegistryCheck {
  const check = requireRecord(value);
  const result = requireRecord(check.result);
  return {
    id: requireInt(check.id),
    entityId: requireUuid(check.entityId),
    dateCreated: text(check.dateCreated),
    isOutOfHours: check.isOutOfHours === true,
    overallResult: requireInt(result.overallResult),
    matches: records(result.matches).map((match) => ({
      titleNumber: text(match.titleNumber),
      firstNameMatch: int(match.firstNameMatch),
      middleNameMatch: int(match.middleNameMatch),
      surnameMatch: int(match.surnameMatch),
      overallMatch: int(match.overallMatch),
      isHistorical: match.isHistorical === true,
      ownershipType: int(match.ownershipType),
      tenure: isRecord(match.property) ? text(match.property.tenure) : null,
    })),
    titles: records(result.titles).map((title) => ({
      titleNumber: text(title.titleNumber),
      address: text(title.address),
      tenure: text(title.tenure),
      isOutOfHours: title.isOutOfHours === true,
    })),
    files: records(result.files).flatMap((file) =>
      typeof file.fileId === "string" && UUID_PATTERN.test(file.fileId)
        ? [{ fileId: file.fileId.toLowerCase(), filename: text(file.filename), titleNumber: text(file.titleNumber) }]
        : [],
    ),
  };
}

const inviteBody = { contactByEmail: true, contactBySms: false };

export const credasIntegration = {
  provider: "Credas",

  get configured(): boolean {
    return Boolean(process.env.CREDAS_API_KEY?.trim());
  },

  /** GET /journeys */
  async listJourneys(): Promise<CredasJourney[]> {
    const payload = await request("GET", "/journeys", { expect: "json" });
    return records(payload).map((journey) => ({
      id: requireUuid(journey.id),
      title: text(journey.title),
      isActive: journey.isActive === true,
      isRightToRent: journey.isRightToRent === true,
      webhookEnabled: journey.webhookEnabled === true,
      actors: records(journey.actors).map((actor) => ({
        id: requireInt(actor.id),
        title: text(actor.title),
        isClient: actor.isClient === true,
      })),
    }));
  },

  /** POST /entities */
  async createEntity(input: { firstName: string; surname: string; reference: string }): Promise<string> {
    const payload = await request("POST", "/entities", { expect: "json", body: input });
    return requireUuid(requireRecord(payload).id);
  },

  /** POST /entities/{entityId}/data-checks/bank-account */
  async runBankAccountCheck(entityId: string, input: CredasBankAccountInput): Promise<CredasBankAccountCheck> {
    const payload = await request(
      "POST",
      `/entities/${uuidSegment(entityId)}/data-checks/bank-account`,
      { expect: "json", body: input, timeoutMs: CHECK_TIMEOUT_MS },
    );
    return mapBankAccountCheck(payload);
  },

  /** GET /entities/{entityId}/data-checks/{dataCheckId}/bank-account */
  async getBankAccountCheck(entityId: string, dataCheckId: number): Promise<CredasBankAccountCheck> {
    const payload = await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/${intSegment(dataCheckId)}/bank-account`,
      { expect: "json" },
    );
    return mapBankAccountCheck(payload);
  },

  /** GET /entities/{entityId}/data-checks/{dataCheckId}/bank-account/pdf */
  async getBankAccountPdf(entityId: string, dataCheckId: number): Promise<Buffer> {
    return await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/${intSegment(dataCheckId)}/bank-account/pdf`,
      { expect: "pdf", timeoutMs: CHECK_TIMEOUT_MS },
    ) as Buffer;
  },

  /** POST /entities/{entityId}/data-checks/land-registry */
  async runLandRegistryCheck(entityId: string, input: CredasLandRegistryInput): Promise<{
    check: CredasLandRegistryCheck;
    requiresAdditionalTitleRetrieval: boolean;
    titleOptions: CredasTitleOption[];
  }> {
    const payload = requireRecord(await request(
      "POST",
      `/entities/${uuidSegment(entityId)}/data-checks/land-registry`,
      { expect: "json", body: input, timeoutMs: CHECK_TIMEOUT_MS },
    ));
    return {
      check: mapLandRegistryCheck(payload.landRegistryCheck),
      requiresAdditionalTitleRetrieval: payload.requiresAdditionalTitleRetrieval === true,
      titleOptions: records(payload.titleNumberDetails).flatMap((title) => {
        const titleNumber = text(title.titleNumber);
        return titleNumber
          ? [{ titleNumber, tenure: text(title.tenure), address: text(title.address), matchType: int(title.matchType) }]
          : [];
      }),
    };
  },

  /** PUT /entities/{entityId}/data-checks/{dataCheckId}/land-registry/retrieve-title-deeds */
  async retrieveTitleDeeds(entityId: string, dataCheckId: number, titleNumbers: string[]): Promise<void> {
    await request(
      "PUT",
      `/entities/${uuidSegment(entityId)}/data-checks/${intSegment(dataCheckId)}/land-registry/retrieve-title-deeds`,
      { expect: "none", body: { titleNumbers }, timeoutMs: CHECK_TIMEOUT_MS },
    );
  },

  /** GET /entities/{entityId}/data-checks/{dataCheckId}/land-registry */
  async getLandRegistryCheck(entityId: string, dataCheckId: number): Promise<CredasLandRegistryCheck> {
    const payload = await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/${intSegment(dataCheckId)}/land-registry`,
      { expect: "json" },
    );
    return mapLandRegistryCheck(payload);
  },

  /** GET /entities/{entityId}/data-checks/{dataCheckId}/land-registry/files/{fileId} */
  async getLandRegistryFile(entityId: string, dataCheckId: number, fileId: string): Promise<Buffer> {
    return await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/${intSegment(dataCheckId)}/land-registry/files/${uuidSegment(fileId)}`,
      { expect: "pdf", timeoutMs: CHECK_TIMEOUT_MS },
    ) as Buffer;
  },

  /** POST /processes */
  async createProcess(input: CredasProcessInput): Promise<CredasProcess> {
    const payload = requireRecord(await request("POST", "/processes", {
      expect: "json",
      timeoutMs: CHECK_TIMEOUT_MS,
      body: {
        title: input.title,
        journeyId: uuidSegment(input.journeyId),
        ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
        processEntities: [{
          firstName: input.firstName,
          surname: input.surname,
          emailAddress: input.emailAddress,
          ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
          reference: input.reference,
          actorId: input.actorId,
          contactViaEmail: input.sendEmailInvite,
          contactViaSms: false,
          inPerson: false,
          ...(input.clientAliasName ? { clientAliasName: input.clientAliasName } : {}),
          ...(input.clientAliasLogoBase64 ? { clientAliasLogoBase64: input.clientAliasLogoBase64 } : {}),
        }],
      },
    }));
    const actor = records(payload.processActors)[0];
    if (!actor) throw invalid();
    return {
      processId: requireUuid(payload.id),
      entityId: requireUuid(actor.entityId),
      processActorId: requireInt(actor.id),
      status: requireInt(payload.status),
    };
  },

  /** GET /processes/{processId}/entities/{entityId}/magic-link. `hideHeader` suits an embedded journey. */
  async getMagicLink(processId: string, entityId: string, options: { hideHeader?: boolean } = {}): Promise<string> {
    const payload = await request(
      "GET",
      `/processes/${uuidSegment(processId)}/entities/${uuidSegment(entityId)}/magic-link`,
      { expect: "json", ...(options.hideHeader ? { query: { hideHeader: "true" } } : {}) },
    );
    if (typeof payload !== "string" || !isTrustedJourneyUrl(payload)) {
      throw new CredasError("Credas returned an invalid journey link.", 502);
    }
    return payload;
  },

  /** GET /processes/{processId} */
  async getProcess(processId: string): Promise<{ id: string; status: number }> {
    const payload = requireRecord(await request(
      "GET",
      `/processes/${uuidSegment(processId)}`,
      { expect: "json" },
    ));
    const id = requireUuid(payload.id);
    if (id !== processId.toLowerCase()) throw invalid();
    return { id, status: requireInt(payload.status) };
  },

  /** GET /processes/{processId}/details. Raw task and form data; contains personal data. */
  async getProcessDetails(processId: string): Promise<Record<string, unknown>> {
    return requireRecord(await request(
      "GET",
      `/processes/${uuidSegment(processId)}/details`,
      { expect: "json", timeoutMs: CHECK_TIMEOUT_MS },
    ));
  },

  /** GET /entities/{entityId}/summary */
  async getEntitySummary(entityId: string): Promise<CredasEntitySummary> {
    const payload = requireRecord(await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/summary`,
      { expect: "json" },
    ));
    const processId = (value: unknown) =>
      typeof value === "string" && UUID_PATTERN.test(value) ? value.toLowerCase() : null;
    return {
      identityVerifications: records(payload.identityVerifications).map((entry) => ({
        processId: processId(entry.processId),
        dateCompleted: text(entry.dateCompleted),
        overallResult: int(entry.overallResult) ?? 0,
        livenessResult: int(entry.livenessResult) ?? 0,
        documentResult: int(entry.documentResult) ?? 0,
        faceMatchResult: int(entry.faceMatchResult) ?? 0,
        nameMatchResult: int(entry.nameMatchResult) ?? 0,
        documentType: int(entry.documentType),
      })),
      bankAccountChecks: records(payload.bankAccountChecks).flatMap((entry) => {
        const dataCheckId = int(entry.dataCheckId);
        return dataCheckId ? [{ dataCheckId, overallResult: int(entry.overallResult) ?? 0 }] : [];
      }),
      proofOfOwnershipChecks: records(payload.proofOfOwnershipChecks).flatMap((entry) => {
        const dataCheckId = int(entry.dataCheckId);
        return dataCheckId ? [{ dataCheckId, overallResult: int(entry.overallResult) ?? 0 }] : [];
      }),
      rightToRentChecks: records(payload.rightToRentChecks).flatMap((entry) => {
        const rightToRentCheckId = int(entry.rightToRentCheckId);
        return rightToRentCheckId
          ? [{
              processId: processId(entry.processId),
              rightToRentCheckId,
              overallResult: int(entry.overallResult) ?? 0,
              shareCode: entry.shareCode === true,
            }]
          : [];
      }),
    };
  },

  /** GET /entities/{entityId}/active-checks */
  async getActiveChecks(entityId: string): Promise<CredasActiveCheck[]> {
    const payload = await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/active-checks`,
      { expect: "json" },
    );
    return records(payload).flatMap((entry) => {
      const type = int(entry.type);
      const status = int(entry.status);
      return type !== null && status !== null
        ? [{ type, status, dataCheckId: int(entry.dataCheckId), rtxCheckId: int(entry.rtxCheckId) }]
        : [];
    });
  },

  /** GET /processes/{processId}/pdf-export */
  async getProcessPdf(processId: string): Promise<Buffer> {
    return await request(
      "GET",
      `/processes/${uuidSegment(processId)}/pdf-export`,
      { expect: "pdf", timeoutMs: CHECK_TIMEOUT_MS },
    ) as Buffer;
  },

  /** POST /processes/{processId}/pdf-export */
  async exportProcessPdf(processId: string, sections: CredasPdfSections): Promise<Buffer> {
    return await request(
      "POST",
      `/processes/${uuidSegment(processId)}/pdf-export`,
      { expect: "pdf", body: sections, timeoutMs: CHECK_TIMEOUT_MS },
    ) as Buffer;
  },

  /** GET /entities/{entityId}/data-checks/rtr/{rtrCheckId} */
  async getRightToRentCheck(entityId: string, rtrCheckId: number): Promise<CredasRightToRentCheck> {
    const payload = requireRecord(await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/rtr/${intSegment(rtrCheckId)}`,
      { expect: "json" },
    ));
    return {
      id: requireInt(payload.id),
      status: requireInt(payload.status),
      dateCreated: text(payload.dateCreated),
      history: records(payload.history).map((entry) => ({
        dateCreated: text(entry.dateCreated),
        previousStatus: int(entry.previousStatus),
        newStatus: int(entry.newStatus),
      })),
    };
  },

  /** GET /entities/{entityId}/data-checks/rtr/{rtrCheckId}/settled-status-pdf */
  async getSettledStatusPdf(entityId: string, rtrCheckId: number): Promise<Buffer> {
    return await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/data-checks/rtr/${intSegment(rtrCheckId)}/settled-status-pdf`,
      { expect: "pdf", timeoutMs: CHECK_TIMEOUT_MS },
    ) as Buffer;
  },

  /** GET /entities/{entityId}/share-codes. The codes themselves are deliberately not returned. */
  async getShareCodes(entityId: string): Promise<CredasShareCode[]> {
    const payload = await request(
      "GET",
      `/entities/${uuidSegment(entityId)}/share-codes`,
      { expect: "json" },
    );
    return records(payload).map((entry) => ({
      valid: entry.valid === true,
      faceMatch: entry.faceMatch === true,
      nameMatch: entry.nameMatch === true,
      hasCertificate: entry.hasCertificate === true,
    }));
  },

  /** PUT /entities/{entityId}/data-checks/rtr/{rtrCheckId} */
  async setRightToRentOutcome(
    entityId: string,
    rtrCheckId: number,
    status: 4 | 5 | 6,
    comments: string,
  ): Promise<void> {
    await request(
      "PUT",
      `/entities/${uuidSegment(entityId)}/data-checks/rtr/${intSegment(rtrCheckId)}`,
      { expect: "none", body: { status, comments } },
    );
  },

  /** PUT /entities/{entityId}/resend-invite */
  async resendInvite(entityId: string): Promise<void> {
    await request("PUT", `/entities/${uuidSegment(entityId)}/resend-invite`, { expect: "none", body: inviteBody });
  },

  /** PUT /entities/{entityId}/new-invite */
  async newInvite(entityId: string): Promise<void> {
    await request("PUT", `/entities/${uuidSegment(entityId)}/new-invite`, { expect: "none", body: inviteBody });
  },

  /** PUT /entities/{entityId}/expire-invite */
  async expireInvite(entityId: string): Promise<void> {
    await request("PUT", `/entities/${uuidSegment(entityId)}/expire-invite`, { expect: "none" });
  },

  /** PUT /processes/{processId}/reinvite-idv. `processActorId` is the actor returned by POST /processes. */
  async reinviteIdv(processId: string, processActorId: number, entityId: string): Promise<void> {
    await request("PUT", `/processes/${uuidSegment(processId)}/reinvite-idv`, {
      expect: "none",
      body: {
        actors: [{
          actorId: processActorId,
          entityId: uuidSegment(entityId),
          saveContactDetails: false,
          contactType: 1,
          resubmitIdvDocumentSection: 1,
        }],
      },
    });
  },

  /** DELETE /processes/{processId} */
  async deleteProcess(processId: string): Promise<void> {
    await request("DELETE", `/processes/${uuidSegment(processId)}`, { expect: "none" });
  },

  /** DELETE /entities/{entityId}/hard-delete. Permanent; Credas matches the email against the record. */
  async hardDeleteEntity(entityId: string, emailAddress?: string): Promise<void> {
    await request("DELETE", `/entities/${uuidSegment(entityId)}/hard-delete`, {
      expect: "none",
      ...(emailAddress ? { query: { emailAddress } } : {}),
    });
  },
};
