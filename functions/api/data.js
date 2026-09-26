// Cloudflare Pages Function: /api/data
// Every read/write the app makes goes through here instead of hitting
// Supabase directly from the browser. It requires a valid session token
// (issued by /api/login) and uses the SUPABASE SERVICE ROLE key server-side
// — that key never reaches the browser, and Supabase itself can be locked
// down to deny the old public anon key entirely.
//
// Scope of what this enforces (being explicit about the boundary):
// - No token, no access at all — this closes the main hole (anyone with the
//   page URL could previously read/write everything with zero login).
// - Role-based checks on WHICH keys a role may write (e.g. only admin may
//   write "users", "companyLogo", "gpsSyncUrl", "partition_status").
// - For "company" logins specifically, real server-side row-level scoping:
//   a company session can only ever READ its own company's slice of
//   trucks/trips/expenses/managers/drivers/branches/rtgs_entries/companies,
//   and can only WRITE trips/expenses/rtgs_entries/branch_expenses, scoped
//   the same way.
// - It does NOT (yet) re-check fine-grained per-record ownership server-side
//   for the other, internal roles (e.g. "this manager may only edit trucks
//   in their own fleet") — those collections are stored as one JSON blob
//   per key. The app's own UI still enforces it for those roles, so this
//   closes the "totally anonymous" hole without yet being a full
//   re-implementation of every ownership rule for every role.
//
// Concurrent-save handling: every write for a "record collection" key
// (trips, trucks, drivers, etc.) is a SCOPED 3-WAY MERGE, not a blind
// overwrite. The browser sends its own last-known baseline alongside its
// edited copy; the server fetches the true current value fresh and layers
// only the browser's own added/edited/removed records on top of it. That
// means: (a) two people saving around the same moment don't silently erase
// each other's work, since anything the saving browser didn't touch is left
// exactly as it was in the database, not overwritten with a stale copy, and
// (b) a scoped session (company/branch) can freely add/edit/delete within
// its own scope without needing to echo back every record outside that
// scope unchanged — which used to be required, but is impossible for a
// "company" login to do correctly, since its own GET already filtered those
// other records out before the browser ever saw them.
//
// ---------------------------------------------------------------------
// MONTH PARTITIONING (added on top of the above, nothing above changed)
// ---------------------------------------------------------------------
// trips / expenses / rtgs_entries / branch_expenses are the four datasets
// that actually grow with volume. Each can now be stored either as:
//   - "single"      — one big blob under the plain key (e.g. "trips"),
//                      exactly the original behaviour, OR
//   - "partitioned" — one small blob per calendar month under
//                      "<key>_<YYYY-MM>" (plus a "<key>_unknown" bucket for
//                      records with a missing/malformed date), keyed off
//                      each record's own "date" field.
// Which mode a dataset is in lives in a tiny settings blob under the key
// "partition_status" (JSON: {trips:"partitioned", expenses:"single", ...}),
// admin-writable, defaulting every dataset to "partitioned" when that key
// doesn't exist yet. This exists purely as an instant rollback switch during
// early real-world usage — flip one dataset back to "single" and every
// request for it goes through the exact original single-blob code path
// below, untouched.
//
// In "partitioned" mode:
//   - GET requires ?month=YYYY-MM (or "unknown") for one chunk, returning
//     {value: ...} exactly like the single-blob shape so callers that only
//     ever touch one month at a time don't need to change; or ?months=a,b,c
//     for a batch, returning {values: {a: ..., b: ..., ...}}.
//   - GET ?discoverMonths=1 lists which monthly chunks actually exist for a
//     dataset (a cheap Supabase "key LIKE" lookup — key names only, not
//     values), for building month-pickers / "load older data" UI.
//   - POST requires a "month" field alongside the usual key/value/baseline;
//     the write is validated so every record in the payload's computed
//     month actually matches the target chunk (catches a client bug filing
//     a record into the wrong month before it corrupts a chunk), then goes
//     through the exact same scoped-merge / wipe-guard / auto-backup logic
//     as the single-blob path always has, just scoped to "<key>_<month>"
//     instead of "<key>".
//   - Moving a record to a different month (its date changed) is NOT a
//     special case here — the client does it as two ordinary chunk writes:
//     insert into the new month's chunk first, then remove from the old
//     month's chunk, in that order (so a mid-way failure leaves a harmless
//     duplicate rather than a silently vanished record).

