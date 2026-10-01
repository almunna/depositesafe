import assert from "node:assert/strict";
import test from "node:test";
import { hasExplicitCompanyHouseAdminRole } from "./companies-house-access";

test("Companies House admin bypass requires an explicit local admin role", () => {
  assert.equal(hasExplicitCompanyHouseAdminRole("admin"), true);
  assert.equal(hasExplicitCompanyHouseAdminRole("customer"), false);
  assert.equal(hasExplicitCompanyHouseAdminRole(undefined), false);
  assert.equal(hasExplicitCompanyHouseAdminRole(null), false);
});