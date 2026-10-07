import assert from "node:assert/strict";
import test from "node:test";
import {
  CredasError,
  credasEnvironment,
  credasIntegration,
  credasJourney,
  isTrustedJourneyUrl,
} from "./credas";

const ENTITY = "895bcd5d-1758-4402-a52a-cac436cbdb86";
const PROCESS = "b7c9ef43-4d75-4fa1-a7bd-2baae48dd77e";

type Call = { url: string; init: RequestInit };

async function withCredas(
  responder: (call: Call) => Response | Promise<Response>,
  run: (calls: Call[]) => Promise<void>,
): Promise<void> {
  const saved = { key: process.env.CREDAS_API_KEY, environment: process.env.CREDAS_ENVIRONMENT, fetch: globalThis.fetch };
  const calls: Call[] = [];
  process.env.CREDAS_API_KEY = "test-api-key";
  process.env.CREDAS_ENVIRONMENT = "sandbox";
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init: RequestInit = {}) => {
    const call = { url: String(input), init };
    calls.push(call);
    return responder(call);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [["CREDAS_API_KEY", saved.key], ["CREDAS_ENVIRONMENT", saved.environment]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("the environment selects one of two fixed Credas hosts", () => {
  assert.equal(credasEnvironment({}), "sandbox");
  assert.equal(credasEnvironment({ NODE_ENV: "production" }), "production");
  assert.equal(credasEnvironment({ NODE_ENV: "production", CREDAS_ENVIRONMENT: "sandbox" }), "sandbox");
  assert.throws(() => credasEnvironment({ CREDAS_ENVIRONMENT: "https://evil.example" }), CredasError);
});

test("sandbox journeys default to the public IDs; production must be configured", () => {
  assert.deepEqual(credasJourney("identity", {}), { journeyId: "fae35444-2710-43db-98a0-23fbfeef6f8b", actorId: 42 });
  assert.deepEqual(credasJourney("right_to_rent", {}), { journeyId: "60b818e9-9ada-4bf3-a43c-793ee4c8fc6c", actorId: 18 });
  assert.throws(() => credasJourney("identity", { NODE_ENV: "production" }), CredasError);
  assert.deepEqual(
    credasJourney("identity", { NODE_ENV: "production", CREDAS_IDENTITY_JOURNEY_ID: "11111111-2222-4333-8444-555555555555", CREDAS_IDENTITY_ACTOR_ID: "7" }),
    { journeyId: "11111111-2222-4333-8444-555555555555", actorId: 7 },
  );
  assert.throws(() => credasJourney("identity", { CREDAS_IDENTITY_JOURNEY_ID: "not-a-uuid", CREDAS_IDENTITY_ACTOR_ID: "7" }), CredasError);
});

test("journey links are accepted only over HTTPS on the Credas domain", () => {
  const env = { CREDAS_ENVIRONMENT: "sandbox" };
  assert.ok(isTrustedJourneyUrl("https://myconnect.credasdemo.com/landing?registrationCode=ABC", env));
  for (const bad of [
    "http://myconnect.credasdemo.com/landing",
    "https://credasdemo.com.evil.example/landing",
    "https://evilcredasdemo.com/landing",
    "https://user:pw@myconnect.credasdemo.com/landing",
    "https://myconnect.credas.com/landing",
    "javascript:alert(1)",
    "not a url",
  ]) {
    assert.equal(isTrustedJourneyUrl(bad, env), false, bad);
  }
});

test("requests carry the API key, never follow redirects and hit the sandbox host", async () => {
  await withCredas(
    () => json({ id: ENTITY }),
    async (calls) => {
      assert.equal(await credasIntegration.createEntity({ firstName: "Ruth", surname: "Goodwin", reference: "DS-1:bank" }), ENTITY);
      const [{ url, init }] = calls;
      assert.equal(url, "https://portal.credasdemo.com/api/v2/ci/entities");
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "error");
      assert.equal((init.headers as Record<string, string>)["x-api-key"], "test-api-key");
      assert.deepEqual(JSON.parse(String(init.body)), { firstName: "Ruth", surname: "Goodwin", reference: "DS-1:bank" });
    },
  );
});

test("identifiers are validated before they reach a request path", async () => {
  await withCredas(
    () => json({}),
    async (calls) => {
      await assert.rejects(() => credasIntegration.getEntitySummary("../../admin"), CredasError);
      await assert.rejects(() => credasIntegration.getBankAccountCheck(ENTITY, -1), CredasError);
      await assert.rejects(() => credasIntegration.getLandRegistryFile(ENTITY, 5, "x/../y"), CredasError);
      assert.equal(calls.length, 0);
    },
  );
});

test("the bank account check is posted to the documented path and mapped", async () => {
  await withCredas(
    () => json({
      id: 50417,
      entityId: ENTITY,
      result: 2,
      resultText: "REFER",
      dataSources: [{ name: "UK Bank Account Validation", remarks: [{ type: 1, description: "Sort code found on EISCD data file" }, { type: 9 }] }],
      input: { firstName: "Ruth", surname: "Goodwin", sortcode: "560036", accountNumber: "44444443" },
    }),
    async (calls) => {
      const check = await credasIntegration.runBankAccountCheck(ENTITY, {
        firstName: "Ruth", surname: "Goodwin", addressLine1: "387 High Street", city: "Westbury",
        postcode: "BA13 3BN", country: "United Kingdom", sortcode: "560036", accountNumber: "44444443",
      });
      assert.equal(calls[0].url, `https://portal.credasdemo.com/api/v2/ci/entities/${ENTITY}/data-checks/bank-account`);
      assert.equal(check.id, 50417);
      assert.equal(check.result, 2);
      assert.deepEqual(check.remarks, [{ source: "UK Bank Account Validation", type: 1, description: "Sort code found on EISCD data file" }]);
    },
  );
});

test("a process is created with an email invite and never an SMS or in-person contact", async () => {
  await withCredas(
    () => json({ id: PROCESS, status: 0, processActors: [{ id: 101110, entityId: ENTITY }] }),
    async (calls) => {
      const process = await credasIntegration.createProcess({
        journeyId: "fae35444-2710-43db-98a0-23fbfeef6f8b", actorId: 42, title: "DepositSafe check DS-1",
        webhookUrl: "https://safe.example/api/webhooks/credas?t=token", reference: "DS-1:1",
        firstName: "John", surname: "Smith", emailAddress: "john@example.com", sendEmailInvite: true, clientAliasName: "DepositSafe",
        clientAliasLogoBase64: "aGVsbG8=",
      });
      assert.deepEqual(process, { processId: PROCESS, entityId: ENTITY, processActorId: 101110, status: 0 });
      const body = JSON.parse(String(calls[0].init.body));
      assert.equal(calls[0].url, "https://portal.credasdemo.com/api/v2/ci/processes");
      assert.equal(body.webhookUrl, "https://safe.example/api/webhooks/credas?t=token");
      assert.deepEqual(body.processEntities, [{
        firstName: "John", surname: "Smith", emailAddress: "john@example.com", reference: "DS-1:1", actorId: 42,
        contactViaEmail: true, contactViaSms: false, inPerson: false, clientAliasName: "DepositSafe",
        clientAliasLogoBase64: "aGVsbG8=",
      }]);
    },
  );
});

test("a journey link pointing anywhere but Credas is refused", async () => {
  await withCredas(
    () => json("https://phish.example/landing?registrationCode=ABC"),
    async () => {
      await assert.rejects(() => credasIntegration.getMagicLink(PROCESS, ENTITY), /invalid journey link/);
    },
  );
  await withCredas(
    () => json("https://myconnect.credasdemo.com/landing?registrationCode=ABC"),
    async (calls) => {
      assert.match(await credasIntegration.getMagicLink(PROCESS, ENTITY), /^https:\/\/myconnect\.credasdemo\.com\//);
      assert.equal(calls[0].url, `https://portal.credasdemo.com/api/v2/ci/processes/${PROCESS}/entities/${ENTITY}/magic-link`);
      await credasIntegration.getMagicLink(PROCESS, ENTITY, { hideHeader: true });
      assert.equal(calls[1].url, `https://portal.credasdemo.com/api/v2/ci/processes/${PROCESS}/entities/${ENTITY}/magic-link?hideHeader=true`);
    },
  );
});

test("a process status is accepted only for the process that was asked about", async () => {
  await withCredas(
    () => json({ id: "00000000-0000-4000-8000-000000000000", status: 2 }),
    async () => {
      await assert.rejects(() => credasIntegration.getProcess(PROCESS), CredasError);
    },
  );
  await withCredas(
    () => json({ id: PROCESS.toUpperCase(), status: 2 }),
    async () => {
      assert.deepEqual(await credasIntegration.getProcess(PROCESS), { id: PROCESS, status: 2 });
    },
  );
});

test("documents must be real PDFs", async () => {
  await withCredas(
    () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }),
    async () => {
      await assert.rejects(() => credasIntegration.getProcessPdf(PROCESS), /invalid document/);
    },
  );
  await withCredas(
    () => new Response("%PDF-1.4 body", { status: 200, headers: { "content-type": "application/pdf" } }),
    async (calls) => {
      const pdf = await credasIntegration.getBankAccountPdf(ENTITY, 50417);
      assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
      assert.equal(calls[0].url, `https://portal.credasdemo.com/api/v2/ci/entities/${ENTITY}/data-checks/50417/bank-account/pdf`);
    },
  );
});

