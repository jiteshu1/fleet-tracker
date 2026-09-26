// Tests for real vulnerabilities found during a full security review
// (prompted by an external audit list, independently verified against the
// actual code rather than trusted at face value).
import assert from "node:assert/strict";
import { createMockSupabase } from "./mock-supabase.mjs";
import { sign, hashPasswordSalted, verifyPasswordSalted } from "../functions/api/_auth.js";
import { onRequestGet, onRequestPost } from "../functions/api/data.js";

const BASE_URL = "https://mock.supabase.local";
const SERVICE_KEY = "test-service-key";
const SESSION_SECRET = "test-session-secret";
const env = { SUPABASE_URL: BASE_URL, SUPABASE_SERVICE_KEY: SERVICE_KEY, SESSION_SECRET: SESSION_SECRET };

function token(name, role) { return sign({ name, role, exp: Date.now() + 3600 * 1000 }, SESSION_SECRET); }
function postReq(bodyObj, tok) {
  return new Request("http://localhost/api/data", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, tok ? { Authorization: "Bearer " + tok } : {}), body: JSON.stringify(bodyObj) });
}
function getReq(qs, tok) { return new Request("http://localhost/api/data" + qs, { method: "GET", headers: tok ? { Authorization: "Bearer " + tok } : {} }); }
async function POST(bodyObj, tok, env) { const res = await onRequestPost({ request: postReq(bodyObj, tok), env }); return { status: res.status, body: await res.json() }; }
async function GET(qs, tok, env) { const res = await onRequestGet({ request: getReq(qs, tok), env }); return { status: res.status, body: await res.json() }; }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("CRITICAL (now fixed): a non-admin can no longer set/change another user's password, including admin's", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const originalAdminHash = hashPasswordSalted("adminpass1");
  mock._set("users", JSON.stringify([
    { name: "Admin", role: "admin", password: originalAdminHash },
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("driverpass1") }
  ]));
  const driverTok = token("Ramesh", "driver");

  const attack = await POST({ key: "users", value: JSON.stringify([
    { name: "Admin", role: "admin", password: "hacked-password-123" }, // attacker's new password for the admin account
    { name: "Ramesh", role: "driver", password: "driverpass1" }
  ]) }, driverTok, env);

  assert.equal(attack.status, 403, "must be rejected outright");
  // And the admin's real password must be completely untouched.
  const usersRaw = JSON.parse(mock._get("users"));
  const admin = usersRaw.find(u => u.name === "Admin");
  assert.equal(admin.password, originalAdminHash);
  assert.ok(!verifyPasswordSalted("hacked-password-123", admin.password), "the attacker's password must not verify");
  assert.ok(verifyPasswordSalted("adminpass1", admin.password), "the real password must still verify");
});

test("CRITICAL (now fixed): a non-admin can no longer promote themselves to admin", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  mock._set("users", JSON.stringify([
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("driverpass1") }
  ]));
  const driverTok = token("Ramesh", "driver");

  const attack = await POST({ key: "users", value: JSON.stringify([
    { name: "Ramesh", role: "admin", password: "driverpass1" }
  ]) }, driverTok, env);

  assert.equal(attack.status, 403);
  const usersRaw = JSON.parse(mock._get("users"));
  assert.equal(usersRaw.find(u => u.name === "Ramesh").role, "driver");
});

test("(now fixed) a non-admin can no longer clear their own mustChangePassword flag by omitting it", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  mock._set("users", JSON.stringify([
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("temp12345"), mustChangePassword: true }
  ]));
  const driverTok = token("Ramesh", "driver");

  const attack = await POST({ key: "users", value: JSON.stringify([
    { name: "Ramesh", role: "driver", password: "temp12345" } // mustChangePassword silently dropped
  ]) }, driverTok, env);

  assert.equal(attack.status, 403);
});

test("(now fixed) a non-admin can no longer change another user's loginId", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  mock._set("users", JSON.stringify([
    { name: "Admin", role: "admin", loginId: "admin@ewr.com", password: hashPasswordSalted("adminpass1") },
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("driverpass1") }
  ]));
  const driverTok = token("Ramesh", "driver");

  const attack = await POST({ key: "users", value: JSON.stringify([
    { name: "Admin", role: "admin", loginId: "attacker@evil.com", password: "adminpass1" },
    { name: "Ramesh", role: "driver", password: "driverpass1" }
  ]) }, driverTok, env);

  assert.equal(attack.status, 403);
});

test("a non-admin CAN still change only their own password — the legitimate case must keep working", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  mock._set("users", JSON.stringify([
    { name: "Admin", role: "admin", password: hashPasswordSalted("adminpass1") },
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("oldpassword1") }
  ]));
  const driverTok = token("Ramesh", "driver");

  // This mirrors what the real client actually sends: GET already strips
  // every password, so state.users only ever has a real password value for
  // whichever record the user just typed a new one into — every other
  // user's password field is simply absent, never a resent plaintext guess.
  const ok = await POST({ key: "users", value: JSON.stringify([
    { name: "Admin", role: "admin" },
    { name: "Ramesh", role: "driver", password: "newpassword1" }
  ]) }, driverTok, env);

  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const usersRaw = JSON.parse(mock._get("users"));
  assert.ok(verifyPasswordSalted("newpassword1", usersRaw.find(u => u.name === "Ramesh").password));
});

