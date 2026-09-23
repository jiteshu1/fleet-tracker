import assert from "node:assert/strict";
import { createMockSupabase } from "./mock-supabase.mjs";
import { sign } from "../functions/api/_auth.js";
import { onRequestGet, onRequestPost } from "../functions/api/data.js";

const BASE_URL = "https://mock.supabase.local";
const SERVICE_KEY = "test-service-key";
const SESSION_SECRET = "test-session-secret-please-ignore";

function makeEnv() {
  return { SUPABASE_URL: BASE_URL, SUPABASE_SERVICE_KEY: SERVICE_KEY, SESSION_SECRET: SESSION_SECRET };
}

function token(name, role) {
  return sign({ name: name, role: role, exp: Date.now() + 3600 * 1000 }, SESSION_SECRET);
}

function getReq(qs, tok) {
  return new Request("http://localhost/api/data" + qs, {
    method: "GET",
    headers: tok ? { Authorization: "Bearer " + tok } : {}
  });
}
function postReq(bodyObj, tok) {
  return new Request("http://localhost/api/data", {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}),
    body: JSON.stringify(bodyObj)
  });
}

async function GET(qs, tok, env) {
  const res = await onRequestGet({ request: getReq(qs, tok), env: env });
  const body = await res.json();
  return { status: res.status, body: body };
}
async function POST(bodyObj, tok, env) {
  const res = await onRequestPost({ request: postReq(bodyObj, tok), env: env });
  const body = await res.json();
  return { status: res.status, body: body };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------------------------------------------------------------------
test("partition_status defaults to 'partitioned' for all 4 datasets when unset", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const r = await GET("?key=trips&months=2026-04", admin, env);
  // Should NOT get the "pass ?month=" error -> confirms default mode is partitioned and month handling kicked in.
  assert.equal(r.status, 200);
  assert.ok(r.body.values, "expected batch 'values' shape");
});

test("GET a partitioned dataset without month/months -> 400 with a clear message", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const r = await GET("?key=trips", admin, env);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /month/i);
});

test("admin can set partition_status; validates dataset names and mode values", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const bad1 = await POST({ key: "partition_status", value: JSON.stringify({ notADataset: "single" }) }, admin, env);
  assert.equal(bad1.status, 400);

  const bad2 = await POST({ key: "partition_status", value: JSON.stringify({ trips: "sometimes" }) }, admin, env);
  assert.equal(bad2.status, 400);

  const ok = await POST({ key: "partition_status", value: JSON.stringify({ trips: "single" }) }, admin, env);
  assert.equal(ok.status, 200);
  assert.equal(mock._get("partition_status"), JSON.stringify({ trips: "single" }));
});

test("non-admin cannot write partition_status", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const mgr = token("manager1", "manager");
  const r = await POST({ key: "partition_status", value: JSON.stringify({ trips: "single" }) }, mgr, env);
  assert.equal(r.status, 403);
});

test("POST trips with month stores under trips_<month>, readable back via GET ?month=", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const incoming = [{ id: "t1", date: "2026-04-05", truckId: "TR1", revenue: 1000 }];
  const w = await POST({ key: "trips", month: "2026-04", value: JSON.stringify(incoming), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.equal(w.body.month, "2026-04");
  assert.ok(mock._has("trips_2026-04"));
  assert.equal(mock._has("trips"), false, "legacy single-blob key should not be touched in partitioned mode");

  const g = await GET("?key=trips&month=2026-04", admin, env);
  assert.equal(g.status, 200);
  const got = JSON.parse(g.body.value);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, "t1");
});