import { verify, getBearerToken, hashPasswordSalted, jsonResponse, preflightResponse } from "./_auth.js";

const PARTITIONED_DATASETS = ["trips", "expenses", "rtgs_entries", "branch_expenses"];

const ADMIN_ONLY_KEYS = ["users", "company_logo", "gps_sync_url", "branches", "rtgs_entries", "companies", "branch_expenses", "partition_status", "drivers", "managers"];
const KNOWN_KEYS = ["users", "trucks", "drivers", "managers", "trips", "expenses", "company_logo", "gps_sync_url", "photos", "branches", "rtgs_entries", "companies", "branch_expenses", "partition_status"];

const COMPANY_WRITABLE_KEYS = ["trips", "expenses", "rtgs_entries", "branch_expenses"];

const RECORD_KEYS = ["users", "trucks", "drivers", "managers", "trips", "branches", "rtgs_entries", "companies", "expenses", "branch_expenses"];
const MERGEABLE_KEYS = RECORD_KEYS.filter(function (k) { return k !== "users"; });

const MONTH_RE = /^\d{4}-\d{2}$/;
function isValidMonth(m) { return m === "unknown" || MONTH_RE.test(String(m)); }
function monthKeyFromDateStr(dateStr) {
  if (typeof dateStr !== "string") return "unknown";
  var m = /^(\d{4}-\d{2})-\d{2}/.exec(dateStr.trim());
  return m ? m[1] : "unknown";
}
function chunkKey(dataset, month) { return dataset + "_" + month; }

function defaultPartitionStatus() {
  var s = {};
  PARTITIONED_DATASETS.forEach(function (k) { s[k] = "partitioned"; });
  return s;
}

function recordCount(key, rawValue) {
  if (!rawValue) return 0;
  let parsed;
  try { parsed = JSON.parse(rawValue); } catch (e) { return 0; }
  if (key === "expenses") {
    if (!parsed || typeof parsed !== "object") return 0;
    return ["fuel", "service", "adblue", "salary", "challan"].reduce(function (s, t) { return s + (Array.isArray(parsed[t]) ? parsed[t].length : 0); }, 0);
  }
  return Array.isArray(parsed) ? parsed.length : 0;
}

// Every record in `incoming` (a full-chunk payload) must have a date that
// actually maps to `month`, or the write is rejected outright rather than
// silently filing a record into the wrong monthly chunk.
function findRecordsOutOfMonth(key, incoming, month) {
  var bad = [];
  function check(list) {
    (list || []).forEach(function (r) {
      if (!r) return;
      var m = monthKeyFromDateStr(r.date);
      if (m !== month) bad.push((r.id || "?") + " (date=" + (r.date || "none") + ", expected month " + month + ")");
    });
  }
  if (key === "expenses") {
    ["fuel", "service", "adblue", "salary", "challan"].forEach(function (t) { check(incoming[t]); });
  } else {
    check(incoming);
  }
  return bad;
}

// Merges one browser's edit of a record array into whatever is currently in
// the database, instead of blindly replacing it. `baseline` is what that
// browser loaded before making its edits; `incoming` is its fully edited
// copy; `freshCurrent` is fetched fresh from the database right now. Every
// record the browser is trying to add, change, or remove must satisfy
// `inScopeFn`, or the whole write is rejected.
function scopedMerge(freshCurrent, baseline, incoming, inScopeFn, idFn) {
  idFn = idFn || function (r) { return r.id; };
  const baselineById = {}; (baseline || []).forEach(function (r) { if (r) baselineById[idFn(r)] = r; });
  const incomingById = {}; (incoming || []).forEach(function (r) { if (r) incomingById[idFn(r)] = r; });
  const result = {}; (freshCurrent || []).forEach(function (r) { if (r) result[idFn(r)] = r; });

  for (const id in incomingById) {
    const rec = incomingById[id];
    const wasInBaseline = baselineById.hasOwnProperty(id);
    const changed = !wasInBaseline || JSON.stringify(baselineById[id]) !== JSON.stringify(rec);
    if (changed) {
      if (!inScopeFn(rec)) return { ok: false };
      result[id] = rec;
    }
  }
  for (const id in baselineById) {
    if (!incomingById.hasOwnProperty(id)) {
      if (!inScopeFn(baselineById[id])) return { ok: false };
      delete result[id];
    }
  }
  return { ok: true, merged: Object.keys(result).map(function (id) { return result[id]; }) };
}

