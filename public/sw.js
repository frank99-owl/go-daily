const SHELL_CACHE = "go-daily-shell-v2";
const STATIC_CACHE = "go-daily-static-v2";
const PRECACHE_URLS = ["/offline.html", "/manifest.json", "/favicon.ico"];
const CLIENT_ONLINE_MESSAGE = "go-daily.client-online";
const FLUSH_SYNC_QUEUE_MESSAGE = "go-daily.flush-sync-queue";

function isDocumentRequest(request) {
  return request.mode === "navigate" || request.destination === "document";
}

function isStaticAssetRequest(request, url) {
  if (request.destination === "style") return true;
  if (request.destination === "script") return true;
  if (request.destination === "font") return true;
  if (request.destination === "image") return true;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    return;
  }

  if (isDocumentRequest(request)) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (
          (await cache.match("/offline.html")) ??
          new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          })
        );
      }),
    );
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;

        const response = await fetch(request);
        if (response.ok) {
          cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== CLIENT_ONLINE_MESSAGE) {
    return;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: FLUSH_SYNC_QUEUE_MESSAGE });
        }
      })
      .catch(() => {}),
  );
});