test("admin is unaffected by any of the above restrictions — can still edit anyone", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  mock._set("users", JSON.stringify([
    { name: "Admin", role: "admin", password: hashPasswordSalted("adminpass1") },
    { name: "Ramesh", role: "driver", password: hashPasswordSalted("driverpass1") }
  ]));
  const adminTok = token("Admin", "admin");

  const res = await POST({ key: "users", value: JSON.stringify([
    { name: "Admin", role: "admin", password: "adminpass1" },
    { name: "Ramesh", role: "manager", password: "driverpass1" } // admin promotes Ramesh to manager
  ]) }, adminTok, env);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(JSON.parse(mock._get("users")).find(u => u.name === "Ramesh").role, "manager");
});

test("(now fixed) a failed database read aborts the request instead of silently proceeding as if the dataset were empty", async () => {
  const mock = createMockSupabase(BASE_URL);
  // A fetch that always reports a failed (non-ok) response, simulating a transient Supabase outage.
  globalThis.fetch = async () => new Response("service unavailable", { status: 503 });
  const adminTok = token("Admin", "admin");

  const res = await POST({ key: "trips", month: "2026-04", value: JSON.stringify([{ id: "x", date: "2026-04-01", truckId: "T1" }]), baseline: JSON.stringify([]) }, adminTok, env);
  assert.equal(res.status, 500, "must fail loudly, not silently treat the unreadable data as empty and overwrite it");
});

test("(now fixed) drivers/managers datasets require admin — previously ANY authenticated role could overwrite them", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const driverTok = token("Ramesh", "driver");
  const managerTok = token("Suresh", "manager");
  const branchTok = token("Agra", "branch");

  for (const tok of [driverTok, managerTok, branchTok]) {
    const r1 = await POST({ key: "drivers", value: JSON.stringify([{ name: "Ramesh", managerName: "Suresh" }]) }, tok, env);
    assert.equal(r1.status, 403);
    const r2 = await POST({ key: "managers", value: JSON.stringify([{ name: "Attacker", vehicleIds: [] }]) }, tok, env);
    assert.equal(r2.status, 403);
  }
});

test("(now fixed) a driver can edit only the truck currently assigned to them, based on the DATABASE's record — not on what they claim in the request", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");
  await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", driverName: "Ramesh" },
    { id: "T2", truckNo: "GJ01AA0002", driverName: "Suresh" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const driverTok = token("Ramesh", "driver");
  // Legitimate: editing their own truck's odometer/etc.
  const ok = await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", driverName: "Ramesh", odometer: "50000" },
    { id: "T2", truckNo: "GJ01AA0002", driverName: "Suresh" }
  ]), baseline: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", driverName: "Ramesh" },
    { id: "T2", truckNo: "GJ01AA0002", driverName: "Suresh" }
  ]) }, driverTok, env);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  // Attack: try to "claim" T2 by editing it and setting driverName to themselves.
  const attack = await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", driverName: "Ramesh", odometer: "50000" },
    { id: "T2", truckNo: "GJ01AA0002", driverName: "Ramesh" } // claiming someone else's truck
  ]), baseline: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", driverName: "Ramesh", odometer: "50000" },
    { id: "T2", truckNo: "GJ01AA0002", driverName: "Suresh" }
  ]) }, driverTok, env);
  assert.equal(attack.status, 403, "must not be able to claim another driver's truck by editing driverName in the payload");
});

test("(now fixed) a manager can edit only vehicles in their own fleet (per the managers list on file, not what they claim)", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");
  mock._set("managers", JSON.stringify([{ name: "Suresh", vehicleIds: ["T1"] }, { name: "Other Mgr", vehicleIds: ["T2"] }]));
  await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001" }, { id: "T2", truckNo: "GJ01AA0002" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const managerTok = token("Suresh", "manager");
  const ok = await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", note: "serviced" }, { id: "T2", truckNo: "GJ01AA0002" }
  ]), baseline: JSON.stringify([{ id: "T1", truckNo: "GJ01AA0001" }, { id: "T2", truckNo: "GJ01AA0002" }]) }, managerTok, env);
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  const attack = await POST({ key: "trucks", value: JSON.stringify([
    { id: "T1", truckNo: "GJ01AA0001", note: "serviced" }, { id: "T2", truckNo: "GJ01AA0002", note: "tampered" }
  ]), baseline: JSON.stringify([{ id: "T1", truckNo: "GJ01AA0001", note: "serviced" }, { id: "T2", truckNo: "GJ01AA0002" }]) }, managerTok, env);
  assert.equal(attack.status, 403, "must not be able to edit a vehicle outside their own fleet");
});

