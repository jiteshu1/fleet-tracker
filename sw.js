// Minimal service worker — its only job is to make the site installable as
// a PWA. It does not cache app data (the app already talks to Supabase and
// the FleetX proxy for live data, which must always be fresh), it just lets
// the shell (this file itself) respond even on a flaky connection.
const CACHE = "ewr-fleet-shell-v2";

self.addEventListener("install", function(event){
  self.skipWaiting();
});

self.addEventListener("activate", function(event){
  event.waitUntil(self.clients.claim());
});

// Network-first: always try the network so data/updates stay fresh; only
// fall back to a cached copy of the page shell if the device is offline.
self.addEventListener("fetch", function(event){
  if(event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if(url.origin !== location.origin) return; // don't touch cross-origin (Supabase, FleetX, CDNs)

  event.respondWith(
    fetch(event.request).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(cache){ cache.put(event.request, copy); });
      return res;
    }).catch(function(){
      return caches.match(event.request).then(function(cached){
        return cached || caches.match("/");
      });
    })
  );
});