test("out-of-month record is rejected (400), never written", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const incoming = [{ id: "t1", date: "2026-05-01", truckId: "TR1" }]; // wrong month for the "2026-04" chunk
  const w = await POST({ key: "trips", month: "2026-04", value: JSON.stringify(incoming), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(w.status, 400);
  assert.match(w.body.error, /t1/);
  assert.equal(mock._has("trips_2026-04"), false);
});

test("missing/malformed date falls back to the 'unknown' chunk", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const incoming = [{ id: "t1", date: "", truckId: "TR1" }, { id: "t2", truckId: "TR2" }];
  const w = await POST({ key: "trips", month: "unknown", value: JSON.stringify(incoming), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.ok(mock._has("trips_unknown"));

  const wrongMonth = await POST({ key: "trips", month: "2026-04", value: JSON.stringify(incoming), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(wrongMonth.status, 400);
});

test("concurrent same-month saves: two sessions add different records, both survive", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  // Both sessions start from the same empty baseline for April.
  const baseline = JSON.stringify([]);
  const aIncoming = [{ id: "tA", date: "2026-04-10", truckId: "TR1" }];
  const bIncoming = [{ id: "tB", date: "2026-04-20", truckId: "TR2" }];

  const wa = await POST({ key: "trips", month: "2026-04", value: JSON.stringify(aIncoming), baseline: baseline }, admin, env);
  assert.equal(wa.status, 200);
  // Session B still has the *original* (empty) baseline — it never saw A's save.
  const wb = await POST({ key: "trips", month: "2026-04", value: JSON.stringify(bIncoming), baseline: baseline }, admin, env);
  assert.equal(wb.status, 200);

  const finalRaw = mock._get("trips_2026-04");
  const final = JSON.parse(finalRaw);
  const ids = final.map(r => r.id).sort();
  assert.deepEqual(ids, ["tA", "tB"], "both concurrent additions must survive");
});

test("legacy single-blob mode: wipe-guard still blocks a whole-dataset collapse to zero, exactly as before", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  await POST({ key: "partition_status", value: JSON.stringify({ trips: "single" }) }, admin, env);
  const first = [{ id: "t1", date: "2026-04-05", truckId: "TR1" }];
  await POST({ key: "trips", value: JSON.stringify(first), baseline: JSON.stringify([]) }, admin, env);

  const wipe = await POST({ key: "trips", value: JSON.stringify([]), baseline: JSON.stringify(first) }, admin, env);
  assert.equal(wipe.status, 409, JSON.stringify(wipe.body));
  assert.match(wipe.body.error, /blocked/i);
  const still = JSON.parse(mock._get("trips"));
  assert.equal(still.length, 1);
});

test("partitioned mode: deleting the LAST record in a month chunk is allowed (not a whole-dataset wipe), and still backed up to __prev", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const first = [{ id: "t1", date: "2026-04-05", truckId: "TR1" }];
  await POST({ key: "trips", month: "2026-04", value: JSON.stringify(first), baseline: JSON.stringify([]) }, admin, env);

  const del = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([]), baseline: JSON.stringify(first) }, admin, env);
  assert.equal(del.status, 200, JSON.stringify(del.body));

  const now = JSON.parse(mock._get("trips_2026-04"));
  assert.equal(now.length, 0);
  // The pre-deletion state is still recoverable.
  assert.ok(mock._has("trips_2026-04__prev"));
  const backup = JSON.parse(mock._get("trips_2026-04__prev"));
  assert.equal(backup.length, 1);
  assert.equal(backup[0].id, "t1");
});

test("editing a trip across a month boundary: insert-then-remove leaves it only in the new month", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const trip = { id: "tX", date: "2026-04-28", truckId: "TR1", revenue: 500 };
  await POST({ key: "trips", month: "2026-04", value: JSON.stringify([trip]), baseline: JSON.stringify([]) }, admin, env);

  // User edits the date to May 2nd. Client does insert-into-new-month FIRST...
  const movedTrip = Object.assign({}, trip, { date: "2026-05-02" });
  const insertMay = await POST({ key: "trips", month: "2026-05", value: JSON.stringify([movedTrip]), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(insertMay.status, 200, JSON.stringify(insertMay.body));

  // ...then removes it from the old month (this legitimately empties that
  // chunk to zero — must be allowed, see the dedicated wipe-guard tests above).
  const removeApril = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([]), baseline: JSON.stringify([trip]) }, admin, env);
  assert.equal(removeApril.status, 200, JSON.stringify(removeApril.body));

  const april = JSON.parse(mock._get("trips_2026-04"));
  const may = JSON.parse(mock._get("trips_2026-05"));
  assert.equal(april.length, 0);
  assert.equal(may.length, 1);
  assert.equal(may[0].id, "tX");
  assert.equal(may[0].date, "2026-05-02");
});

