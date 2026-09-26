// Minimal service worker — its only job is to make the site installable as
// a PWA. It does not cache app data (the app already talks to Supabase and
// the FleetX proxy for live data, which must always be fresh), it just lets
// the shell (this file itself) respond even on a flaky connection.
//
// v3: a previous version of this file cached EVERY same-origin GET request,
// including /api/data and /api/live — directly contradicting the comment
// above and the API's own "no-store" intent. That meant per-session,
// per-user API responses (some containing financial/RTGS data) could sit
// in the browser's Cache Storage and, if the network ever failed, be
// served back instead of a fresh authenticated request. /api/ requests are
// now excluded from the service worker entirely — they go straight to the
// network exactly as if this file didn't exist — and old caches (which may
// contain API responses cached by the previous version) are deleted on
// activation so this fix takes effect immediately for anyone who already
// has this app installed, not just new installs.
const CACHE = "ewr-fleet-shell-v3";

self.addEventListener("install", function(event){
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function(keys){
        return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
      })
    ])
  );
});

// Network-first: always try the network so data/updates stay fresh; only
// fall back to a cached copy of the page shell if the device is offline.
self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if(url.origin !== location.origin) return; // don't touch cross-origin (Supabase, FleetX, CDNs)
  if(url.pathname.startsWith("/api/")) return; // never cache or intercept API calls — see the v3 note above

  event.respondWith(
    fetch(event.request).then(function(res){
      if(res.ok){
        var copy = res.clone();
        caches.open(CACHE).then(function(cache){ cache.put(event.request, copy); });
      }
      return res;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){
        return cached || caches.match("/");
      });
    })
  );
});
