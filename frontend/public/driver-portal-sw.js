// Cache name is versioned from the registration URL (?v=…), which changes every
// build. Without that the name was a fixed '-v1', so the activate cleanup below
// — which drops caches under any *other* name — never had anything to drop and a
// driver's phone accumulated every hashed chunk of every deploy, forever.
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `driver-portal-shell-${VERSION}`;
const SHELL_URLS = ['/driver', '/manifest.webmanifest', '/brand/operion-mark.svg', '/brand/operion-logo-navy.svg'];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith('/_next/static/')
    || pathname.startsWith('/_next/image')
    || pathname.startsWith('/brand/')
    || pathname === '/manifest.webmanifest'
  );
}

self.addEventListener('install', (event) => {
  // Deliberately no skipWaiting() here: the new worker waits so the portal can
  // show its update banner and let the driver reload at a safe moment. Taking
  // over immediately swapped code under a running page and the banner — which
  // only ever fires for a *waiting* worker — could never appear.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => (key === CACHE_NAME ? Promise.resolve() : caches.delete(key))),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (!isSameOrigin(requestUrl) || requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match('/driver');
        return cached ?? Response.error();
      }),
    );
    return;
  }

  if (isStaticAsset(requestUrl.pathname)) {
    // Stale-while-revalidate rather than cache-first. Production chunk names are
    // content-hashed so either strategy is correct there, but any asset served
    // under a stable name was previously pinned to its first version with no way
    // back short of clearing site data. Serving the cached copy and refreshing it
    // in the background keeps the offline shell while letting it self-heal.
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request)
          .then((response) => {
            if (response.ok) {
              void cache.put(event.request, response.clone());
            }
            return response;
          })
          .catch(() => undefined);

        if (cached) {
          void network;
          return cached;
        }
        const response = await network;
        return response ?? Response.error();
      }),
    );
  }
});
