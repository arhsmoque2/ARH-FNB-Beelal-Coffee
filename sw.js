/**
 * sw.js — Beelal Coffee Service Worker
 *
 * Implements offline resilience and intelligent caching for Beelal Coffee PWA.
 *
 * Strategies:
 * 1. Stale-While-Revalidate (SWR): App shell files (HTML, config.js, cart-engine.js, manifest)
 * 2. CacheFirst: Static media, images (media/*, i.imgur.com), and web fonts (Google Fonts)
 * 3. NetworkOnly: API endpoints (/api/*), Firebase RTDB, and dynamic transaction endpoints
 */

const CACHE_VERSION = "beelal-v1";
const SHELL_CACHE = `beelal-shell-${CACHE_VERSION}`;
const MEDIA_CACHE = `beelal-media-${CACHE_VERSION}`;

// Pre-cached critical app shell assets for instant boot and offline baseline
const PRECACHE_ASSETS = [
  "/",
  "/index-v2.html",
  "/config.js",
  "/src/pure/cart-engine.js",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/favicon.png",
  "/icons/icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable.png"
];

// Install: pre-cache app shell assets and activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then(async (cache) => {
        const settled = await Promise.allSettled(
          PRECACHE_ASSETS.map(async (url) => {
            const res = await fetch(url, { cache: "reload" });
            if (res.ok) {
              await cache.put(url, res);
            }
          })
        );
        return settled;
      })
      .then(() => self.skipWaiting())
  );
});

// Activate: clean up outdated caches from previous versions and claim clients
self.addEventListener("activate", (event) => {
  const allowedCaches = new Set([SHELL_CACHE, MEDIA_CACHE]);
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((name) => {
            if (!allowedCaches.has(name)) {
              return caches.delete(name);
            }
            return null;
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Helper: check if request is for app shell
function isAppShell(url, request) {
  if (request.mode === "navigate") return true;
  const pathname = url.pathname;
  return (
    pathname === "/" ||
    pathname === "/index" ||
    pathname === "/index.html" ||
    pathname === "/index-v2" ||
    pathname === "/index-v2.html" ||
    pathname === "/config.js" ||
    pathname === "/src/pure/cart-engine.js" ||
    pathname === "/manifest.webmanifest"
  );
}

// Helper: check if request is for media/font/image assets
function isMediaOrFont(url, request) {
  if (url.origin === self.location.origin && url.pathname.startsWith("/media/")) return true;
  if (url.origin === self.location.origin && url.pathname.startsWith("/icons/")) return true;
  if (request.destination === "image" || request.destination === "font") return true;
  if (/\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname)) return true;
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com"))
    return true;
  if (url.hostname.includes("imgur.com")) return true;
  return false;
}

// Fetch handler
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only intercept HTTP/HTTPS GET requests
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  // 1. NetworkOnly: API routes and database mutations/probes
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("firebasedatabase.app") ||
    url.hostname.includes("fnb-billing-ledger")
  ) {
    return;
  }

  // 2. CacheFirst: Media, images, and fonts
  if (isMediaOrFont(url, request)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const networkRes = await fetch(request);
          if (networkRes.ok || networkRes.type === "opaque") {
            cache.put(request, networkRes.clone());
          }
          return networkRes;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // 3. Stale-While-Revalidate: App shell and documents
  if (isAppShell(url, request)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);

        const fetchPromise = fetch(request)
          .then((networkRes) => {
            if (networkRes.ok) {
              cache.put(request, networkRes.clone());
            }
            return networkRes;
          })
          .catch(async (err) => {
            // If network fails during navigation and specific URL is not in cache, fallback to /index-v2.html or /
            if (!cached && request.mode === "navigate") {
              const fallback = (await cache.match("/index-v2.html")) || (await cache.match("/"));
              if (fallback) return fallback;
            }
            throw err;
          });

        return cached || fetchPromise;
      })
    );
  }
});