// Filters/redacts a raw JSON string value down to what a "company" session
// is allowed to see, for a given dataset key. Extracted so it can be applied
// identically whether the value came from a single blob or one month's chunk.
function scopeValueForCompany(key, value, companyId, scope) {
  try {
    if (key === "trucks") {
      const trucks = JSON.parse(value);
      return JSON.stringify(trucks.filter(function (t) { return companyId && t.companyId === companyId; }));
    } else if (key === "trips") {
      const trips = JSON.parse(value);
      return JSON.stringify(trips.filter(function (tr) { return scope.truckIds[tr.truckId]; }));
    } else if (key === "expenses") {
      const exp = JSON.parse(value);
      ["fuel", "service", "adblue", "challan"].forEach(function (type) {
        exp[type] = (exp[type] || []).filter(function (e) { return scope.truckIds[e.truckId]; });
      });
      exp.salary = (exp.salary || []).filter(function (e) { return scope.driverNames[e.driverName]; });
      return JSON.stringify(exp);
    } else if (key === "managers") {
      const managers = JSON.parse(value);
      const scoped = managers.map(function (m) {
        const ids = (m.vehicleIds || []).filter(function (id) { return scope.truckIds[id]; });
        return ids.length ? Object.assign({}, m, { vehicleIds: ids }) : null;
      }).filter(Boolean);
      return JSON.stringify(scoped);
    } else if (key === "drivers") {
      const drivers = JSON.parse(value);
      return JSON.stringify(drivers.filter(function (d) { return scope.driverNames[d.name]; }));
    } else if (key === "branches") {
      return value; // Branches are shared infrastructure, not owned by one company.
    } else if (key === "rtgs_entries") {
      const entries = JSON.parse(value);
      return JSON.stringify(entries.filter(function (r) { return companyId && r.companyId === companyId; }));
    } else if (key === "branch_expenses") {
      const bexp = JSON.parse(value);
      return JSON.stringify(bexp.filter(function (r) { return companyId && r.companyId === companyId; }));
    } else if (key === "companies") {
      const companies = JSON.parse(value);
      return JSON.stringify(companies.filter(function (c) { return companyId && c.id === companyId; }));
    }
    return value;
  } catch (e) {
    return key === "expenses" ? JSON.stringify({}) : JSON.stringify([]);
  }
}

export async function onRequestOptions() {
  return preflightResponse();
}

