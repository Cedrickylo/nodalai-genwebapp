const CACHE_NAME = 'nodal-ai-cache-v1';

// Pre-cache ONLY local files to ensure stable installation without CORS interference
const LOCAL_ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/scripts/main.js',
    '/scripts/helpers.js',
    '/scripts/state.js'
];

// List of allowed external CDNs to be automatically cached dynamically at runtime
const ALLOWED_CDN_ORIGINS = [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'js.puter.com'
];

// 1. Install Event: Pre-cache local application framework files only
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Stable Pre-caching Core Assets');
            return cache.addAll(LOCAL_ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Flush old versions from previous builds
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Evicting Deprecated Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: Serve cached items or dynamically cache requested external files
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // Bypass background service worker mapping for internal Puter backend communication
    if (requestUrl.href.includes('puter.com') && !requestUrl.href.includes('js.puter.com/v2/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Return cached match instantly
            }

            return fetch(event.request).then((networkResponse) => {
                // Check if the asset belongs to one of our approved CDNs or our local origin
                const isLocal = requestUrl.origin === self.location.origin;
                const isAllowedCDN = ALLOWED_CDN_ORIGINS.some(origin => requestUrl.hostname === origin);

                // CRITICAL FIX: Allow both standard 200 responses AND 'opaque' (status 0) cross-origin CDN scripts
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque') && (isLocal || isAllowedCDN)) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Fail gracefully if completely offline and item isn't cached
                return new Response('Offline resource unavailable.', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});