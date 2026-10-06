import assert from "node:assert/strict";
import test from "node:test";
import {
  CredasInputError,
  bankAccountResult,
  credasPublicOrigin,
  credasWebhookUrl,
  deriveTransactionStatus,
  hashWebhookToken,
  newWebhookToken,
  normalizeDateOfBirth,
  normalizePostcode,
  parseCredasWebhook,
  processState,
  propertyResult,
  validateBankAccountInput,
  validateParticipants,
  validatePropertyInput,
  verificationOutcome,
} from "./credas-rules";

const bank = {
  firstName: " Ruth ",
  surname: "Goodwin",
  addressLine1: "387 High Street",
  city: "Westbury",
  postcode: "ba133bn",
  sortCode: "56-00-36",
  accountNumber: "4444 4443",
};

test("bank details are normalised and the country is never taken from the caller", () => {
  const input = validateBankAccountInput({ ...bank, country: "Elsewhere", dateOfBirth: "1976-12-01" });
  assert.deepEqual(input, {
    firstName: "Ruth",
    surname: "Goodwin",
    dateOfBirth: "1976-12-01T00:00:00Z",
    addressLine1: "387 High Street",
    city: "Westbury",
    postcode: "BA13 3BN",
    country: "United Kingdom",
    sortcode: "560036",
    accountNumber: "44444443",
  });
});

test("malformed bank details are rejected before anything is sent to Credas", () => {
  for (const override of [
    { sortCode: "12345" },
    { sortCode: "12345a" },
    { accountNumber: "1234567" },
    { accountNumber: "123456789" },
    { postcode: "NOT A POSTCODE" },
    { firstName: "<script>" },
    { firstName: "" },
    { surname: "x".repeat(101) },
    { addressLine1: "1 High St\"; DROP" },
    { dateOfBirth: "2999-01-01" },
    { dateOfBirth: "1976-02-30" },
    { dateOfBirth: "01/12/1976" },
  ]) {
    assert.throws(() => validateBankAccountInput({ ...bank, ...override }), CredasInputError, JSON.stringify(override));
  }
});

test("postcodes and dates of birth normalise to the provider format", () => {
  assert.equal(normalizePostcode(" tx80  9za "), "TX80 9ZA");
  assert.equal(normalizePostcode("M11AE"), "M1 1AE");
  assert.equal(normalizeDateOfBirth(""), undefined);
  assert.equal(normalizeDateOfBirth("1990-07-04"), "1990-07-04T00:00:00Z");
});

test("property details require an owner name and a UK address", () => {
  assert.deepEqual(
    validatePropertyInput({ firstName: "John", surname: "Smith", addressLine1: "1 Test Street", city: "Testville", postcode: "tx809za" }),
    { firstName: "John", surname: "Smith", addressLine1: "1 Test Street", city: "Testville", postcode: "TX80 9ZA" },
  );
  assert.throws(() => validatePropertyInput({ surname: "Smith", addressLine1: "1 Test Street", city: "Testville", postcode: "TX80 9ZA" }), CredasInputError);
});

test("participants must match the product's head count and have distinct valid emails", () => {
  const person = { firstName: "Ada", surname: "O'Neil-Smith", email: " Ada@Example.com " };
  assert.deepEqual(validateParticipants([person], 1), [{ firstName: "Ada", surname: "O'Neil-Smith", email: "ada@example.com" }]);
  assert.throws(() => validateParticipants([person], 2), CredasInputError);
  assert.throws(() => validateParticipants([person, { ...person, firstName: "Bea" }], 2), /own email/);
  assert.throws(() => validateParticipants([{ ...person, email: "not-an-email" }], 1), CredasInputError);
  assert.throws(() => validateParticipants("nope", 1), CredasInputError);
});

test("provider codes map to DepositSafe outcomes", () => {
  assert.equal(verificationOutcome(1), "pass");
  assert.equal(verificationOutcome(4), "pass");
  assert.equal(verificationOutcome(2), "fail");
  assert.equal(verificationOutcome(5), "fail");
  assert.equal(verificationOutcome(6), "refer");
  assert.equal(verificationOutcome(3), "manual_review");
  assert.equal(verificationOutcome(7), "pending");
  assert.equal(verificationOutcome(0), "pending");
  assert.equal(processState(0), "awaiting_participant");
  assert.equal(processState(1), "in_progress");
  assert.equal(processState(2), "complete");
  assert.equal(processState(4), "manual_review");
  assert.equal(processState(6), "expired");
  for (const closed of [3, 5, 7, 99]) assert.equal(processState(closed), "failed");
});

test("the stored bank result keeps only the last four account digits", () => {
  const result = bankAccountResult({
    id: 1,
    entityId: "895bcd5d-1758-4402-a52a-cac436cbdb86",
    result: 2,
    resultText: "REFER",
    dateCreated: null,
    remarks: [{ source: "UK Bank Account Validation", type: 1, description: "Sort code found\u0000 on file" }],
    input: { firstName: "Ruth", surname: "Goodwin", sortcode: "560036", accountNumber: "44444443" },
  });
  assert.equal(result.accountNumberEnding, "4443");
  assert.equal(result.sortCode, "560036");
  assert.deepEqual(result.remarks, [{ type: "match", description: "Sort code found on file" }]);
  assert.ok(!JSON.stringify(result).includes("44444443"));
});