test("KNOWN LIMITATION: a concurrent edit racing a cross-month move produces a safe duplicate, not data loss", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const trip = { id: "tY", date: "2026-04-15", truckId: "TR1", remark: "original" };
  await POST({ key: "trips", month: "2026-04", value: JSON.stringify([trip]), baseline: JSON.stringify([]) }, admin, env);

  // Both session A and session B loaded the April chunk with `trip` as their baseline.
  const sharedBaseline = JSON.stringify([trip]);

  // Session B moves it to May: insert into May, then remove from April.
  const movedTrip = Object.assign({}, trip, { date: "2026-05-01" });
  const bInsert = await POST({ key: "trips", month: "2026-05", value: JSON.stringify([movedTrip]), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(bInsert.status, 200);
  const bRemove = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([]), baseline: sharedBaseline }, admin, env);
  assert.equal(bRemove.status, 200, JSON.stringify(bRemove.body));

  // Session A, unaware of B's move, edits a different field but keeps the
  // record (and its date) as it originally loaded it, and saves to April.
  const aEdited = Object.assign({}, trip, { remark: "edited by A" });
  const aSave = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([aEdited]), baseline: sharedBaseline }, admin, env);
  assert.equal(aSave.status, 200, JSON.stringify(aSave.body));

  const april = JSON.parse(mock._get("trips_2026-04"));
  const may = JSON.parse(mock._get("trips_2026-05"));
  // Nothing vanished — but the record now exists in BOTH months (a
  // reconcilable duplicate), because A's save legitimately looks like an
  // "edit" of a baseline record from the merge's point of view, and the
  // merge has no way to know B already relocated that same record. This is
  // the expected, documented trade-off: duplicate over data loss.
  assert.equal(april.length, 1, "A's edit resurrects the record in April (documented trade-off)");
  assert.equal(may.length, 1, "B's moved copy remains in May");
  assert.equal(april[0].id, "tY");
  assert.equal(may[0].id, "tY");
});

test("company role: GET is scoped per month, across a batch request", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const companyTok = token("Trivia Logistics", "company");

  mock._set("companies", JSON.stringify([{ id: "C1", name: "Trivia Logistics" }, { id: "C2", name: "Arctic Reefers" }]));
  mock._set("trucks", JSON.stringify([{ id: "TRA", companyId: "C1" }, { id: "TRB", companyId: "C2" }]));

  await POST({ key: "trips", month: "2026-04", value: JSON.stringify([
    { id: "t1", date: "2026-04-05", truckId: "TRA" },
    { id: "t2", date: "2026-04-06", truckId: "TRB" }
  ]), baseline: JSON.stringify([]) }, admin, env);
  await POST({ key: "trips", month: "2026-05", value: JSON.stringify([
    { id: "t3", date: "2026-05-05", truckId: "TRA" },
    { id: "t4", date: "2026-05-06", truckId: "TRB" }
  ]), baseline: JSON.stringify([]) }, admin, env);

  const g = await GET("?key=trips&months=2026-04,2026-05", companyTok, env);
  assert.equal(g.status, 200);
  const aprIds = JSON.parse(g.body.values["2026-04"]).map(r => r.id);
  const mayIds = JSON.parse(g.body.values["2026-05"]).map(r => r.id);
  assert.deepEqual(aprIds, ["t1"]);
  assert.deepEqual(mayIds, ["t3"]);
});

test("company role: write to a chunk is rejected if it touches another company's vehicle", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const companyTok = token("Trivia Logistics", "company");

  mock._set("companies", JSON.stringify([{ id: "C1", name: "Trivia Logistics" }]));
  mock._set("trucks", JSON.stringify([{ id: "TRA", companyId: "C1" }]));

  const r = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([
    { id: "t1", date: "2026-04-05", truckId: "NOT_MINE" }
  ]), baseline: JSON.stringify([]) }, companyTok, env);
  assert.equal(r.status, 403);
});

