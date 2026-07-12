const CACHE_NAME = 'nodal-ai-cache';
const BUILD_VERSION_URL = '/build-version.json';

// Pre-cache local application files
const LOCAL_ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/scripts/main.js',
    '/scripts/helpers.js',
    '/scripts/state.js',
    '/scripts/admin.js',
    '/scripts/supabaseClient.js',
    '/build-version.json'
];

const ALLOWED_CDN_ORIGINS = [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'js.puter.com',
    'cdn.jsdelivr.net'
];

// 1. Install: Pre-cache local files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching local assets');
            return cache.addAll(LOCAL_ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate: Check build version and flush caches if updated
self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            // Fetch the latest build version
            let newVersion = null;
            try {
                const res = await fetch(BUILD_VERSION_URL + '?t=' + Date.now());
                if (res.ok) {
                    const data = await res.json();
                    newVersion = data.version;
                }
            } catch (e) {
                console.warn('[SW] Could not fetch build version:', e);
            }

            // Compare with stored version
            const prevVersion = await getVersionFromCache();
            if (newVersion && prevVersion && newVersion !== prevVersion) {
                console.log(`[SW] New build detected: ${prevVersion} → ${newVersion}. Clearing all caches.`);
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k)));
            } else if (!prevVersion && newVersion) {
                console.log('[SW] First run with version tracking:', newVersion);
            }

            // Store the new version
            if (newVersion) {
                await saveVersionToCache(newVersion);
            }

            // Claim all open tabs immediately
            await self.clients.claim();
        })()
    );
});

// Helper: read stored version from cache
async function getVersionFromCache() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const res = await cache.match('/build-version.json');
        if (res) {
            const text = await res.text();
            const data = JSON.parse(text);
            return data.version;
        }
    } catch (e) { /* ignore */ }
    return null;
}

// Helper: store version in cache
async function saveVersionToCache(version) {
    try {
        const cache = await caches.open(CACHE_NAME);
        const response = new Response(JSON.stringify({ version }), {
            headers: { 'Content-Type': 'application/json' }
        });
        await cache.put('/build-version.json', response);
    } catch (e) { /* ignore */ }
}

// 3. Fetch: Serve cache-first for local, network-first for CDN
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Bypass for Puter backend and Supabase
    if (requestUrl.href.includes('puter.com') && !requestUrl.href.includes('js.puter.com/v2/')) return;
    if (requestUrl.hostname.includes('supabase.co')) return;

    // Always fetch build-version.json from network (never cache it long-term)
    if (requestUrl.pathname === '/build-version.json') {
        event.respondWith(fetch(event.request + '?t=' + Date.now()));
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((networkResponse) => {
                const isLocal = requestUrl.origin === self.location.origin;
                const isAllowedCDN = ALLOWED_CDN_ORIGINS.some(origin => requestUrl.hostname === origin);

                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque') && (isLocal || isAllowedCDN)) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                return new Response('Offline resource unavailable.', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});
