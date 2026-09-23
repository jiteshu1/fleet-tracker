// End-to-end test: the ACTUAL client data-layer code extracted verbatim
// from index.html (see extract-client-layer.mjs), running against the
// ACTUAL functions/api/data.js server code, via the mock Supabase. This is
// the strongest test in the suite — it catches integration bugs that
// testing either side alone can't (e.g. a client/server payload-shape
// mismatch), and if index.html's data layer changes, re-run
// extract-client-layer.mjs first so this stays in sync automatically
// instead of silently testing a stale copy.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMockSupabase } from "./mock-supabase.mjs";
import { sign } from "../functions/api/_auth.js";
import { onRequestGet, onRequestPost } from "../functions/api/data.js";

const BASE_URL = "https://mock.supabase.local";
const SERVICE_KEY = "test-service-key";
const SESSION_SECRET = "test-session-secret-please-ignore";
const env = { SUPABASE_URL: BASE_URL, SUPABASE_SERVICE_KEY: SERVICE_KEY, SESSION_SECRET: SESSION_SECRET };

function token(name, role) { return sign({ name, role, exp: Date.now() + 3600 * 1000 }, SESSION_SECRET); }

// Routes the browser's own relative-URL fetch("/api/data...") calls straight
// into the real Cloudflare Function handlers, exactly as Cloudflare Pages
// would at the edge — so the extracted client code below is none the wiser
// that it isn't talking to a real deployment.
function makeAppFetch(mockSupabase, authToken) {
  return async function (url, opts) {
    opts = opts || {};
    if (String(url).startsWith("/api/data")) {
      const fullUrl = "http://localhost" + url;
      const headers = Object.assign({}, opts.headers || {});
      const req = new Request(fullUrl, { method: opts.method || "GET", headers, body: opts.body });
      const handler = (opts.method || "GET").toUpperCase() === "POST" ? onRequestPost : onRequestGet;
      return handler({ request: req, env });
    }
    // Anything else (shouldn't happen in these tests) falls through to the mock Supabase directly.
    return mockSupabase.fetch(url, opts);
  };
}

const clientCode = readFileSync(new URL("./client-data-layer.extracted.js", import.meta.url), "utf8");

function makeClient(mockSupabase, tok) {
  const state = {
    loadFailedKeys: {},
    _baseline: {},
    _loadedMonths: { trips: {}, expenses: {}, rtgs_entries: {}, branch_expenses: {} },
    _rangeLoading: {}, _rangeExportFrom: {}, _rangeExportTo: {}, _rangeExportNote: {},
    trips: [], expenses: { fuel: [], service: [], adblue: [], salary: [], challan: [] },
    rtgsEntries: [], branchExpenses: [],
    toast: null
  };
  let renderCount = 0;
  const sandbox = {
    state,
    authToken: tok,
    fetch: makeAppFetch(mockSupabase, tok),
    Request, Response, URL, JSON, console,
    render: function () { renderCount++; }
  };
  const fn = new Function(...Object.keys(sandbox), clientCode + "\nreturn { loadCriticalMonth, ensureMonthsLoaded, makeMonthlySave, makeMonthlyExpensesSave, prefetchFiscalYearInBackground, currentMonthKey, fiscalYearMonthsUpTo, monthsBetween, bucketByMonth, monthKeyFromDateStr, maybeLoadRangeMonths, discoverMonthsFor, monthLabel };");
  const api = fn(...Object.values(sandbox));
  return { state, api, getRenderCount: () => renderCount };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("client boots on current month only, via the real server", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c1 = makeClient(mock, admin);
  await c1.api.loadCriticalMonth("trips", "2026-08", []);
  assert.deepEqual(c1.state.trips, []);
  assert.equal(c1.state._loadedMonths.trips["2026-08"], true);
  assert.equal(c1.state._loadedMonths.trips["2026-09"], undefined, "only the requested month should be marked loaded");
});

test("current-month boot + FY-to-date background prefetch, end to end", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);

  // Seed April..September 2026 with one trip each, as if written earlier
  // (e.g. by other sessions before this browser ever opened the app).
  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  for (const m of months) {
    const req = new Request("http://localhost/api/data", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin },
      body: JSON.stringify({ key: "trips", month: m, value: JSON.stringify([{ id: "seed-" + m, date: m + "-15", truckId: "TR1" }]), baseline: JSON.stringify([]) })
    });
    const resp = await onRequestPost({ request: req, env });
    assert.equal(resp.status, 200);
  }

  await c.api.loadCriticalMonth("trips", "2026-09", []);
  assert.equal(c.state.trips.length, 1, "boot should only have September's single trip");
  assert.equal(c.state.trips[0].id, "seed-2026-09");

  await c.api.prefetchFiscalYearInBackground();
  const ids = c.state.trips.map(t => t.id).sort();
  assert.deepEqual(ids, months.map(m => "seed-" + m).sort(), "after prefetch, all FY-to-date months should be present");
  assert.equal(c.getRenderCount(), 1, "prefetch should trigger exactly one re-render");
});