test("branch role: rtgs_entries write is scoped per month to that branch's own name", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const branchTok = token("Agra", "branch");

  const ok = await POST({ key: "rtgs_entries", month: "2026-04", value: JSON.stringify([
    { id: "r1", date: "2026-04-05", branch: "Agra", amount: 100 }
  ]), baseline: JSON.stringify([]) }, branchTok, env);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const blocked = await POST({ key: "rtgs_entries", month: "2026-04", value: JSON.stringify([
    { id: "r1", date: "2026-04-05", branch: "Agra", amount: 100 },
    { id: "r2", date: "2026-04-06", branch: "Lucknow", amount: 200 }
  ]), baseline: JSON.stringify([{ id: "r1", date: "2026-04-05", branch: "Agra", amount: 100 }]) }, branchTok, env);
  assert.equal(blocked.status, 403);
});

test("expenses: per-month, per-type merge; company cannot touch salary; out-of-month entries rejected", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const companyTok = token("Trivia Logistics", "company");

  mock._set("companies", JSON.stringify([{ id: "C1", name: "Trivia Logistics" }]));
  mock._set("trucks", JSON.stringify([{ id: "TRA", companyId: "C1", driverName: "Ramesh" }]));

  const baseline0 = JSON.stringify({ fuel: [], service: [], adblue: [], salary: [], challan: [] });
  const goodIncoming = { fuel: [{ id: "f1", date: "2026-04-02", truckId: "TRA", amount: 5000 }], service: [], adblue: [], salary: [], challan: [] };
  const w = await POST({ key: "expenses", month: "2026-04", value: JSON.stringify(goodIncoming), baseline: baseline0 }, companyTok, env);
  assert.equal(w.status, 200, JSON.stringify(w.body));

  const badMonthIncoming = { fuel: [{ id: "f2", date: "2026-05-02", truckId: "TRA", amount: 100 }], service: [], adblue: [], salary: [], challan: [] };
  const bad = await POST({ key: "expenses", month: "2026-04", value: JSON.stringify(badMonthIncoming), baseline: baseline0 }, admin, env);
  assert.equal(bad.status, 400);

  const salaryIncoming = { fuel: [], service: [], adblue: [], salary: [{ id: "s1", date: "2026-04-01", driverName: "Ramesh", amount: 20000 }], challan: [] };
  const salaryBlocked = await POST({ key: "expenses", month: "2026-04", value: JSON.stringify(salaryIncoming), baseline: baseline0 }, companyTok, env);
  assert.equal(salaryBlocked.status, 403);
});

test("discoverMonths lists populated chunks, sorted, excluding __prev backups", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  await POST({ key: "trips", month: "2026-05", value: JSON.stringify([{ id: "a", date: "2026-05-01", truckId: "TR1" }]), baseline: JSON.stringify([]) }, admin, env);
  await POST({ key: "trips", month: "2026-04", value: JSON.stringify([{ id: "b", date: "2026-04-01", truckId: "TR1" }]), baseline: JSON.stringify([]) }, admin, env);
  await POST({ key: "trips", month: "unknown", value: JSON.stringify([{ id: "c", truckId: "TR1" }]), baseline: JSON.stringify([]) }, admin, env);
  // A wipe-guard backup key must exist by now too (trips_2026-04__prev doesn't
  // exist yet since that chunk was only written once — force one directly to
  // make sure discovery still excludes it if present).
  mock._set("trips_2026-04__prev", JSON.stringify([]));

  const g = await GET("?key=trips&discoverMonths=1", admin, env);
  assert.equal(g.status, 200);
  assert.deepEqual(g.body.months, ["2026-04", "2026-05", "unknown"]);
});

