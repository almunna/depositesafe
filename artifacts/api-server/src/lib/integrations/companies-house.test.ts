import assert from "node:assert/strict";
import test from "node:test";
import {
  CompaniesHouseError,
  companiesHouseIntegration,
  normalizeCompanyNumber,
} from "./companies-house";

async function withCompaniesHouseApi(
  responder: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  const oldKey = process.env.COMPANIES_HOUSE_API_KEY;
  const oldFetch = globalThis.fetch;
  process.env.COMPANIES_HOUSE_API_KEY = "test-api-key";
  globalThis.fetch = responder;
  try {
    await run();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.COMPANIES_HOUSE_API_KEY;
    else process.env.COMPANIES_HOUSE_API_KEY = oldKey;
  }
}

function jsonResponse(value: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(value), { status, headers });
}

test("company number normalization pads numeric numbers and accepts UK letter prefixes", () => {
  assert.equal(normalizeCompanyNumber("123456"), "00123456");
  assert.equal(normalizeCompanyNumber(" sc123456 "), "SC123456");
  assert.equal(normalizeCompanyNumber("R0000000"), "R0000000");
  assert.throws(() => normalizeCompanyNumber("BARCLAYS"), CompaniesHouseError);
  assert.throws(() => normalizeCompanyNumber("BARCLAY1"), CompaniesHouseError);
  assert.throws(() => normalizeCompanyNumber("SC12345"), CompaniesHouseError);
  assert.throws(() => normalizeCompanyNumber("123456789"), CompaniesHouseError);
});

test("an eight-character company name is sent through name search, not treated as a number", async () => {
  await withCompaniesHouseApi(
    async (input) => {
      assert.match(String(input), /\/search\/companies\?/);
      assert.match(String(input), /q=BARCLAYS/);
      return jsonResponse({
        total_results: 1,
        items: [{
          company_number: "00048839",
          title: "BARCLAYS PLC",
          company_status: "active",
        }],
      });
    },
    async () => {
      const result = await companiesHouseIntegration.search("BARCLAYS");
      assert.equal(result.items[0]?.name, "BARCLAYS PLC");
    },
  );
});

test("search limits result items while retaining total count and canonical fields", async () => {
  await withCompaniesHouseApi(
    async (input, init) => {
      assert.match(String(input), /items_per_page=20/);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        `Basic ${Buffer.from("test-api-key:").toString("base64")}`,
      );
      return jsonResponse({
        total_results: 25,
        items: Array.from({ length: 24 }, (_, index) => ({
          company_number: String(index + 1).padStart(8, "0"),
          title: `Example Company ${index + 1}`,
          company_status: "active",
          date_of_creation: "2020-01-01",
          address_snippet: "London",
        })),
      });
    },
    async () => {
      const result = await companiesHouseIntegration.search("Example Company");
      assert.equal(result.items.length, 20);
      assert.equal(result.totalResults, 25);
      assert.equal(result.truncated, true);
    },
  );
});

test("numeric search looks up the exact profile and 404 produces empty results", async () => {
  await withCompaniesHouseApi(
    async () => new Response(null, { status: 404 }),
    async () => {
      const result = await companiesHouseIntegration.search("123456");
      assert.deepEqual(result, { items: [], totalResults: 0 });
    },
  );
});

test("profile mapping exposes only approved public profile fields", async () => {
  await withCompaniesHouseApi(
    async () => jsonResponse({
      company_number: "00445790",
      company_name: "TESCO PLC",
      company_status: "active",
      type: "ltd",
      date_of_creation: "1947-11-27",
      registered_office_address: {
        address_line_1: "Tesco House",
        locality: "Welwyn Garden City",
        postal_code: "AL7 1GA",
      },
      sic_codes: ["62020"],
      accounts: {
        next_accounts: { due_on: "2025-02-28" },
        next_due: "2026-02-28",
      },
      confirmation_statement: { next_due: "2026-01-01" },
      officers: [{ name: "Not to be returned" }],
      persons_with_significant_control: [{ name: "Not to be returned" }],
    }),
    async () => {
      const profile = await companiesHouseIntegration.getProfile("00445790");
      assert.ok(profile);
      assert.equal(profile.companyName, "TESCO PLC");
      assert.equal(profile.registeredOfficeAddress, "Tesco House, Welwyn Garden City, AL7 1GA");
      assert.deepEqual(profile.sicCodes, ["62020"]);
      assert.equal(profile.nextAccountsDue, "2025-02-28");
      assert.equal("officers" in profile, false);
      assert.equal("persons_with_significant_control" in profile, false);
    },
  );
});

test("accounts.next_due string is the compatibility fallback", async () => {
  await withCompaniesHouseApi(
    async () => jsonResponse({
      company_number: "12345678",
      company_name: "Fixture Company",
      company_status: "active",
      accounts: { next_due: "2027-03-31" },
    }),
    async () => {
      const profile = await companiesHouseIntegration.getProfile("12345678");
      assert.equal(profile?.nextAccountsDue, "2027-03-31");
    },
  );
});

test("unauthorized credentials, rate limits, and malformed payloads yield safe errors", async () => {
  const oldKey = process.env.COMPANIES_HOUSE_API_KEY;
  delete process.env.COMPANIES_HOUSE_API_KEY;
  try {
    await assert.rejects(
      companiesHouseIntegration.search("Example Company"),
      (error: unknown) =>
        error instanceof CompaniesHouseError &&
        error.statusCode === 503 &&
        error.message === "Companies House is not configured.",
    );
  } finally {
    if (oldKey !== undefined) process.env.COMPANIES_HOUSE_API_KEY = oldKey;
  }
  await withCompaniesHouseApi(
    async () => jsonResponse({ error: "sensitive upstream response" }, 401),
    async () => {
      await assert.rejects(
        companiesHouseIntegration.search("Example Company"),
        (error: unknown) =>
          error instanceof CompaniesHouseError &&
          error.statusCode === 503 &&
          !error.message.includes("sensitive upstream response"),
      );
    },
  );
  await withCompaniesHouseApi(
    async () => jsonResponse({}, 429, { "Retry-After": "30" }),
    async () => {
      await assert.rejects(
        companiesHouseIntegration.search("Example Company"),
        (error: unknown) =>
          error instanceof CompaniesHouseError &&
          error.statusCode === 429 &&
          error.retryAfter === "30",
      );
    },
  );
  await withCompaniesHouseApi(
    async () => jsonResponse({}, 503, { "Retry-After": "60" }),
    async () => {
      await assert.rejects(
        companiesHouseIntegration.search("Example Company"),
        (error: unknown) =>
          error instanceof CompaniesHouseError &&
          error.statusCode === 503 &&
          error.retryAfter === "60",
      );
    },
  );
  await withCompaniesHouseApi(
    async () => {
      throw new TypeError("private transport detail");
    },
    async () => {
      await assert.rejects(
        companiesHouseIntegration.search("Example Company"),
        (error: unknown) =>
          error instanceof CompaniesHouseError &&
          error.statusCode === 502 &&
          !error.message.includes("private transport detail"),
      );
    },
  );
  await withCompaniesHouseApi(
    async () => jsonResponse({ items: [{ title: "Incomplete company" }] }),
    async () => {
      await assert.rejects(
        companiesHouseIntegration.search("Example Company"),
        (error: unknown) =>
          error instanceof CompaniesHouseError && error.statusCode === 502,
      );
    },
  );
});