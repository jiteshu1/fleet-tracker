// Tests for the mobile-navigation fix: sidebarGroups()/flattenNavItems()
// extracted verbatim from index.html (see the extraction in this repo's
// build notes) — verifying every role actually has a way to reach every
// section it should, since that was exactly the bug reported ("only the
// dashboard shows, nothing else").
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const code = readFileSync(new URL("./nav-logic.extracted.js", import.meta.url), "utf8");

function makeApi(session, companies, windowWidth) {
  const state = { session, companies: companies || [] };
  const sandbox = { state, window: windowWidth !== undefined ? { innerWidth: windowWidth } : undefined };
  const fn = new Function(...Object.keys(sandbox), code + "\nreturn { sidebarGroups, flattenNavItems, isMobileViewport, EXPENSE_NAV_ITEMS };");
  return fn(...Object.values(sandbox));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("admin: flattened nav reaches every major section (this was the actual bug)", () => {
  const api = makeApi({ role: "admin", name: "Admin" });
  const items = api.flattenNavItems(api.sidebarGroups());
  const acts = items.map(i => i.act);
  ["business-home", "tracking-home", "live-map", "own-fleet-home", "dispatch-home",
   "branch-dash-home", "rtgs-home", "branch-expense-home", "branches-list",
   "vehicles-list", "drivers-list", "managers", "companies-list", "manage-users", "settings"
  ].forEach(act => assert.ok(acts.includes(act), "admin nav is missing: " + act));
  // Fleet Expenses is a nested sub-group — must be unwrapped to its children, not lost.
  assert.ok(acts.includes("expense-home"), "expense sub-group items must be flattened in, not dropped");
});

test("company (not East West Roadlines): no Fleet Tracking, no Branch Dispatch", () => {
  const companies = [{ id: "C1", name: "Trivia Logistics LLP" }, { id: "C2", name: "East West Roadlines" }];
  const api = makeApi({ role: "company", name: "Trivia Logistics LLP" }, companies);
  const items = api.flattenNavItems(api.sidebarGroups());
  const acts = items.map(i => i.act);
  assert.ok(!acts.includes("vehicles-list"), "a company login must never see Fleet Tracking's admin items");
  assert.ok(!acts.includes("branch-dash-home"), "Branch Dispatch is East West Roadlines-only");
  assert.ok(acts.includes("business-home") && acts.includes("own-fleet-home"));
});

test("company (East West Roadlines itself): DOES get Branch Dispatch", () => {
  const companies = [{ id: "C2", name: "East West Roadlines" }];
  const api = makeApi({ role: "company", name: "East West Roadlines" }, companies);
  const items = api.flattenNavItems(api.sidebarGroups());
  const acts = items.map(i => i.act);
  assert.ok(acts.includes("branch-dash-home"));
  assert.ok(acts.includes("rtgs-home"));
  assert.ok(acts.includes("branch-expense-home"));
});

test("manager: reaches My fleet, All vehicles, Live map, Dispatch, and Expenses", () => {
  const api = makeApi({ role: "manager", name: "Some Manager" });
  const items = api.flattenNavItems(api.sidebarGroups());
  const acts = items.map(i => i.act);
  assert.ok(acts.includes("home"));
  assert.ok(acts.includes("mgr-select"));
  assert.ok(acts.includes("live-map"));
  assert.ok(acts.includes("dispatch-home"));
  assert.ok(acts.includes("expense-home"));
});

test("branch: reaches RTGS and Branch Expense (its only two sections)", () => {
  const api = makeApi({ role: "branch", name: "Agra" });
  const items = api.flattenNavItems(api.sidebarGroups());
  const acts = items.map(i => i.act);
  assert.deepEqual(acts.sort(), ["branch-expense-home", "rtgs-home"]);
});

test("driver: reaches My trucks", () => {
  const api = makeApi({ role: "driver", name: "Ramesh" });
  const items = api.flattenNavItems(api.sidebarGroups());
  assert.deepEqual(items.map(i => i.act), ["home"]);
});

test("isMobileViewport: matches the 900px CSS breakpoint the desktop sidebar uses", () => {
  assert.equal(makeApi({ role: "admin" }, [], 375).isMobileViewport(), true);   // a phone
  assert.equal(makeApi({ role: "admin" }, [], 899).isMobileViewport(), true);   // just under
  assert.equal(makeApi({ role: "admin" }, [], 900).isMobileViewport(), false);  // exactly at the desktop breakpoint
  assert.equal(makeApi({ role: "admin" }, [], 1440).isMobileViewport(), false); // a laptop
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
