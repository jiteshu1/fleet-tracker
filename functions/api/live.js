// Cloudflare Pages Function: /api/live
// Logs into FleetX using credentials stored as environment variables
// (never hardcoded here), then fetches live vehicle data and returns it.
// The FleetX username/password never reach the browser.

import { verify, getBearerToken, jsonResponse, preflightResponse } from "./_auth.js";

export async function onRequestOptions() {
  return preflightResponse();
}

export async function onRequestGet(context) {
  const { request, env } = context;

  // Live vehicle location is real-time company data, not public info — same
  // login requirement as every other endpoint under /api/data.
  const session = verify(getBearerToken(request), env.SESSION_SECRET);
  if (!session) return jsonResponse({ error: "Not logged in, or your session expired. Please log in again." }, 401);

  const FLEETX_USERNAME = env.FLEETX_USERNAME;
  const FLEETX_PASSWORD = env.FLEETX_PASSWORD;
  if (!FLEETX_USERNAME || !FLEETX_PASSWORD) {
    return jsonResponse({ error: "FleetX credentials are not configured on the server." }, 500);
  }

  try {
    // Step 1: log in to FleetX to get an access token
    const loginBody = new URLSearchParams();
    loginBody.set("username", FLEETX_USERNAME);
    loginBody.set("password", FLEETX_PASSWORD);
    loginBody.set("grant_type", "password");

    const loginRes = await fetch("https://api.fleetx.io/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: loginBody.toString()
    });
    if (!loginRes.ok) {
      const text = await loginRes.text();
      return jsonResponse({ error: "FleetX login failed", detail: text.slice(0, 300) }, 502);
    }
    const loginData = await loginRes.json();
    const token = loginData.access_token;
    if (!token) return jsonResponse({ error: "FleetX login did not return a token." }, 502);

    // Step 2: fetch live vehicle data using the token
    const liveRes = await fetch("https://api.fleetx.io/api/v1/analytics/live", {
      method: "GET",
      headers: { "Authorization": "bearer " + token }
    });
    if (!liveRes.ok) {
      const text = await liveRes.text();
      return jsonResponse({ error: "FleetX live data fetch failed", detail: text.slice(0, 300) }, 502);
    }

    const liveData = await liveRes.json();
    return jsonResponse(liveData, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return jsonResponse({ error: "Proxy error", detail: String((err && err.message) || err) }, 500);
  }
}