test("ensureMonthsLoaded is a no-op the second time (doesn't re-fetch or duplicate)", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);
  await (async () => {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: "2026-04", value: JSON.stringify([{ id: "x1", date: "2026-04-05", truckId: "TR1" }]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  })();

  const got1 = await c.api.ensureMonthsLoaded("trips", ["2026-04"]);
  assert.equal(got1, true);
  assert.equal(c.state.trips.length, 1);
  const got2 = await c.api.ensureMonthsLoaded("trips", ["2026-04"]);
  assert.equal(got2, false, "already-loaded month must be a no-op");
  assert.equal(c.state.trips.length, 1, "must not duplicate");
});

test("saveTrips (makeMonthlySave): adding a brand new trip round-trips through the real server", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);
  await c.api.loadCriticalMonth("trips", "2026-04", []);
  const save = c.api.makeMonthlySave("trips", "date");

  c.state.trips.push({ id: "n1", date: "2026-04-12", truckId: "TR1", revenue: 1200 });
  await save();
  assert.equal(c.state.trips.length, 1);
  assert.ok(mock._has("trips_2026-04"));
  assert.equal(JSON.parse(mock._get("trips_2026-04")).length, 1);
});

test("saveTrips: editing a trip's date moves it across chunks automatically, in one client-side save() call", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);

  await (async () => {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: "2026-04", value: JSON.stringify([{ id: "mv1", date: "2026-04-28", truckId: "TR1", remark: "orig" }]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  })();
  await c.api.loadCriticalMonth("trips", "2026-04", []);
  assert.equal(c.state.trips.length, 1);

  const save = c.api.makeMonthlySave("trips", "date");
  // User edits the date field in the UI -> just mutates state.trips in place, like today.
  c.state.trips[0].date = "2026-05-02";
  await save();

  assert.equal(c.state.trips.length, 1, "the flat state array should still show exactly one trip");
  assert.equal(c.state.trips[0].date, "2026-05-02");
  const april = JSON.parse(mock._get("trips_2026-04"));
  const may = JSON.parse(mock._get("trips_2026-05"));
  assert.equal(april.length, 0, "removed from the old month's server chunk");
  assert.equal(may.length, 1, "present in the new month's server chunk");
  assert.equal(may[0].id, "mv1");
});

test("saveExpenses (makeMonthlyExpensesSave): per-type, per-month save round-trips through the real server", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);
  await c.api.loadCriticalMonth("expenses", "2026-04", { fuel: [], service: [], adblue: [], salary: [], challan: [] });
  const save = c.api.makeMonthlyExpensesSave();

  c.state.expenses.fuel.push({ id: "f1", date: "2026-04-10", truckId: "TR1", amount: 3000 });
  c.state.expenses.salary.push({ id: "s1", date: "2026-04-01", driverName: "Ramesh", amount: 20000 });
  await save();

  assert.equal(c.state.expenses.fuel.length, 1);
  assert.equal(c.state.expenses.salary.length, 1);
  const chunk = JSON.parse(mock._get("expenses_2026-04"));
  assert.equal(chunk.fuel.length, 1);
  assert.equal(chunk.salary.length, 1);
});

test("legacy/rollback mode: the SAME client save code still works correctly against a single-blob backend", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");

  // Flip trips to "single" mode before any client ever loads anything.
  await (async () => {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "partition_status", value: JSON.stringify({ trips: "single" }) }) });
    await onRequestPost({ request: req, env });
  })();

  const c = makeClient(mock, admin);
  await c.api.loadCriticalMonth("trips", "2026-04", []); // server ignores month in single mode, returns the whole (currently empty) blob
  assert.equal(c.state.trips.length, 0);

  const save = c.api.makeMonthlySave("trips", "date");
  c.state.trips.push({ id: "a1", date: "2026-04-05", truckId: "TR1" });
  c.state.trips.push({ id: "a2", date: "2026-05-05", truckId: "TR1" }); // a different month, still fine against a single blob
  await save();

  assert.ok(mock._has("trips"), "legacy single key must be written");
  assert.equal(mock._has("trips_2026-04"), false, "no chunk keys should appear while in single mode");
  const whole = JSON.parse(mock._get("trips"));
  assert.equal(whole.length, 2);

  // A second client, loading fresh, should see both records via the same "current month" boot call.
  const c2 = makeClient(mock, token("admin2", "admin"));
  await c2.api.loadCriticalMonth("trips", "2026-09", []); // month is irrelevant in single mode
  assert.equal(c2.state.trips.length, 2, "single mode returns everything regardless of requested month");
});

