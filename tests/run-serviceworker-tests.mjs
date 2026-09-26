// Tests for sw.js — verifying the actual fix, not just reading the file:
// /api/ requests must never be intercepted/cached (the bug that let
// per-user API responses, including financial data, sit in Cache Storage),
// and old cache versions must be purged on activation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const swCode = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

function makeCachesMock() {
  const stores = new Map(); // cacheName -> Map(requestKey -> response)
  function keyFor(req) { return typeof req === "string" ? req : req.url; }
  return {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        put: async (req, res) => { store.set(keyFor(req), res); },
        match: async (req) => store.get(keyFor(req))
      };
    },
    match: async (req) => {
      for (const store of stores.values()) {
        const hit = store.get(keyFor(req));
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name) => stores.delete(name),
    _stores: stores
  };
}

function loadSW({ fetchImpl }) {
  const listeners = {};
  const self_ = {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {}, clients: { claim: async () => {} }
  };
  const caches = makeCachesMock();
  const sandbox = { self: self_, caches, fetch: fetchImpl, location: { origin: "https://fleet-tracker.pages.dev" }, URL, Request, Response };
  new Function(...Object.keys(sandbox), swCode)(...Object.values(sandbox));
  return { listeners, caches };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("(bug, now fixed) /api/data requests are never intercepted or cached", async () => {
  let networkCalls = 0;
  const { listeners, caches } = loadSW({
    fetchImpl: async () => { networkCalls++; return new Response(JSON.stringify({ value: "secret trip data" }), { status: 200 }); }
  });
  const req = new Request("https://fleet-tracker.pages.dev/api/data?key=trips&month=2026-04", { method: "GET" });
  let respondWithCalled = false;
  const event = { request: req, respondWith: () => { respondWithCalled = true; } };
  await listeners.fetch(event);
  assert.equal(respondWithCalled, false, "the service worker must not call respondWith for /api/ paths — it must let the browser handle it directly");
  const cachedKeys = [...caches._stores.values()].flatMap(s => [...s.keys()]);
  assert.equal(cachedKeys.length, 0, "nothing should have been cached");
});

test("(bug, now fixed) /api/live requests are also excluded", async () => {
  const { listeners } = loadSW({ fetchImpl: async () => new Response("{}", { status: 200 }) });
  const req = new Request("https://fleet-tracker.pages.dev/api/live", { method: "GET" });
  let respondWithCalled = false;
  await listeners.fetch({ request: req, respondWith: () => { respondWithCalled = true; } });
  assert.equal(respondWithCalled, false);
});

test("a normal app-shell GET (not /api/) is still cached on success, preserving offline support", async () => {
  const { listeners, caches } = loadSW({ fetchImpl: async () => new Response("<html>shell</html>", { status: 200 }) });
  const req = new Request("https://fleet-tracker.pages.dev/index.html", { method: "GET" });
  let result;
  await listeners.fetch({ request: req, respondWith: (p) => { result = p; } });
  await result;
  const store = caches._stores.get("ewr-fleet-shell-v3");
  assert.ok(store && store.size === 1, "the shell request should be cached");
});

test("a failed (non-ok) non-API response is NOT cached", async () => {
  const { listeners, caches } = loadSW({ fetchImpl: async () => new Response("error", { status: 500 }) });
  const req = new Request("https://fleet-tracker.pages.dev/index.html", { method: "GET" });
  let result;
  await listeners.fetch({ request: req, respondWith: (p) => { result = p; } });
  await result;
  const store = caches._stores.get("ewr-fleet-shell-v3");
  assert.ok(!store || store.size === 0, "a 500 response must not be cached");
});

test("activation deletes old cache versions (so a previously-cached /api/ response from an older SW is purged)", async () => {
  const { listeners, caches } = loadSW({ fetchImpl: async () => new Response("ok") });
  // Simulate a stale v2 cache (from before this fix) that might still contain old /api/ entries.
  await caches.open("ewr-fleet-shell-v2");
  await caches.open("ewr-fleet-shell-v3");
  assert.deepEqual((await caches.keys()).sort(), ["ewr-fleet-shell-v2", "ewr-fleet-shell-v3"]);

  const event = { waitUntil: async (p) => { await p; } };
  await listeners.activate(event);

  assert.deepEqual(await caches.keys(), ["ewr-fleet-shell-v3"], "the old v2 cache must be deleted on activation");
});

test("cross-origin requests (Supabase, FleetX, CDNs) are never touched", async () => {
  const { listeners } = loadSW({ fetchImpl: async () => new Response("ok") });
  const req = new Request("https://some-cdn.example.com/lib.js", { method: "GET" });
  let respondWithCalled = false;
  await listeners.fetch({ request: req, respondWith: () => { respondWithCalled = true; } });
  assert.equal(respondWithCalled, false);
});

// ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const t of tests) {
  try { await t.fn(); pass++; console.log("  ok  " + t.name); }
  catch (e) { fail++; console.log(" FAIL " + t.name); console.log("       " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join("\n       ") : e)); }
}
console.log("\n" + pass + " passed, " + fail + " failed, " + tests.length + " total");
process.exit(fail ? 1 : 0);
