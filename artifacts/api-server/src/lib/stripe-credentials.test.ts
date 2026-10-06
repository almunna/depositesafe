import assert from "node:assert/strict";
import test from "node:test";
import { getStripeContext, STRIPE_ACCOUNTS, stripeAccountId, stripeMode } from "@workspace/stripe";

const RUNTIME_KEYS = [
  "NODE_ENV", "REPLIT_DEPLOYMENT", "WEB_REPL_RENEWAL", "REPL_IDENTITY", "REPLIT_CONNECTORS_HOSTNAME",
  "STRIPE_MODE", "STRIPE_SECRET_KEY", "STRIPE_ACCOUNT_ID",
] as const;

async function withRuntime<T>(
  values: Partial<Record<(typeof RUNTIME_KEYS)[number], string>>,
  run: () => T | Promise<T>,
): Promise<T> {
  const saved = RUNTIME_KEYS.map(key => [key, process.env[key]] as const);
  for (const key of RUNTIME_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  try {
    return await run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

// Deliberately too short to be real keys; only the mode prefix is inspected.
const LIVE_KEY = "sk_live_fake";
const TEST_KEY = "sk_test_fake";

test("a production runtime outside Replit is live unless it opts down to the sandbox", async () => {
  await withRuntime({ NODE_ENV: "production" }, () => assert.equal(stripeMode(), "live"));
  await withRuntime({ NODE_ENV: "production", STRIPE_MODE: "test" }, () => assert.equal(stripeMode(), "test"));
  await withRuntime({ NODE_ENV: "production", STRIPE_MODE: "sandbox" }, () => assert.equal(stripeMode(), "live"));
});

test("nothing opts a development runtime up to live", async () => {
  await withRuntime({ NODE_ENV: "development", STRIPE_MODE: "live" }, () => assert.equal(stripeMode(), "test"));
});

test("the sandbox opt-down is ignored where the Replit connector identity exists", async () => {
  await withRuntime(
    { NODE_ENV: "production", STRIPE_MODE: "test", REPLIT_CONNECTORS_HOSTNAME: "connectors.example", WEB_REPL_RENEWAL: "token" },
    () => assert.equal(stripeMode(), "live"),
  );
});

test("a live environment key is accepted only for the allowlisted live account", async () => {
  await withRuntime(
    { NODE_ENV: "production", STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ACCOUNT_ID: STRIPE_ACCOUNTS.live },
    async () => {
      const context = await getStripeContext();
      assert.equal(context.mode, "live");
      assert.equal(context.accountId, STRIPE_ACCOUNTS.live);
    },
  );
  await withRuntime(
    { NODE_ENV: "production", STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ACCOUNT_ID: "acct_someoneElse" },
    () => assert.rejects(getStripeContext(), /STRIPE_SECRET_KEY/),
  );
});

test("an environment key of the wrong mode is never used", async () => {
  await withRuntime(
    { NODE_ENV: "production", STRIPE_SECRET_KEY: TEST_KEY, STRIPE_ACCOUNT_ID: STRIPE_ACCOUNTS.live },
    () => assert.rejects(getStripeContext(), /STRIPE_SECRET_KEY/),
  );
  await withRuntime(
    { NODE_ENV: "development", STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ACCOUNT_ID: STRIPE_ACCOUNTS.live },
    () => assert.rejects(getStripeContext(), /STRIPE_SECRET_KEY/),
  );
  await withRuntime(
    { NODE_ENV: "production", STRIPE_MODE: "test", STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_ACCOUNT_ID: STRIPE_ACCOUNTS.live },
    () => assert.rejects(getStripeContext(), /STRIPE_SECRET_KEY/),
  );
});

test("a sandbox environment key keeps the account it is configured with", async () => {
  await withRuntime(
    { NODE_ENV: "production", STRIPE_MODE: "test", STRIPE_SECRET_KEY: TEST_KEY, STRIPE_ACCOUNT_ID: "acct_sandbox" },
    async () => {
      assert.equal(stripeAccountId(), "acct_sandbox");
      assert.equal((await getStripeContext()).mode, "test");
    },
  );
});
