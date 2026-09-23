// Cloudflare Pages Function: /api/login
// Verifies name+password against the 'users' record in Supabase using the
// SERVICE ROLE key (server-only, never sent to the browser), then issues a
// signed session token. The browser never sees the users list or any
// password hash — this is what stops someone from reading everyone's
// (hashed) passwords just by opening the page.

import { sign, sha256Hex, hashPasswordSalted, verifyPasswordSalted, jsonResponse, preflightResponse } from "./_auth.js";

export async function onRequestOptions() {
  return preflightResponse();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const SUPABASE_URL = env.SUPABASE_URL || "https://rdqgnthnkzkatmisausk.supabase.co";
  const SERVICE_KEY = env.SUPABASE_SERVICE_KEY;
  const SESSION_SECRET = env.SESSION_SECRET;
  if (!SERVICE_KEY || !SESSION_SECRET) {
    return jsonResponse({ error: "Server is not configured (missing SUPABASE_SERVICE_KEY or SESSION_SECRET)." }, 500);
  }

  let body;
  try { body = await request.json(); } catch (e) { body = {}; }
  const name = String((body && body.name) || "").trim();
  const password = String((body && body.password) || "");
  if (!name || !password) return jsonResponse({ error: "Name and password required." }, 400);

  try {
    const dbRes = await fetch(SUPABASE_URL + "/rest/v1/app_data?key=eq.users&select=value", {
      headers: { "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY }
    });
    if (!dbRes.ok) return jsonResponse({ error: "Could not reach the database." }, 502);
    const rows = await dbRes.json();
    let users = rows.length ? JSON.parse(rows[0].value) : [];

    // First-ever run: nobody exists yet, so bootstrap the default admin
    // account here (mirrors the app's original first-boot behaviour) —
    // this is the one write that's allowed with no prior authentication,
    // since there is by definition no one to authenticate as yet.
    if (users.length === 0) {
      users = [{ name: "Admin", password: hashPasswordSalted("admin123"), role: "admin", mustChangePassword: true }];
      await fetch(SUPABASE_URL + "/rest/v1/app_data", {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({ key: "users", value: JSON.stringify(users) })
      });
    }

    const u = users.find(function (x) {
      // Matches either the separate, short "login ID" (if the admin set
      // one for this user) or the full name — so existing users with no
      // login ID keep working exactly as before, and new ones can log in
      // with a short id instead of typing their full name every time.
      if (x.loginId && String(x.loginId).toLowerCase() === name.toLowerCase()) return true;
      return String(x.name).toLowerCase() === name.toLowerCase();
    });
    if (!u) return jsonResponse({ error: "No match. Check name and password, or ask your admin to add you." }, 401);

    const candidateHash = sha256Hex(password);
    const isSalted = typeof u.password === "string" && u.password.indexOf("scrypt:") === 0;
    const looksHashed = !isSalted && typeof u.password === "string" && /^[a-f0-9]{64}$/.test(u.password);
    let ok = false, upgradedHash = null;
    if (isSalted) {
      ok = verifyPasswordSalted(password, u.password);
      // already on the strong format — nothing to upgrade
    } else if (looksHashed) {
      // Older unsalted-sha256 format — verify it, then upgrade to salted scrypt.
      ok = u.password === candidateHash;
      if (ok) upgradedHash = hashPasswordSalted(password);
    } else {
      // Legacy plain-text password predating any hashing — verify it once,
      // then upgrade straight to the strong salted format.
      ok = u.password === password;
      if (ok) upgradedHash = hashPasswordSalted(password);
    }
    if (!ok) return jsonResponse({ error: "No match. Check name and password, or ask your admin to add you." }, 401);

    if (upgradedHash) {
      u.password = upgradedHash;
      await fetch(SUPABASE_URL + "/rest/v1/app_data", {
        method: "POST",
        headers: {
          "apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY,
          "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"
        },
        body: JSON.stringify({ key: "users", value: JSON.stringify(users) })
      }).catch(function () {});
    }

    const exp = Date.now() + 1000 * 60 * 60 * 18; // 18 hour session
    const token = sign({ name: u.name, role: u.role, exp: exp }, SESSION_SECRET);
    return jsonResponse(
      { token: token, name: u.name, role: u.role, mustChangePassword: !!u.mustChangePassword },
      200,
      { "Cache-Control": "no-store" }
    );
  } catch (err) {
    return jsonResponse({ error: "Login error", detail: String((err && err.message) || err) }, 500);
  }
}
