// Shared helpers for the Cloudflare Pages Functions version of this API.
// Same signing/hashing scheme as the Vercel version (HMAC-SHA256 session
// tokens, scrypt-salted passwords) — only the plumbing changed to fit
// Cloudflare's runtime (Request/Response, env vars) instead of Vercel's
// (req/res, process.env). This file needs the "nodejs_compat" compatibility
// flag enabled on the Pages project (Settings → Functions → Compatibility
// flags) so `node:crypto` and the `Buffer` global are available — without
// that flag, every function below will throw.
import crypto from "node:crypto";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export function jsonResponse(obj, status, extraHeaders) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ "Content-Type": "application/json" }, CORS_HEADERS, extraHeaders || {})
  });
}

export function preflightResponse() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function base64url(buf) {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

export function sign(payloadObj, secret) {
  if (!secret) throw new Error("SESSION_SECRET not configured on the server.");
  const payload = base64url(JSON.stringify(payloadObj));
  const mac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return payload + "." + mac;
}

export function verify(token, secret) {
  if (!secret || !token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, mac] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time comparison so response timing can't leak the correct MAC.
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj;
  try { obj = JSON.parse(fromBase64url(payload).toString("utf8")); } catch (e) { return null; }
  if (!obj || typeof obj.exp !== "number" || Date.now() > obj.exp) return null;
  return obj; // { name, role, exp }
}

export function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

// Salted password hashing (scrypt, built into Node — no extra dependency).
// Format stored in the DB: "scrypt:<saltHex>:<hashHex>". login.js verifies
// this first, then falls back to the older unsalted-sha256 format (and,
// before that, plaintext) so existing accounts keep working and get
// silently upgraded to this stronger format the next time they log in.
export function hashPasswordSalted(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return "scrypt:" + salt + ":" + hash;
}
export function verifyPasswordSalted(password, stored) {
  if (typeof stored !== "string") return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = parts[1];
  const expected = Buffer.from(parts[2], "hex");
  const actual = crypto.scryptSync(String(password), salt, 64);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function getBearerToken(request) {
  const h = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}