test("monthsBetween: computes every calendar month touched by a date range", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);
  assert.deepEqual(c.api.monthsBetween("2026-02-10", "2026-05-03"), ["2026-02", "2026-03", "2026-04", "2026-05"]);
  assert.deepEqual(c.api.monthsBetween("", "2026-05-03"), []);
  assert.deepEqual(c.api.monthsBetween("2026-05-03", ""), []);
});

test("discoverMonthsFor: reaches the real server's discoverMonths endpoint and gets back populated months", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);

  for (const m of ["2025-11", "2025-12", "2026-01"]) {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: m, value: JSON.stringify([{ id: "d-" + m, date: m + "-05", truckId: "TR1" }]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  }

  const months = await c.api.discoverMonthsFor("trips");
  assert.deepEqual(months, ["2025-11", "2025-12", "2026-01"]);
});

test("maybeLoadRangeMonths: picking an older date range (e.g. last fiscal year) on an existing filter pulls those months in", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);

  // Some trips from LAST fiscal year (well before the current one), written earlier.
  for (const m of ["2025-06", "2025-07"]) {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: m, value: JSON.stringify([{ id: "old-" + m, date: m + "-10", truckId: "TR1" }]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  }
  await c.api.loadCriticalMonth("trips", "2026-09", []); // simulate normal boot: only the current month is in memory
  assert.equal(c.state.trips.length, 0, "last fiscal year's trips shouldn't be loaded yet");

  // User picks an older custom date range in the (existing) Own Fleet Dashboard filter.
  await c.api.maybeLoadRangeMonths("trips", "2025-06-01", "2025-07-31");

  assert.equal(c.state.trips.length, 2, "the picked range should now be loaded");
  assert.deepEqual(c.state.trips.map(t => t.id).sort(), ["old-2025-06", "old-2025-07"]);
  assert.equal(c.getRenderCount(), 2, "should render once to show the loading state, once when the range finishes loading");
  assert.equal(c.state._rangeLoading.trips, false, "loading flag must be cleared afterwards");
});

test("range-loading flag: set true while fetching, false once done (what export buttons must check)", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);
  for (const m of ["2025-06"]) {
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: m, value: JSON.stringify([{ id: "z1", date: m + "-05", truckId: "TR1" }]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  }
  const p = c.api.maybeLoadRangeMonths("trips", "2025-06-01", "2025-06-30");
  assert.equal(c.state._rangeLoading.trips, true, "must be true synchronously, the instant loading starts");
  await p;
  assert.equal(c.state._rangeLoading.trips, false, "must be cleared once the load settles");
});

test("range export data correctness: date-range filtering matches exactly the records inside [from, to]", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const admin = token("admin1", "admin");
  const c = makeClient(mock, admin);

  const rows = [
    { id: "in1", date: "2026-04-10" }, { id: "in2", date: "2026-04-20" },
    { id: "edge1", date: "2026-04-01" }, { id: "edge2", date: "2026-04-30" },
    { id: "out1", date: "2026-03-31" }, { id: "out2", date: "2026-05-01" }
  ];
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    const req = new Request("http://localhost/api/data", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + admin }, body: JSON.stringify({ key: "trips", month: m, value: JSON.stringify([Object.assign({ truckId: "TR1" }, r)]), baseline: JSON.stringify([]) }) });
    await onRequestPost({ request: req, env });
  }

  await c.api.maybeLoadRangeMonths("trips", "2026-04-01", "2026-04-30");
  // This mirrors exactly what the export click-handler does: it already has
  // everything it needs loaded, then filters with inDateRange-equivalent logic.
  const inRange = c.state.trips.filter(t => t.date >= "2026-04-01" && t.date <= "2026-04-30");
  assert.deepEqual(inRange.map(t => t.id).sort(), ["edge1", "edge2", "in1", "in2"]);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