test("property results describe each matched title", () => {
  const result = propertyResult(
    {
      id: 5,
      entityId: "d73ea295-7ae0-474c-b7b7-12a6198ff39c",
      dateCreated: null,
      isOutOfHours: false,
      overallResult: 1,
      matches: [{
        titleNumber: "TX123456", firstNameMatch: 1, middleNameMatch: 3, surnameMatch: 2, overallMatch: 1,
        isHistorical: false, ownershipType: 1, tenure: "freehold",
      }],
      titles: [{ titleNumber: "TX123456", address: "1, Test Street, Testville, TX86 9ZA", tenure: "freehold", isOutOfHours: false }],
      files: [{ fileId: "254b46e3-c8dc-42ca-930c-8d9cb569a7fa", filename: "TX123456_Register.pdf", titleNumber: "TX123456" }],
    },
    { firstName: "John", surname: "Smith", addressLine1: "1 Test Street", city: "Testville", postcode: "TX86 9ZA" },
  );
  assert.equal(result.titlesFound, 1);
  assert.deepEqual(result.matches[0], {
    titleNumber: "TX123456",
    address: "1, Test Street, Testville, TX86 9ZA",
    overallMatch: "match",
    firstNameMatch: "match",
    surnameMatch: "partial_match",
    ownership: "joint",
    tenure: "freehold",
    historical: false,
  });
  assert.deepEqual(result.files, [{ id: "254b46e3-c8dc-42ca-930c-8d9cb569a7fa", label: "Title register", titleNumber: "TX123456" }]);
});

test("transaction status follows the checks the product requires", () => {
  const check = (kind: string, state: string, outcome: string | null = null, slot = 0) => ({ kind, slot, state, outcome });
  assert.deepEqual(deriveTransactionStatus("verify", []), { status: "PAID" });
  assert.deepEqual(deriveTransactionStatus("verify", [check("identity", "awaiting_participant")]), { status: "AWAITING_PARTICIPANT" });
  assert.deepEqual(deriveTransactionStatus("verify", [check("identity", "in_progress")]), { status: "VERIFICATION_IN_PROGRESS" });
  assert.deepEqual(deriveTransactionStatus("verify", [check("identity", "completed", "pass")]), { status: "RESULT_GENERATED", outcome: "pass" });
  assert.deepEqual(deriveTransactionStatus("verify", [check("identity", "expired")]), { status: "EXPIRED" });
  assert.deepEqual(deriveTransactionStatus("right-to-rent", [check("right_to_rent", "manual_review")]), { status: "MANUAL_ATTENTION" });
  assert.deepEqual(deriveTransactionStatus("bank-account-check", [check("bank_account", "failed")]), { status: "VERIFICATION_FAILED" });

  // Verify Both is released only when both people have a result.
  assert.deepEqual(
    deriveTransactionStatus("verify-both", [check("identity", "completed", "pass", 0), check("identity", "awaiting_participant", null, 1)]),
    { status: "AWAITING_PARTICIPANT" },
  );
  assert.deepEqual(
    deriveTransactionStatus("verify-both", [check("identity", "completed", "pass", 0), check("identity", "completed", "refer", 1)]),
    { status: "RESULT_GENERATED", outcome: "refer" },
  );
  // Verify Plus needs both the identity and the bank result.
  assert.deepEqual(
    deriveTransactionStatus("verify-plus", [check("identity", "completed", "pass")]),
    { status: "VERIFICATION_IN_PROGRESS" },
  );
  assert.deepEqual(
    deriveTransactionStatus("verify-plus", [check("identity", "completed", "pass"), check("bank_account", "completed", "fail")]),
    { status: "RESULT_GENERATED", outcome: "fail" },
  );
  // A check belonging to another product never completes this one.
  assert.deepEqual(deriveTransactionStatus("verify", [check("bank_account", "completed", "pass")]), { status: "PAID" });
});

test("webhook tokens are unguessable, hashed at rest and strictly formatted", () => {
  const token = newWebhookToken();
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(token, newWebhookToken());
  const hash = hashWebhookToken(token);
  assert.match(hash ?? "", /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  for (const bad of [undefined, "", "short", `${token}x`, token.slice(1), ["a"], `${token.slice(0, 42)}!`]) {
    assert.equal(hashWebhookToken(bad), undefined);
  }
});

test("the webhook URL is built from server configuration, HTTPS only, at the API root", () => {
  assert.equal(credasPublicOrigin({ DEPOSITSAFE_PUBLIC_ORIGIN: "https://safe.example/app/" }), "https://safe.example");
  assert.equal(credasPublicOrigin({ REPLIT_DOMAINS: "app.example, www.example" }), "https://app.example");
  assert.equal(credasPublicOrigin({ DEPOSITSAFE_PUBLIC_ORIGIN: "http://safe.example" }), undefined);
  assert.equal(credasPublicOrigin({ DEPOSITSAFE_PUBLIC_ORIGIN: "https://user:pw@safe.example" }), undefined);
  assert.equal(credasPublicOrigin({}), undefined);
  assert.equal(credasWebhookUrl("https://safe.example", "abc"), "https://safe.example/api/webhooks/credas?t=abc");
});

test("only a well-formed process ID is taken from a webhook body", () => {
  assert.deepEqual(
    parseCredasWebhook({ ProcessId: "1E144E85-F45B-4AE3-8915-AE2826EA1E55", Status: 2 }),
    { processId: "1e144e85-f45b-4ae3-8915-ae2826ea1e55" },
  );
  for (const bad of [null, [], "x", {}, { ProcessId: "../../etc" }, { ProcessId: 5 }]) {
    assert.equal(parseCredasWebhook(bad), undefined);
  }
});