test("branch and viewer roles cannot write trucks at all", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const branchTok = token("Agra", "branch");
  const r = await POST({ key: "trucks", value: JSON.stringify([{ id: "T1", truckNo: "X" }]), baseline: JSON.stringify([]) }, branchTok, env);
  assert.equal(r.status, 403);
});

test("CRITICAL (now fixed) — the actual bug reported: adding a new driver no longer deletes every other driver", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");

  // Three real drivers already exist (matching the reported scenario).
  await POST({ key: "drivers", value: JSON.stringify([
    { name: "Masood 2607", contact: "+91 91031 69371", managerName: "Mohit Sharma Tempo" },
    { name: "Zulfikar 2614", contact: "+91 80828 57122", managerName: "Mohit Sharma Tempo" },
    { name: "Ashrif 2667", contact: "+91 60063 93561", managerName: "Mohit Sharma Tempo" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  // Admin adds a brand new fourth driver — this is the exact "add manager/driver" flow.
  const before = JSON.parse(mock._get("drivers"));
  const afterAdd = before.concat([{ name: "Wazir 2158", contact: "+91 88996 90423", managerName: "Mohit Sharma Translines" }]);
  const res = await POST({ key: "drivers", value: JSON.stringify(afterAdd), baseline: JSON.stringify(before) }, adminTok, env);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const finalDrivers = JSON.parse(mock._get("drivers"));
  assert.equal(finalDrivers.length, 4, "all three original drivers plus the new one must all survive");
  assert.deepEqual(finalDrivers.map(d => d.name).sort(), ["Ashrif 2667", "Masood 2607", "Wazir 2158", "Zulfikar 2614"]);
});

test("CRITICAL (now fixed) — same bug, same fix, for managers", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");

  await POST({ key: "managers", value: JSON.stringify([
    { name: "Mohit Sharma Tempo", contact: "", vehicleIds: ["T1"] },
    { name: "Mohit Sharma Translines", contact: "", vehicleIds: ["T2"] }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const before = JSON.parse(mock._get("managers"));
  const afterAdd = before.concat([{ name: "Suresh Kumar Fleet", contact: "", vehicleIds: [] }]);
  const res = await POST({ key: "managers", value: JSON.stringify(afterAdd), baseline: JSON.stringify(before) }, adminTok, env);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const finalManagers = JSON.parse(mock._get("managers"));
  assert.equal(finalManagers.length, 3);
  assert.deepEqual(finalManagers.map(m => m.name).sort(), ["Mohit Sharma Tempo", "Mohit Sharma Translines", "Suresh Kumar Fleet"]);
});

test("same fix for branches (also name-keyed, not yet triggered live but the same bug applies)", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");

  await POST({ key: "branches", value: JSON.stringify([
    { name: "AGRA", contact: "" }, { name: "AHMEDABAD", contact: "" }, { name: "ALWAR", contact: "" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const before = JSON.parse(mock._get("branches"));
  const afterAdd = before.concat([{ name: "AMBALA", contact: "" }]);
  const res = await POST({ key: "branches", value: JSON.stringify(afterAdd), baseline: JSON.stringify(before) }, adminTok, env);

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(JSON.parse(mock._get("branches")).length, 4);
});

test("editing (not adding) one driver among several still only changes that one — the rest stay untouched", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");
  await POST({ key: "drivers", value: JSON.stringify([
    { name: "Masood 2607", contact: "old-number" },
    { name: "Zulfikar 2614", contact: "111" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const before = JSON.parse(mock._get("drivers"));
  const edited = before.map(d => d.name === "Masood 2607" ? Object.assign({}, d, { contact: "new-number" }) : d);
  const res = await POST({ key: "drivers", value: JSON.stringify(edited), baseline: JSON.stringify(before) }, adminTok, env);
  assert.equal(res.status, 200);
  const final = JSON.parse(mock._get("drivers"));
  assert.equal(final.length, 2);
  assert.equal(final.find(d => d.name === "Masood 2607").contact, "new-number");
  assert.equal(final.find(d => d.name === "Zulfikar 2614").contact, "111");
});

test("deleting one driver among several removes only that one", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  const adminTok = token("Admin", "admin");
  await POST({ key: "drivers", value: JSON.stringify([
    { name: "Masood 2607" }, { name: "Zulfikar 2614" }, { name: "Ashrif 2667" }
  ]), baseline: JSON.stringify([]) }, adminTok, env);

  const before = JSON.parse(mock._get("drivers"));
  const afterDelete = before.filter(d => d.name !== "Zulfikar 2614");
  const res = await POST({ key: "drivers", value: JSON.stringify(afterDelete), baseline: JSON.stringify(before) }, adminTok, env);
  assert.equal(res.status, 200);
  const final = JSON.parse(mock._get("drivers"));
  assert.deepEqual(final.map(d => d.name).sort(), ["Ashrif 2667", "Masood 2607"]);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