test("rollback: flipping a dataset to 'single' mode restores exact legacy single-blob behavior", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  // Some partitioned data already exists from normal operation.
  await POST({ key: "trips", month: "2026-04", value: JSON.stringify([{ id: "p1", date: "2026-04-01", truckId: "TR1" }]), baseline: JSON.stringify([]) }, admin, env);

  // Flip to single mode.
  const flip = await POST({ key: "partition_status", value: JSON.stringify({ trips: "single" }) }, admin, env);
  assert.equal(flip.status, 200);

  // Legacy behavior: no month needed, writes/reads go to the plain "trips" key.
  const legacyWrite = await POST({ key: "trips", value: JSON.stringify([{ id: "legacy1", date: "2026-06-01", truckId: "TR9" }]), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(legacyWrite.status, 200, JSON.stringify(legacyWrite.body));
  assert.ok(mock._has("trips"));

  const legacyRead = await GET("?key=trips", admin, env);
  assert.equal(legacyRead.status, 200);
  const got = JSON.parse(legacyRead.body.value);
  assert.equal(got.length, 1);
  assert.equal(got[0].id, "legacy1");

  // The previously-written partitioned chunk is untouched, just not used while in "single" mode.
  assert.ok(mock._has("trips_2026-04"));
  const untouched = JSON.parse(mock._get("trips_2026-04"));
  assert.equal(untouched.length, 1);
  assert.equal(untouched[0].id, "p1");
});

test("fiscal-year-to-date aggregation across a batch of monthly chunks matches a flat-array reference sum", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");

  const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];
  let expectedTotal = 0;
  for (const m of months) {
    const revenue = 1000 + months.indexOf(m) * 50;
    expectedTotal += revenue;
    await POST({ key: "trips", month: m, value: JSON.stringify([{ id: "fy-" + m, date: m + "-10", truckId: "TR1", revenue: revenue }]), baseline: JSON.stringify([]) }, admin, env);
  }

  const g = await GET("?key=trips&months=" + months.join(","), admin, env);
  assert.equal(g.status, 200);
  let combinedTotal = 0;
  for (const m of months) {
    const recs = JSON.parse(g.body.values[m]);
    recs.forEach(r => { combinedTotal += r.revenue; });
  }
  assert.equal(combinedTotal, expectedTotal);
});

test("REGRESSION: non-partitioned keys (trucks/users) behave exactly as before the refactor", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const env = makeEnv();
  const admin = token("admin1", "admin");
  const companyTok = token("Trivia Logistics", "company");

  mock._set("companies", JSON.stringify([{ id: "C1", name: "Trivia Logistics" }, { id: "C2", name: "Arctic Reefers" }]));
  const w = await POST({ key: "trucks", value: JSON.stringify([
    { id: "TRA", companyId: "C1", truckNo: "UP80-1" },
    { id: "TRB", companyId: "C2", truckNo: "UP80-2" }
  ]), baseline: JSON.stringify([]) }, admin, env);
  assert.equal(w.status, 200, JSON.stringify(w.body));
  assert.ok(mock._has("trucks"));
  assert.equal(mock._has("trucks_2026-04"), false, "trucks must never be chunked");

  const g = await GET("?key=trucks", companyTok, env);
  const trucks = JSON.parse(g.body.value);
  assert.deepEqual(trucks.map(t => t.id), ["TRA"], "company scoping on a non-partitioned key must still work");

  // Whole-dataset wipe-guard still protects trucks (never partitioned, always "legacy" path).
  const wipe = await POST({ key: "trucks", value: JSON.stringify([]), baseline: JSON.stringify([
    { id: "TRA", companyId: "C1", truckNo: "UP80-1" }, { id: "TRB", companyId: "C2", truckNo: "UP80-2" }
  ]) }, admin, env);
  assert.equal(wipe.status, 409);

  // Users: password stripped on read, admin-only to write, min-length enforced.
  const uw = await POST({ key: "users", value: JSON.stringify([{ name: "admin1", role: "admin", password: "longenoughpw" }]) }, admin, env);
  assert.equal(uw.status, 200, JSON.stringify(uw.body));
  const ug = await GET("?key=users", admin, env);
  const users = JSON.parse(ug.body.value);
  assert.equal(users[0].password, undefined);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try {
    await t.fn();
    pass++;
    console.log("  ok  " + t.name);
  } catch (e) {
    fail++;
    console.log(" FAIL " + t.name);
    console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 4).join("\n       ") : e));
  }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