async function setup(context) {
  const { request, env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || "https://rdqgnthnkzkatmisausk.supabase.co";
  const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY || !env.SESSION_SECRET) {
    return { error: jsonResponse({ error: "Server is not configured (missing SUPABASE_SERVICE_KEY or SESSION_SECRET)." }, 500) };
  }

  const session = verify(getBearerToken(request), env.SESSION_SECRET);
  if (!session) {
    return { error: jsonResponse({ error: "Not logged in, or your session expired. Please log in again." }, 401) };
  }

  async function fetchRow(key) {
    const r = await fetch(SUPABASE_URL + "/rest/v1/app_data?key=eq." + encodeURIComponent(key) + "&select=value", {
      headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY }
    });
    if (!r.ok) {
      // A failed read must NEVER be silently treated as "no data exists" —
      // every caller does `curVal ? JSON.parse(curVal) : []`, so a
      // transient database error masquerading as an empty dataset could
      // let a subsequent merge+write wipe out real records that simply
      // couldn't be read a moment ago (and would also fool the wipe-guard
      // below, since it would compute curCount=0 from the same false
      // "empty" read). Throwing here aborts the whole request instead —
      // it's caught by the outer try/catch and turned into a clean error
      // response, with nothing written.
      throw new Error("Database read failed for '" + key + "' (status " + r.status + ").");
    }
    const rows = await r.json();
    return rows.length ? rows[0].value : null;
  }

  async function fetchKeysByPrefix(prefix) {
    const r = await fetch(SUPABASE_URL + "/rest/v1/app_data?key=like." + encodeURIComponent(prefix) + "*&select=key", {
      headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY }
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return rows.map(function (row) { return row.key; });
  }

  async function getPartitionStatus() {
    const raw = await fetchRow("partition_status");
    let stored = {};
    if (raw) { try { stored = JSON.parse(raw) || {}; } catch (e) { stored = {}; } }
    const result = defaultPartitionStatus();
    PARTITIONED_DATASETS.forEach(function (k) {
      if (stored[k] === "single" || stored[k] === "partitioned") result[k] = stored[k];
    });
    return result;
  }

  let cachedCompanyId;
  async function resolveCompanyId() {
    if (session.role !== "company") return null;
    if (cachedCompanyId !== undefined) return cachedCompanyId;
    const value = await fetchRow("companies");
    let companies = [];
    try { companies = value ? JSON.parse(value) : []; } catch (e) { companies = []; }
    const match = companies.find(function (c) { return (c.name || "").toLowerCase() === session.name.toLowerCase(); });
    cachedCompanyId = match ? match.id : null;
    return cachedCompanyId;
  }

  async function companyTruckScope(companyId) {
    const trucksVal = await fetchRow("trucks");
    const trucks = trucksVal ? JSON.parse(trucksVal) : [];
    const truckIds = {}, driverNames = {};
    trucks.forEach(function (t) {
      if (companyId && t.companyId === companyId) {
        truckIds[t.id] = true;
        if (t.driverName) driverNames[t.driverName] = true;
      }
    });
    return { truckIds: truckIds, driverNames: driverNames };
  }

  return { SUPABASE_URL, SERVICE_KEY, session, fetchRow, fetchKeysByPrefix, getPartitionStatus, resolveCompanyId, companyTruckScope };
}

export async function onRequestGet(context) {
  const ctx = await setup(context);
  if (ctx.error) return ctx.error;
  const { SUPABASE_URL, SERVICE_KEY, session, fetchRow, fetchKeysByPrefix, getPartitionStatus, resolveCompanyId, companyTruckScope } = ctx;

  try {
    const url = new URL(context.request.url);
    const key = String(url.searchParams.get("key") || "");
    if (!KNOWN_KEYS.includes(key)) return jsonResponse({ error: "Unknown key." }, 400);

    if (PARTITIONED_DATASETS.includes(key)) {
      const partitionStatus = await getPartitionStatus();
      if (partitionStatus[key] === "partitioned") {
        if (url.searchParams.get("discoverMonths") === "1") {
          const keys = await fetchKeysByPrefix(key + "_");
          const prefixLen = (key + "_").length;
          const months = keys
            .map(function (k) { return k.slice(prefixLen); })
            .filter(isValidMonth);
          months.sort();
          return jsonResponse({ months: months }, 200, { "Cache-Control": "no-store" });
        }

        const monthsParam = url.searchParams.get("months");
        const monthParam = url.searchParams.get("month");
        let monthList;
        if (monthsParam) { monthList = monthsParam.split(",").map(function (s) { return s.trim(); }).filter(Boolean); }
        else if (monthParam) { monthList = [monthParam]; }
        else { return jsonResponse({ error: "This dataset is partitioned by month — pass ?month=YYYY-MM (or 'unknown') or ?months=YYYY-MM,YYYY-MM,..." }, 400); }

        const badMonths = monthList.filter(function (m) { return !isValidMonth(m); });
        if (badMonths.length) return jsonResponse({ error: "Invalid month(s): " + badMonths.join(", ") }, 400);

        let companyId = null, scope = null;
        if (session.role === "company") {
          companyId = await resolveCompanyId();
          scope = await companyTruckScope(companyId);
        }

        const values = {};
        for (const m of monthList) {
          let raw = await fetchRow(chunkKey(key, m));
          if (session.role === "company" && raw) {
            raw = scopeValueForCompany(key, raw, companyId, scope);
          }
          values[m] = raw;
        }

        if (monthsParam) return jsonResponse({ values: values }, 200, { "Cache-Control": "no-store" });
        return jsonResponse({ value: values[monthList[0]] }, 200, { "Cache-Control": "no-store" });
      }
      // partitionStatus[key] === "single" -> fall through to the legacy path below, unchanged.
    }

    // ---- Legacy single-blob path: non-partitioned keys, AND any partitioned
    // dataset currently flipped to "single" mode. Identical to the original
    // pre-partitioning behaviour. ----
    const dbRes = await fetch(SUPABASE_URL + "/rest/v1/app_data?key=eq." + encodeURIComponent(key) + "&select=value", {
      headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY }
    });
    if (!dbRes.ok) return jsonResponse({ error: "Database read failed." }, 502);
    const rows = await dbRes.json();
    let value = rows.length ? rows[0].value : null;

    if (key === "users" && value) {
      try {
        const users = JSON.parse(value);
        users.forEach(function (u) { delete u.password; });
        value = JSON.stringify(users);
      } catch (e) {}
    }

    if (session.role === "company" && value) {
      const companyId = await resolveCompanyId();
      const scope = await companyTruckScope(companyId);
      value = scopeValueForCompany(key, value, companyId, scope);
    }

    return jsonResponse({ value: value }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return jsonResponse({ error: "Data proxy error", detail: String((err && err.message) || err) }, 500);
  }
}