test("share codes come back as flags only", async () => {
  await withCredas(
    () => json([{ id: "x", shareCode: "W12-345-ABC", dateOfBirth: "1990-01-01", valid: true, faceMatch: true, nameMatch: false, hasCertificate: true }]),
    async () => {
      const codes = await credasIntegration.getShareCodes(ENTITY);
      assert.deepEqual(codes, [{ valid: true, faceMatch: true, nameMatch: false, hasCertificate: true }]);
      assert.ok(!JSON.stringify(codes).includes("W12-345-ABC"));
    },
  );
});

test("provider failures become safe errors that never echo the provider's response", async () => {
  const cases: [number, number, boolean][] = [[401, 503, false], [404, 404, false], [400, 422, false], [429, 429, false], [500, 503, true]];
  for (const [upstream, expected, indeterminate] of cases) {
    await withCredas(
      () => json({ title: "secret upstream detail", traceId: "abc" }, upstream),
      async () => {
        await assert.rejects(
          () => credasIntegration.runBankAccountCheck(ENTITY, {
            firstName: "A", surname: "B", addressLine1: "1", city: "C", postcode: "M1 1AE",
            country: "United Kingdom", sortcode: "560036", accountNumber: "44444443",
          }),
          (error: unknown) => {
            assert.ok(error instanceof CredasError);
            assert.equal(error.statusCode, expected);
            assert.equal(error.indeterminate, indeterminate);
            assert.ok(!error.message.includes("secret"));
            return true;
          },
        );
      },
    );
  }
});

