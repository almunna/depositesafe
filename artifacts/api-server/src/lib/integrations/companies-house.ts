const API_ORIGIN = "https://api.company-information.service.gov.uk";
const REQUEST_TIMEOUT_MS = 8_000;

export interface CompaniesHouseSearchItem {
  companyNumber: string;
  name: string;
  status: string;
  dateOfCreation: string | null;
  addressSnippet: string | null;
}

export interface CompaniesHouseSearchResponse {
  items: CompaniesHouseSearchItem[];
  totalResults: number;
  truncated?: boolean;
}

export interface CompaniesHouseProfile {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string | null;
  dateOfCreation: string | null;
  dateOfCessation: string | null;
  registeredOfficeAddress: string | null;
  sicCodes: string[];
  nextAccountsDue: string | null;
  nextConfirmationStatementDue: string | null;
  sourceUrl: string;
}

export class CompaniesHouseError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "CompaniesHouseError";
  }
}

export function normalizeCompanyNumber(input: string): string {
  const compact = input.trim().replace(/\s+/g, "").toUpperCase();
  if (/^[0-9]{1,8}$/.test(compact)) return compact.padStart(8, "0");
  if (/^(?:[A-Z][0-9]{7}|[A-Z]{2}[0-9]{6})$/.test(compact)) return compact;
  throw new CompaniesHouseError("Enter a valid UK company number.", 400);
}

function apiKey(): string {
  const key = process.env.COMPANIES_HOUSE_API_KEY?.trim();
  if (!key) {
    throw new CompaniesHouseError("Companies House is not configured.", 503);
  }
  return key;
}

function headers(key: string): Record<string, string> {
  return {
    authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
    accept: "application/json",
  };
}

function retryAfter(response: Response): string | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  if (/^[0-9]{1,6}$/.test(value)) return value;
  return Number.isFinite(Date.parse(value)) ? value : undefined;
}

async function getJson(path: string): Promise<unknown> {
  const key = apiKey();
  let response: Response;
  try {
    response = await fetch(`${API_ORIGIN}${path}`, {
      method: "GET",
      headers: headers(key),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new CompaniesHouseError("Companies House request timed out.", 504);
    }
    throw new CompaniesHouseError("Companies House could not be reached.", 502);
  }

  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new CompaniesHouseError("Companies House credentials could not be verified.", 503);
  }
  if (response.status === 429) {
    throw new CompaniesHouseError(
      "Companies House is temporarily rate limiting requests.",
      429,
      retryAfter(response),
    );
  }
  if (response.status === 503) {
    throw new CompaniesHouseError(
      "Companies House is temporarily unavailable.",
      503,
      retryAfter(response),
    );
  }
  if (!response.ok) {
    throw new CompaniesHouseError(
      response.status >= 500
        ? "Companies House is temporarily unavailable."
        : "Companies House rejected the request.",
      response.status >= 500 ? 503 : 502,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new CompaniesHouseError("Companies House returned an invalid response.", 502);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapSearchItem(value: unknown): CompaniesHouseSearchItem | undefined {
  if (!isRecord(value)) return undefined;
  const companyNumber = requiredString(value.company_number);
  const name = requiredString(value.title);
  const status = requiredString(value.company_status);
  if (!companyNumber || !name || !status) return undefined;
  return {
    companyNumber,
    name,
    status,
    dateOfCreation: optionalString(value.date_of_creation),
    addressSnippet: optionalString(value.address_snippet),
  };
}

function addressString(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const keys = [
    "premises",
    "address_line_1",
    "address_line_2",
    "locality",
    "region",
    "postal_code",
    "country",
  ];
  const lines = keys
    .map((key) => optionalString(value[key]))
    .filter((part): part is string => Boolean(part));
  return lines.length ? [...new Set(lines)].join(", ") : null;
}

function mapProfile(value: unknown): CompaniesHouseProfile {
  if (!isRecord(value)) {
    throw new CompaniesHouseError("Companies House returned an invalid company record.", 502);
  }
  const companyNumber = requiredString(value.company_number);
  const companyName = requiredString(value.company_name);
  const companyStatus = requiredString(value.company_status);
  if (!companyNumber || !companyName || !companyStatus) {
    throw new CompaniesHouseError("Companies House returned an invalid company record.", 502);
  }
  const accounts = isRecord(value.accounts) ? value.accounts : {};
  const nextAccounts = isRecord(accounts.next_accounts)
    ? optionalString(accounts.next_accounts.due_on)
    : null;
  const confirmation = isRecord(value.confirmation_statement)
    ? value.confirmation_statement
    : {};
  return {
    companyNumber,
    companyName,
    companyStatus,
    companyType: optionalString(value.type),
    dateOfCreation: optionalString(value.date_of_creation),
    dateOfCessation: optionalString(value.date_of_cessation),
    registeredOfficeAddress: addressString(value.registered_office_address),
    sicCodes: Array.isArray(value.sic_codes)
      ? value.sic_codes.filter((code): code is string => typeof code === "string")
      : [],
    nextAccountsDue: nextAccounts ?? optionalString(accounts.next_due),
    nextConfirmationStatementDue: optionalString(confirmation.next_due),
    sourceUrl: `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}`,
  };
}

function safePathSegment(value: string): string {
  return encodeURIComponent(value);
}

export const companiesHouseIntegration = {
  provider: "Companies House",
  get configured(): boolean {
    return Boolean(process.env.COMPANIES_HOUSE_API_KEY?.trim());
  },

  async search(query: string): Promise<CompaniesHouseSearchResponse> {
    const normalized = query.trim();
    if (normalized.length < 2 || normalized.length > 120) {
      throw new CompaniesHouseError("Enter a company name or number to search.", 400);
    }

    // A number search uses the canonical profile endpoint, avoiding ambiguous
    // search ranking and allowing the caller to select this exact company.
    if (
      /^[0-9]{1,8}$/.test(normalized) ||
      /^(?:[A-Z][0-9]{7}|[A-Z]{2}[0-9]{6})$/i.test(normalized)
    ) {
      const profile = await this.getProfile(normalizeCompanyNumber(normalized));
      if (!profile) return { items: [], totalResults: 0 };
      return {
        totalResults: 1,
        truncated: false,
        items: [{
          companyNumber: profile.companyNumber,
          name: profile.companyName,
          status: profile.companyStatus,
          dateOfCreation: profile.dateOfCreation,
          addressSnippet: profile.registeredOfficeAddress,
        }],
      };
    }

    const params = new URLSearchParams({ q: normalized, items_per_page: "20" });
    const payload = await getJson(`/search/companies?${params.toString()}`);
    if (payload === null) return { items: [], totalResults: 0 };
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new CompaniesHouseError("Companies House returned an invalid search response.", 502);
    }
    const items = payload.items.map(mapSearchItem);
    if (items.some((item) => !item)) {
      throw new CompaniesHouseError("Companies House returned an invalid search response.", 502);
    }
    const rawTotal = payload.total_results;
    const mappedItems = (items as CompaniesHouseSearchItem[]).slice(0, 20);
    const totalResults = typeof rawTotal === "number" && Number.isFinite(rawTotal)
      ? Math.floor(Math.max(0, rawTotal))
      : (items as CompaniesHouseSearchItem[]).length;
    return {
      items: mappedItems,
      totalResults,
      truncated: totalResults > mappedItems.length,
    };
  },

  async getProfile(companyNumber: string): Promise<CompaniesHouseProfile | null> {
    const payload = await getJson(`/company/${safePathSegment(companyNumber)}`);
    return payload === null ? null : mapProfile(payload);
  },
};