export async function onRequestPost(context) {
  const ctx = await setup(context);
  if (ctx.error) return ctx.error;
  const { SUPABASE_URL, SERVICE_KEY, session, fetchRow, getPartitionStatus, resolveCompanyId, companyTruckScope } = ctx;

  try {
    let body;
    try { body = await context.request.json(); } catch (e) { body = {}; }
    const key = String((body && body.key) || "");
    let value = body && body.value;
    const hasBaseline = typeof (body && body.baseline) === "string";
    const baselineRaw = hasBaseline ? body.baseline : null;

    if (!KNOWN_KEYS.includes(key)) return jsonResponse({ error: "Unknown key." }, 400);
    if (typeof value !== "string") return jsonResponse({ error: "Value must be a JSON string." }, 400);

    if (session.role === "company" && !COMPANY_WRITABLE_KEYS.includes(key)) {
      return jsonResponse({ error: "A company login can only manage trips, expenses, RTGS entries, and branch expenses." }, 403);
    }

    if (ADMIN_ONLY_KEYS.filter(function (k) { return k !== "users" && k !== "rtgs_entries" && k !== "branch_expenses"; }).includes(key) && session.role !== "admin") {
      return jsonResponse({ error: "Only an admin can change this." }, 403);
    }

    if (key === "users") {
      let incoming;
      try { incoming = JSON.parse(value); } catch (e) { return jsonResponse({ error: "Malformed users data." }, 400); }
      let rejectShortPassword = null;

      const curValUsers = await fetchRow("users");
      const current = curValUsers ? JSON.parse(curValUsers) : [];
      const currentByName = {};
      current.forEach(function (u) { currentByName[u.name.toLowerCase()] = u; });

      if (session.role !== "admin") {
        // A non-admin may ONLY change their own password — nothing else,
        // for themselves or anyone else. This used to only compare
        // name+role for OTHER users (silently ignoring their loginId,
        // mustChangePassword, and — critically — their password field),
        // and skipped every check on the caller's OWN record entirely.
        // Together those meant a non-admin could: (a) send {role:"admin"}
        // for themselves and it would be accepted, and (b) include a fresh
        // plaintext password for ANY other user's record — including
        // admin's — and it would be hashed and applied, since nothing here
        // ever looked at u.password for a record that wasn't the caller's
        // own. That second one is a full account-takeover path, not just a
        // privilege-escalation one.
        const onlySelfChanged = incoming.every(function (u) {
          const key2 = String(u.name || "").toLowerCase();
          const existing = currentByName[key2];
          if (!existing) return false; // a non-admin can't add or rename users
          const isSelf = key2 === session.name.toLowerCase();
          const nonPasswordFieldsMatch = existing.name === u.name && existing.role === u.role &&
            (u.loginId || "") === (existing.loginId || "") &&
            !!u.mustChangePassword === !!existing.mustChangePassword;
          if (!nonPasswordFieldsMatch) return false;
          if (!isSelf && typeof u.password === "string" && u.password) return false; // never allowed to set anyone else's password
          return true;
        });
        const sameCount = incoming.length === current.length;
        if (!onlySelfChanged || !sameCount) {
          return jsonResponse({ error: "You can only change your own password here." }, 403);
        }
      }

      const merged = incoming.map(function (u) {
        if (typeof u.password === "string" && u.password) {
          if (u.password.length < 8) { rejectShortPassword = u.name; }
          return Object.assign({}, u, { password: hashPasswordSalted(u.password) });
        }
        const existing = currentByName[u.name.toLowerCase()];
        return Object.assign({}, u, { password: existing ? existing.password : undefined });
      });
      if (rejectShortPassword) return jsonResponse({ error: "Password must be at least 8 characters (" + rejectShortPassword + ")." }, 400);
      if (merged.some(function (u) { return !u.password; })) {
        return jsonResponse({ error: "Every user must have a password." }, 400);
      }
      value = JSON.stringify(merged);

      const writeResU = await fetch(SUPABASE_URL + "/rest/v1/app_data", {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ key: key, value: value })
      });
      if (!writeResU.ok) return jsonResponse({ error: "Database write failed." }, 502);
      const scrubbed = merged.map(function (u) { const c = Object.assign({}, u); delete c.password; return c; });
      return jsonResponse({ ok: true, value: JSON.stringify(scrubbed) }, 200);
    }

    if (key === "partition_status") {
      let parsedStatus;
      try { parsedStatus = JSON.parse(value); } catch (e) { return jsonResponse({ error: "Malformed partition_status JSON." }, 400); }
      if (!parsedStatus || typeof parsedStatus !== "object" || Array.isArray(parsedStatus)) {
        return jsonResponse({ error: "partition_status must be a JSON object." }, 400);
      }
      for (const pk in parsedStatus) {
        if (!PARTITIONED_DATASETS.includes(pk)) return jsonResponse({ error: "Unknown dataset '" + pk + "' in partition_status." }, 400);
        if (parsedStatus[pk] !== "single" && parsedStatus[pk] !== "partitioned") {
          return jsonResponse({ error: "partition_status['" + pk + "'] must be 'single' or 'partitioned'." }, 400);
        }
      }
      // Falls through to the generic blind-overwrite write at the bottom —
      // this is a small settings object, not a record collection, so it
      // doesn't go through scopedMerge/recordCount/backup like the others.
      const writeResP = await fetch(SUPABASE_URL + "/rest/v1/app_data", {
        method: "POST",
        headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY, "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ key: key, value: value })
      });
      if (!writeResP.ok) return jsonResponse({ error: "Database write failed." }, 502);
      return jsonResponse({ ok: true, value: value }, 200);
    }

    // Decide which physical row this write targets: the plain key for a
    // non-partitioned dataset (or a partitioned one currently in "single"
    // mode), or "<key>_<month>" for a partitioned dataset in "partitioned"
    // mode. Everything below is otherwise identical to the pre-partitioning
    // logic, just aimed at `storageKey` instead of `key`.
    const isPartitionedDataset = PARTITIONED_DATASETS.includes(key);
    let mode = "single";
    let month = null;
    if (isPartitionedDataset) {
      const partitionStatus = await getPartitionStatus();
      mode = partitionStatus[key];
      if (mode === "partitioned") {
        month = String((body && body.month) || "");
        if (!isValidMonth(month)) {
          return jsonResponse({ error: "A valid 'month' (YYYY-MM, or 'unknown') is required for this dataset in partitioned mode." }, 400);
        }
      }
    }
    const storageKey = (isPartitionedDataset && mode === "partitioned") ? chunkKey(key, month) : key;

    if (MERGEABLE_KEYS.includes(key)) {
      let incoming;
      try { incoming = JSON.parse(value); } catch (e) { return jsonResponse({ error: "Malformed data." }, 400); }

      if (isPartitionedDataset && mode === "partitioned") {
        const badRecords = findRecordsOutOfMonth(key, incoming, month);
        if (badRecords.length) {
          return jsonResponse({ error: "These records don't belong in month '" + month + "': " + badRecords.slice(0, 5).join("; ") + (badRecords.length > 5 ? " (+" + (badRecords.length - 5) + " more)" : "") }, 400);
        }
      }

      if (key === "expenses") {
        const types = ["fuel", "service", "adblue", "salary", "challan"];
        const curValExp = await fetchRow(storageKey);
        const freshCurrentExp = curValExp ? JSON.parse(curValExp) : {};
        const baselineExp = baselineRaw ? (function () { try { return JSON.parse(baselineRaw); } catch (e) { return {}; } })() : {};

        let inScopeFn = function () { return true; };
        let scopeErrorMsg = null;
        if (session.role === "company") {
          const companyId = await resolveCompanyId();
          const scope = await companyTruckScope(companyId);
          inScopeFn = function (r) { return !!scope.truckIds[r.truckId]; };
          scopeErrorMsg = "You can only add or change expenses for your own company's vehicles.";
          if (JSON.stringify(baselineExp.salary || []) !== JSON.stringify(incoming.salary || [])) {
            return jsonResponse({ error: "You can only add or change expenses for your own company's vehicles (salary entries aren't editable here)." }, 403);
          }
        }

        const mergedExp = {};
        for (const t of types) {
          if (session.role === "company" && t === "salary") { mergedExp.salary = freshCurrentExp.salary || []; continue; }
          const r = scopedMerge(freshCurrentExp[t] || [], baselineExp[t] || [], incoming[t] || [], inScopeFn);
          if (!r.ok) return jsonResponse({ error: scopeErrorMsg || "You can't change that." }, 403);
          mergedExp[t] = r.merged;
        }
        value = JSON.stringify(mergedExp);
      } else {
        const curVal = await fetchRow(storageKey);
        const freshCurrent = curVal ? JSON.parse(curVal) : [];
        const baseline = baselineRaw ? (function () { try { return JSON.parse(baselineRaw); } catch (e) { return []; } })() : [];

        let inScopeFn = function () { return true; };
        let scopeErrorMsg = "You can't change that.";

        if (key === "trips" && session.role === "company") {
          const companyId = await resolveCompanyId();
          const scope = await companyTruckScope(companyId);
          inScopeFn = function (r) { return !!scope.truckIds[r.truckId]; };
          scopeErrorMsg = "You can only add or change trips for your own company's vehicles.";
        } else if (key === "rtgs_entries" && session.role !== "admin") {
          if (session.role !== "branch" && session.role !== "company") {
            return jsonResponse({ error: "Only an admin, a branch login, or a company login can change this." }, 403);
          }
          if (session.role === "branch") {
            inScopeFn = function (r) { return r.branch === session.name; };
            scopeErrorMsg = "You can only add or change entries for your own branch.";
          } else {
            const companyId = await resolveCompanyId();
            inScopeFn = function (r) { return !!companyId && r.companyId === companyId; };
            scopeErrorMsg = "You can only add or change entries for your own company's branches.";
          }
        } else if (key === "branch_expenses" && session.role !== "admin") {
          if (session.role !== "branch" && session.role !== "company") {
            return jsonResponse({ error: "Only an admin, a branch login, or a company login can change this." }, 403);
          }
          if (session.role === "branch") {
            inScopeFn = function (r) { return r.branch === session.name; };
            scopeErrorMsg = "You can only add or change expenses for your own branch.";
          } else {
            const companyId = await resolveCompanyId();
            inScopeFn = function (r) { return !!companyId && r.companyId === companyId; };
            scopeErrorMsg = "You can only add or change expenses for your own company's branches.";
          }
        } else if (key === "trucks" && session.role !== "admin") {
          // Previously trucks had NO server-side ownership check at all —
          // any authenticated non-admin role (driver, manager, branch,
          // viewer) could overwrite the entire fleet via a direct API
          // call, even though the UI only ever lets a driver touch their
          // own truck and a manager touch their own fleet. This mirrors
          // the client's own canEditTruck() rule, server-side. (Company
          // logins are already rejected earlier, above, since "trucks"
          // isn't in COMPANY_WRITABLE_KEYS.)
          if (session.role === "driver") {
            // Ownership must come from the CURRENT database state, not
            // from whatever the caller submits — otherwise a driver could
            // "claim" someone else's truck simply by setting its
            // driverName to their own name in the payload they're sending.
            const ownedIds = {};
            (freshCurrent || []).forEach(function (t) {
              if (t.driverName && t.driverName.toLowerCase() === session.name.toLowerCase()) ownedIds[t.id] = true;
            });
            inScopeFn = function (r) { return !!ownedIds[r.id]; };
            scopeErrorMsg = "You can only change the vehicle assigned to you.";
          } else if (session.role === "manager") {
            const managersVal = await fetchRow("managers");
            const managers = managersVal ? JSON.parse(managersVal) : [];
            const mgr = managers.find(function (m) { return m.name === session.name; });
            const ownedIds = {};
            ((mgr && mgr.vehicleIds) || []).forEach(function (id) { ownedIds[id] = true; });
            inScopeFn = function (r) { return !!ownedIds[r.id]; };
            scopeErrorMsg = "You can only change vehicles in your own fleet.";
          } else {
            return jsonResponse({ error: "Only an admin, driver, or manager login can change this." }, 403);
          }
        }

        const r = scopedMerge(freshCurrent, baseline, incoming, inScopeFn);
        if (!r.ok) return jsonResponse({ error: scopeErrorMsg }, 403);
        value = JSON.stringify(r.merged);
      }
    }

    if (RECORD_KEYS.includes(key)) {
      const curValForGuard = await fetchRow(storageKey);
      const curCount = recordCount(key, curValForGuard);
      const newCount = recordCount(key, value);
      // This blanket "don't let a whole dataset collapse to zero" block is
      // preserved EXACTLY for non-partitioned keys and for a partitioned
      // dataset currently in "single" mode — unchanged from the original
      // behaviour, on purpose.
      //
      // It is deliberately NOT applied to a genuinely month-partitioned
      // write, because it would fire on routine, safe events: deleting (or
      // moving elsewhere) the very last record remaining in an old month's
      // chunk is normal at month granularity, unlike a whole multi-thousand
      // record dataset going to zero. It's also provably unnecessary here:
      // scopedMerge() above can only remove a record from the result if
      // that exact id was present in the caller's own baseline and absent
      // from its incoming copy, individually re-checked against inScopeFn —
      // so a chunk can only reach zero through deletions the merge itself
      // already confirmed were deliberate, never through a stale/blank
      // client baseline (that case leaves freshCurrent's records untouched,
      // see scopedMerge). The `__prev` backup below still runs unconditionally
      // either way, so even a legitimate empty-out remains one restore away.
      if (!(isPartitionedDataset && mode === "partitioned") && curCount > 0 && newCount === 0) {
        return jsonResponse({ error: "This would replace " + curCount + " existing " + key + " record(s) with zero, so it's been blocked to protect your data. If this is really intentional, delete records individually instead." }, 409);
      }
      if (curValForGuard) {
        await fetch(SUPABASE_URL + "/rest/v1/app_data", {
          method: "POST",
          headers: {
            "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
            "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify({ key: storageKey + "__prev", value: curValForGuard })
        }).catch(function () {});
      }
    }

    const writeRes = await fetch(SUPABASE_URL + "/rest/v1/app_data", {
      method: "POST",
      headers: {
        "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"
      },
      body: JSON.stringify({ key: storageKey, value: value })
    });
    if (!writeRes.ok) return jsonResponse({ error: "Database write failed." }, 502);
    const respBody = { ok: true, value: value };
    if (isPartitionedDataset && mode === "partitioned") respBody.month = month;
    return jsonResponse(respBody, 200);
  } catch (err) {
    return jsonResponse({ error: "Data proxy error", detail: String((err && err.message) || err) }, 500);
  }
}
