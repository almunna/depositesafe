import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import { stripeMode } from "@workspace/stripe";

// Development fixtures only. No Stripe calls or charges; never a payment bypass in app code.
if (stripeMode() !== "test") throw new Error("Company Check verification refuses production.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
async function api(path: string, method = "GET", body?: unknown, capability?: string) {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { "content-type": "application/json",
      ...(capability ? { "x-guest-capability": capability } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() as Record<string, any> };
}
async function fixture(slug: string, paid = false, amount = 499) {
  const email = `company-check-development-test-${randomUUID()}@example.com`;
  const created = await api("/transactions", "POST", {
    productSlug: slug, email, participants: [{ name: "Company Check Development Tester", email }],
  });
  assert.equal(created.status, 201);
  if (paid) {
    await pool.query("UPDATE public.transactions SET status='PAID' WHERE reference=$1", [created.data.reference]);
    await pool.query(`INSERT INTO public.payments(transaction_id,provider,provider_reference,amount_pence,status)
      SELECT id,'stripe','development-company-check-test-fixture',$2,'paid' FROM public.transactions WHERE reference=$1`,
      [created.data.reference, amount]);
  }
  return created.data;
}
try {
  const nameSearch = await api("/companies-house/search?q=BARCLAYS");
  assert.equal(nameSearch.status, 200, nameSearch.data.error);
  assert.ok(nameSearch.data.items.length > 1);
  console.log(`Real Companies House ambiguous name search: ${nameSearch.data.items.length} visible matches; no automatic selection.`);
  const numberSearch = await api("/companies-house/search?q=445790");
  assert.equal(numberSearch.status, 200, numberSearch.data.error);
  assert.equal(numberSearch.data.items[0]?.companyNumber, "00445790");
  const noMatch = await api(`/companies-house/search?q=${encodeURIComponent("zzqno-company-" + randomUUID())}`);
  assert.equal(noMatch.status, 200);
  assert.equal(noMatch.data.items.length, 0);
  const unpaid = await fixture("company-check");
  const unpaidCheck = await api(`/transactions/${unpaid.reference}/companies-house/check`, "POST",
    { companyNumber: "00445790" }, unpaid.guestCapability);
  assert.equal(unpaidCheck.status, 402);
  const owned = await fixture("company-check", true);
  const path = `/transactions/${owned.reference}/companies-house`;
  assert.equal((await api(`${path}/check`, "POST", { companyNumber: "00445790" })).status, 403);
  assert.equal((await api(`${path}/result`)).status, 403);
  const failure = await api(`${path}/check`, "POST", { companyNumber: "00000000" }, owned.guestCapability);
  assert.equal(failure.status, 404, failure.data.error);
  assert.equal((await api(`/transactions/${owned.reference}`, "GET", undefined, owned.guestCapability)).data.status, "VERIFICATION_FAILED");
  const checked = await api(`${path}/check`, "POST", { companyNumber: "00445790" }, owned.guestCapability);
  assert.equal(checked.status, 200, checked.data.error);
  assert.equal(checked.data.companyName, "TESCO PLC");
  assert.equal(checked.data.companyNumber, "00445790");
  assert.equal(checked.data.transactionStatus, "RESULT_GENERATED");
  assert.ok(checked.data.registeredOfficeAddress);
  assert.ok(Array.isArray(checked.data.sicCodes));
  const saved = await api(`${path}/result`, "GET", undefined, owned.guestCapability);
  assert.equal(saved.status, 200);
  assert.equal(saved.data.checkedAt, checked.data.checkedAt);
  const duplicates = await Promise.all([1, 2].map(() =>
    api(`${path}/check`, "POST", { companyNumber: "00445790" }, owned.guestCapability)));
  for (const duplicate of duplicates) {
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.data.verificationId, checked.data.verificationId);
  }
  assert.equal((await api(`${path}/check`, "POST", { companyNumber: "00048839" }, owned.guestCapability)).status, 409);
  const counts = await pool.query(`SELECT
    (SELECT count(*)::int FROM public.results WHERE transaction_id=t.id) AS results,
    (SELECT count(*)::int FROM public.verifications WHERE transaction_id=t.id AND provider='Companies House') AS verifications
    FROM public.transactions t WHERE reference=$1`, [owned.reference]);
  assert.equal(counts.rows[0].results, 1);
  assert.equal(counts.rows[0].verifications, 1);
  const wrong = await fixture("verify", true, 999);
  assert.equal((await api(`/transactions/${wrong.reference}/companies-house/check`, "POST",
    { companyNumber: "00445790" }, wrong.guestCapability)).status, 409);
  console.log(JSON.stringify({ reference: owned.reference, realApi: "passed", numericNormalization: "passed",
    noMatch: "passed", unpaidAndUnauthorized: "rejected", failedLookupRetry: "passed",
    storedResultReload: "passed", duplicateCheck: "one result", wrongProduct: "rejected", charges: 0 }));
} finally { await pool.end(); }