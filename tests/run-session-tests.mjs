// Tests for the session-persistence fix — this is the root cause behind
// four separately-reported symptoms:
//  1) "Load older data" status never resetting across logout/login
//  2) the table/export only ever showing a small, stale set of trips
//  3) a page refresh forcing a full re-login
//  4) adding a new manager appearing to delete every existing one
// All four traced back to the same thing: the session token only ever
// lived in memory (so a refresh always logged you out), and logout() only
// cleared the session, not the rest of the app's state — so the natural
// workaround (log out, log back in, without refreshing) silently carried
// stale state from one login into the next.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sign } from "../functions/api/_auth.js";

const code = readFileSync(new URL("./session-persistence.extracted.js", import.meta.url), "utf8");
const SESSION_SECRET = "test-secret";

function makeStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _dump: () => Object.fromEntries(m)
  };
}
function makeApi(localStorage) {
  const sandbox = { localStorage, atob: (b64) => Buffer.from(b64, "base64").toString("utf8") };
  const fn = new Function(...Object.keys(sandbox), code + "\nreturn { decodeTokenPayload, persistSession, clearPersistedSession, restoreSession };");
  return fn(...Object.values(sandbox));
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("a real server-issued token (from _auth.js's sign()) decodes correctly client-side", () => {
  const token = sign({ name: "Admin", role: "admin", exp: Date.now() + 3600000 }, SESSION_SECRET);
  const api = makeApi(makeStore());
  const payload = api.decodeTokenPayload(token);
  assert.equal(payload.name, "Admin");
  assert.equal(payload.role, "admin");
  assert.ok(payload.exp > Date.now());
});

test("no persisted session -> restoreSession() returns null, nothing to resume", () => {
  const api = makeApi(makeStore());
  assert.equal(api.restoreSession(), null);
});

test("a valid, not-yet-expired persisted session is restored with its name/role/token", () => {
  const store = makeStore();
  const token = sign({ name: "Trivia Logistics LLP", role: "company", exp: Date.now() + 3600000 }, SESSION_SECRET);
  const api = makeApi(store);
  api.persistSession(token);
  const resumed = api.restoreSession();
  assert.ok(resumed);
  assert.equal(resumed.name, "Trivia Logistics LLP");
  assert.equal(resumed.role, "company");
  assert.equal(resumed.token, token);
});

test("an EXPIRED persisted session is rejected, not silently resumed", () => {
  const store = makeStore();
  const expiredToken = sign({ name: "Admin", role: "admin", exp: Date.now() - 1000 }, SESSION_SECRET);
  const api = makeApi(store);
  api.persistSession(expiredToken);
  assert.equal(api.restoreSession(), null);
});

test("an expired/invalid session is cleared out of storage once found, not left to keep failing silently", () => {
  const store = makeStore();
  const expiredToken = sign({ name: "Admin", role: "admin", exp: Date.now() - 1000 }, SESSION_SECRET);
  const api = makeApi(store);
  api.persistSession(expiredToken);
  api.restoreSession();
  assert.equal(store.getItem("ft-session"), null);
});

test("garbage/corrupted storage content doesn't crash restoreSession, just returns null", () => {
  const store = makeStore();
  store.setItem("ft-session", "not-a-real-token-at-all");
  const api = makeApi(store);
  assert.equal(api.restoreSession(), null);
});

test("clearPersistedSession removes exactly the session key", () => {
  const store = makeStore();
  const token = sign({ name: "Admin", role: "admin", exp: Date.now() + 3600000 }, SESSION_SECRET);
  const api = makeApi(store);
  api.persistSession(token);
  assert.ok(store.getItem("ft-session"));
  api.clearPersistedSession();
  assert.equal(store.getItem("ft-session"), null);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
