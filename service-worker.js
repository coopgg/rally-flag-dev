/* ============================================================
   Minimal service worker — exists mainly so Chrome/Edge will treat
   the site as installable. Caches the app shell for offline access,
   but every same-origin GET is network-first: the site pulls live
   data from Bungie's API constantly (Xûr, nightfall, this week's
   rotation), so the cache is only a fallback for when the network
   request fails, never a first choice while online.
   Cross-origin requests (Bungie's API) are left completely alone.
   ============================================================ */
const CACHE_NAME = "rally-flag-v2";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/theme.css",
  "./assets/nav.js",
  "./favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  // GitHub Pages marks every file fresh for 10 minutes (max-age=600), so
  // after a deploy the browser kept reusing old nav.js / theme.css, and
  // each page could run a different mix of old and new files. Two fixes:
  // - cache: "no-cache" makes this fetch revalidate with the server
  //   (a cheap 304 when nothing changed) instead of trusting the HTTP cache.
  // - noStoreFresh() rewrites the response's Cache-Control so the page's
  //   own in-memory cache, which is shared across same-site pages, doesn't
  //   treat it as fresh and skip the service worker on the next page.
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return noStoreFresh(response);
      })
      .catch(() => caches.match(event.request))
  );
});

function noStoreFresh(response){
  if (response.type !== "basic" || !response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
