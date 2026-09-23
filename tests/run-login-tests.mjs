// Tests for the "separate short login ID vs full display name" feature in
// functions/api/login.js, against the real handler + mock Supabase.
import assert from "node:assert/strict";
import { createMockSupabase } from "./mock-supabase.mjs";
import { hashPasswordSalted } from "../functions/api/_auth.js";
import { onRequestPost as loginPost } from "../functions/api/login.js";

const BASE_URL = "https://mock.supabase.local";
const SERVICE_KEY = "test-service-key";
const SESSION_SECRET = "test-session-secret-please-ignore";
const env = { SUPABASE_URL: BASE_URL, SUPABASE_SERVICE_KEY: SERVICE_KEY, SESSION_SECRET: SESSION_SECRET };

function seedUsers(mock, users) { mock._set("users", JSON.stringify(users)); }
async function attemptLogin(name, password) {
  const req = new Request("http://localhost/api/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, password })
  });
  const res = await loginPost({ request: req, env });
  const body = await res.json();
  return { status: res.status, body };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("a user with NO loginId still logs in by full name, exactly as before", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  seedUsers(mock, [{ name: "Ramesh Kumar", role: "driver", password: hashPasswordSalted("password123") }]);

  const r = await attemptLogin("Ramesh Kumar", "password123");
  assert.equal(r.status, 200);
  assert.equal(r.body.name, "Ramesh Kumar");
});

test("a user WITH a loginId can log in with the short id instead of the long name", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  seedUsers(mock, [{ name: "Trivia Logistics LLP", role: "company", loginId: "trivia@trivia.com", password: hashPasswordSalted("password123") }]);

  const r = await attemptLogin("trivia@trivia.com", "password123");
  assert.equal(r.status, 200);
  // The session identity is still the full name — this is what keeps
  // company-scoping (which matches session.name against companies[].name)
  // working with zero changes anywhere else in the app.
  assert.equal(r.body.name, "Trivia Logistics LLP");
  assert.equal(r.body.role, "company");
});

test("a user WITH a loginId can ALSO still log in with their full name (both work)", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  seedUsers(mock, [{ name: "Trivia Logistics LLP", role: "company", loginId: "trivia@trivia.com", password: hashPasswordSalted("password123") }]);

  const r = await attemptLogin("Trivia Logistics LLP", "password123");
  assert.equal(r.status, 200);
  assert.equal(r.body.name, "Trivia Logistics LLP");
});

test("login ID matching is case-insensitive, same as name matching", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  seedUsers(mock, [{ name: "Trivia Logistics LLP", role: "company", loginId: "Trivia@Trivia.com", password: hashPasswordSalted("password123") }]);

  const r = await attemptLogin("TRIVIA@TRIVIA.COM", "password123");
  assert.equal(r.status, 200);
});

test("a wrong loginId (or wrong name) is rejected, not silently matched to the wrong user", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  seedUsers(mock, [
    { name: "Trivia Logistics LLP", role: "company", loginId: "trivia@trivia.com", password: hashPasswordSalted("password123") },
    { name: "Arctic Reefers Pvt Ltd", role: "company", loginId: "arctic@arctic.com", password: hashPasswordSalted("otherpass1") }
  ]);

  const r = await attemptLogin("arctic@arctic.com", "password123"); // right id, WRONG password
  assert.equal(r.status, 401);
  const r2 = await attemptLogin("nonexistent@x.com", "password123");
  assert.equal(r2.status, 401);
});

test("two users can't collide: one's loginId never accidentally matches another user's name", async () => {
  const mock = createMockSupabase(BASE_URL);
  globalThis.fetch = mock.fetch;
  // "Admin" the plain name, and a company whose loginId happens to equal it — the
  // exact-name user should win when someone types the ambiguous value "Admin".
  seedUsers(mock, [
    { name: "Admin", role: "admin", password: hashPasswordSalted("adminpass1") },
    { name: "Some Company", role: "company", loginId: "Admin", password: hashPasswordSalted("companypw1") }
  ]);
  // This scenario is exactly why the client blocks creating a loginId that
  // collides with another user's name — this test just documents what the
  // server does if it ever happened anyway: first match in the list wins,
  // deterministic either way, never silently authenticates as the wrong role.
  const r = await attemptLogin("Admin", "adminpass1");
  assert.equal(r.status, 200);
  assert.equal(r.body.role, "admin");
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
