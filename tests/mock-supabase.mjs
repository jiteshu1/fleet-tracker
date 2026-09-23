// A tiny in-memory stand-in for the slice of Supabase's PostgREST API that
// functions/api/data.js actually uses against the `app_data` table:
//   GET  /rest/v1/app_data?key=eq.<k>&select=value
//   GET  /rest/v1/app_data?key=like.<prefix>*&select=key
//   POST /rest/v1/app_data   (Prefer: resolution=merge-duplicates)  -> upsert
// Everything else throws, so a test immediately fails loudly if data.js ever
// starts relying on a Supabase feature this mock doesn't know about, rather
// than silently mis-behaving.

export function createMockSupabase(baseUrl) {
  const store = new Map(); // key -> value (both strings)

  async function fetchImpl(url, opts) {
    opts = opts || {};
    const u = new URL(String(url));
    if (u.origin + u.pathname !== baseUrl + "/rest/v1/app_data") {
      throw new Error("mock-supabase: unexpected URL " + url);
    }
    const method = (opts.method || "GET").toUpperCase();

    if (method === "GET") {
      const keyParam = u.searchParams.get("key") || "";
      const select = u.searchParams.get("select") || "value";
      let rows = [];
      if (keyParam.startsWith("eq.")) {
        const k = decodeURIComponent(keyParam.slice(3));
        if (store.has(k)) rows = [{ key: k, value: store.get(k) }];
      } else if (keyParam.startsWith("like.")) {
        // Supabase's `like` filter uses `*` in place of `%`; our data.js
        // only ever calls this as "<prefix>*" (starts-with), so that's all
        // this mock needs to implement.
        let pattern = decodeURIComponent(keyParam.slice(5));
        if (!pattern.endsWith("*")) throw new Error("mock-supabase: only prefix* like-patterns supported, got " + pattern);
        const prefix = pattern.slice(0, -1);
        for (const [k, v] of store.entries()) {
          if (k.startsWith(prefix)) rows.push({ key: k, value: v });
        }
      } else {
        throw new Error("mock-supabase: unsupported key filter " + keyParam);
      }
      rows = rows.map(function (r) {
        const out = {};
        select.split(",").forEach(function (col) { out[col] = r[col]; });
        return out;
      });
      return new Response(JSON.stringify(rows), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (method === "POST") {
      const body = JSON.parse(opts.body);
      store.set(body.key, body.value);
      return new Response(JSON.stringify([body]), { status: 201, headers: { "Content-Type": "application/json" } });
    }

    throw new Error("mock-supabase: unsupported method " + method);
  }

  return {
    fetch: fetchImpl,
    store,
    // test-only helpers, not part of the real Supabase surface
    _get: function (k) { return store.has(k) ? store.get(k) : null; },
    _set: function (k, v) { store.set(k, v); },
    _has: function (k) { return store.has(k); },
    _keys: function () { return Array.from(store.keys()); },
    _reset: function () { store.clear(); }
  };
}
