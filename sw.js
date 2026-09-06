// Incremented to v10 to immediately replace legacy service workers and clear stale caches
const CACHE_NAME = 'nodal-ai-cache-v10';

// Pre-cache core local files to ensure stable installation and reliable offline mode
const LOCAL_ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/scripts/main.js',
    '/scripts/helpers.js',
    '/scripts/state.js',
    '/scripts/aiService.js',
    '/scripts/quiz.js',
    '/scripts/quiz/fileHandling.js',
    '/scripts/quiz/quizExecution.js',
    '/scripts/quiz/quizGeneration.js',
    '/scripts/quiz/quizHistory.js',
    '/scripts/quiz/quizResults.js',
    '/scripts/quiz/quizUtils.js'
];

// List of allowed external CDNs to be automatically cached dynamically at runtime
const ALLOWED_CDN_ORIGINS = [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'js.puter.com'
];

// 1. Install Event: Pre-cache local application framework files & immediately skip waiting
self.addEventListener('install', (event) => {
    console.log('[Service Worker v10] Installing & Pre-caching Core Assets');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(LOCAL_ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Flush deprecated caches from previous versions and claim clients
self.addEventListener('activate', (event) => {
    console.log('[Service Worker v10] Activating & Evicting Deprecated Caches');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker v10] Evicting Deprecated Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()).then(async () => {
            // Notify existing open tabs about the update
            try {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                for (const client of clients) {
                    client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
                }
            } catch (err) {
                console.warn('[Service Worker v10] Notification warning during activate:', err);
            }
        })
    );
});

// 3. Fetch Event: Network-First for local assets (ensures fresh server updates), dynamic cache for CDNs
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Bypass background service worker mapping for internal Puter backend communication
    if (requestUrl.href.includes('puter.com') && !requestUrl.href.includes('js.puter.com/v2/')) {
        return;
    }

    const isLocal = requestUrl.origin === self.location.origin;
    const isAllowedCDN = ALLOWED_CDN_ORIGINS.some(origin => requestUrl.hostname === origin);

    // Local files (HTML, CSS, JS): Network-First strategy
    // Fetches newest version from server when online, falls back to cache when offline
    if (isLocal) {
        event.respondWith(
            fetch(event.request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(event.request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html') || caches.match('/');
                        }
                        return new Response('Offline resource unavailable.', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                })
        );
        return;
    }

    // Allowed CDN assets: Cache-First / Stale-While-Revalidate
    if (isAllowedCDN) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                const fetchPromise = fetch(event.request).then((networkResponse) => {
                    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                        const responseToCache = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return networkResponse;
                }).catch(() => cachedResponse);

                return cachedResponse || fetchPromise;
            })
        );
        return;
    }
});