test("a missing API key stops every call before any request is made", async () => {
  await withCredas(
    () => json({}),
    async (calls) => {
      delete process.env.CREDAS_API_KEY;
      await assert.rejects(() => credasIntegration.listJourneys(), /not configured/);
      assert.equal(calls.length, 0);
    },
  );
});

test("invite, re-invite and erase calls use the documented methods and paths", async () => {
  await withCredas(
    () => new Response(null, { status: 200 }),
    async (calls) => {
      await credasIntegration.resendInvite(ENTITY);
      await credasIntegration.newInvite(ENTITY);
      await credasIntegration.expireInvite(ENTITY);
      await credasIntegration.reinviteIdv(PROCESS, 101110, ENTITY);
      await credasIntegration.setRightToRentOutcome(ENTITY, 77, 4, "Reviewed original documents");
      await credasIntegration.retrieveTitleDeeds(ENTITY, 50425, ["TX123456"]);
      await credasIntegration.deleteProcess(PROCESS);
      await credasIntegration.hardDeleteEntity(ENTITY, "john@example.com");
      const base = "https://portal.credasdemo.com/api/v2/ci";
      assert.deepEqual(calls.map((call) => `${call.init.method} ${call.url.replace(base, "")}`), [
        `PUT /entities/${ENTITY}/resend-invite`,
        `PUT /entities/${ENTITY}/new-invite`,
        `PUT /entities/${ENTITY}/expire-invite`,
        `PUT /processes/${PROCESS}/reinvite-idv`,
        `PUT /entities/${ENTITY}/data-checks/rtr/77`,
        `PUT /entities/${ENTITY}/data-checks/50425/land-registry/retrieve-title-deeds`,
        `DELETE /processes/${PROCESS}`,
        `DELETE /entities/${ENTITY}/hard-delete?emailAddress=john%40example.com`,
      ]);
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { contactByEmail: true, contactBySms: false });
      assert.deepEqual(JSON.parse(String(calls[3].init.body)).actors[0], {
        actorId: 101110, entityId: ENTITY, saveContactDetails: false, contactType: 1, resubmitIdvDocumentSection: 1,
      });
      assert.deepEqual(JSON.parse(String(calls[4].init.body)), { status: 4, comments: "Reviewed original documents" });
      assert.deepEqual(JSON.parse(String(calls[5].init.body)), { titleNumbers: ["TX123456"] });
    },
  );
});
