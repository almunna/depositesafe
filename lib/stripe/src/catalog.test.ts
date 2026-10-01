import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";
import { LOCKED_PRODUCTS } from "./index";
import { matchLockedCatalog } from "./catalog";

function priceFor(
  expected: (typeof LOCKED_PRODUCTS)[number],
  suffix = "",
): Stripe.Price {
  return {
    id: `price_${expected.slug}${suffix}`,
    active: true,
    livemode: true,
    type: "one_time",
    currency: "gbp",
    unit_amount: expected.amount,
    custom_unit_amount: null,
    product: {
      id: `prod_${expected.slug}${suffix}`,
      object: "product",
      active: true,
      livemode: true,
      name: expected.name,
      deleted: false,
    },
  } as unknown as Stripe.Price;
}

test("Company Check matching ignores duplicate prices for unrelated locked products", () => {
  const prices = LOCKED_PRODUCTS.map(product => priceFor(product));
  prices.push(priceFor(LOCKED_PRODUCTS[1], "_duplicate"));

  const [companyCheck] = matchLockedCatalog(prices, "live", "company-check");
  assert.equal(companyCheck.slug, "company-check");
  assert.equal(companyCheck.priceId, "price_company-check");
  assert.equal(companyCheck.productId, "prod_company-check");
});

test("Company Check matching still rejects duplicate Company Check prices", () => {
  const prices = LOCKED_PRODUCTS.map(product => priceFor(product));
  prices.push(priceFor(LOCKED_PRODUCTS[0], "_duplicate"));

  assert.throws(
    () => matchLockedCatalog(prices, "live", "company-check"),
    /Company Check: expected exactly one active live GBP price of 499p; found 2/,
  );
});

test("full-catalog matching remains strict when any locked product has duplicate prices", () => {
  const prices = LOCKED_PRODUCTS.map(product => priceFor(product));
  prices.push(priceFor(LOCKED_PRODUCTS[1], "_duplicate"));

  assert.throws(
    () => matchLockedCatalog(prices, "live"),
    /Bank Account Check: expected exactly one active live GBP price of 799p; found 2/,
  );
});