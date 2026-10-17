"use strict";
/* FiMova offline cache: network-first navigation; immutable, versioned JS/CSS.
   Never reads or deletes localStorage (learning progress).
   Canonical navigation responses are reconstructed to remove redirect metadata. */
const BUILD = "__BUILD__";
const PREFIX = "fimova:" + self.registration.scope + ":";
const CACHE = PREFIX + BUILD;
const ASSETS = __ASSETS__;
const urlOf = path => new URL(path, self.registration.scope).href;
const ROOT = urlOf("./");
const KNOWN = new Set(ASSETS.map(urlOf));
const ENTRY_PATHS = new Set([new URL(ROOT).pathname, new URL(urlOf("./index.html")).pathname]);
async function cleanResponse(response) {
  if (!response.ok) throw new Error("Asset unavailable: " + response.status);
  if (response.url && new URL(response.url).origin !== self.location.origin) throw new Error("Cross-origin redirect refused.");
  const headers = new Headers(response.headers);
  headers.delete("content-encoding"); headers.delete("content-length");
  return new Response(await response.arrayBuffer(), { status: response.status, statusText: response.statusText, headers });
}
async function cached(url) {
  try {
    const current = await caches.open(CACHE);
    const found = await current.match(url);
    if (found) return found;
    // An already open tab may still refer to the previous immutable asset names.
    if (url !== ROOT) {
      for (const name of (await caches.keys()).filter(n => n.startsWith(PREFIX))) {
        const hit = await (await caches.open(name)).match(url);
        if (hit) return hit;
      }
    }
  } catch { /* Network remains usable if CacheStorage is unavailable. */ }
  return undefined;
}
async function store(url, response) {
  try { await (await caches.open(CACHE)).put(url, response); } catch { /* Best effort. */ }
}
async function network(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    return await fetch(new Request(url, { cache: "no-cache", redirect: "follow", signal: controller.signal }));
  } finally { clearTimeout(timeout); }
}
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // Fail installation atomically, preserving the previous working worker.
      for (const asset of ASSETS) {
        const url = urlOf(asset);
        const response = await cleanResponse(await network(url));
        if (url === ROOT && !(await response.clone().text()).includes('data-build="' + BUILD + '"')) {
          throw new Error("The HTML and worker are from different deployments.");
        }
        await cache.put(url, response);
      }
    } catch (error) {
      await caches.delete(CACHE);
      throw error;
    }
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    try {
      const older = (await caches.keys()).filter(n => n.startsWith(PREFIX) && n !== CACHE);
      // Keep one older version for tabs that are already open. Ignore other apps.
      await Promise.all(older.slice(0, -1).map(name => caches.delete(name)));
    } catch { /* Cleaning stale caches must not break the online app. */ }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (request.mode === "navigate" && ENTRY_PATHS.has(url.pathname)) {
    event.respondWith((async () => {
      try {
        const response = await cleanResponse(await network(ROOT));
        // A newly deployed HTML must not overwrite the old offline shell until
        // that version's assets have all been cached by its own install event.
        if ((await response.clone().text()).includes('data-build="' + BUILD + '"')) {
          await store(ROOT, response.clone());
        }
        return response;
      } catch {
        const fallback = await cached(ROOT);
        if (fallback) return cleanResponse(fallback);
        return new Response("Brak polaczenia. Otworz FiMova z dostepem do internetu, aby przygotowac tryb offline.", {
          status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })());
    return;
  }
  // Never intercept diagnostics, arbitrary navigation or third-party requests.
  const isVersioned = url.pathname.startsWith(new URL("build/", ROOT).pathname);
  if (!KNOWN.has(url.href) && !isVersioned) return;
  event.respondWith((async () => {
    const hit = await cached(request.url);
    if (hit) return hit;
    const response = await cleanResponse(await fetch(request));
    if (KNOWN.has(request.url)) await store(request.url, response.clone());
    return response;
  })());
});
self.addEventListener("message", event => {
  if (event.data?.type === "STATUS") {
    event.waitUntil((async () => {
      const ready = !!(await cached(ROOT));
      event.source?.postMessage({ app: "fimova", type: "READY", build: BUILD, ready });
    })());
  }
});
