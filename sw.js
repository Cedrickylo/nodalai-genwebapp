// Incremented to v17 for Skipped Questions Review and Unskippable Navigation Enforcement
const CACHE_NAME = 'nodal-ai-cache-v17';
const OFFLINE_QUIZ_CACHE = 'nodal-offline-quizzes-v1';

// Pre-cache core local files to ensure stable installation and reliable offline mode
const LOCAL_ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
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
    '/scripts/quiz/quizUtils.js',
    '/scripts/quiz/quizStatistics.js',
    '/scripts/quiz/quizOffline.js',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    '/icons/icon-180.png'
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
    console.log('[Service Worker v15] Installing & Pre-caching Core Assets');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const asset of LOCAL_ASSETS_TO_CACHE) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn(`[Service Worker v15] Failed to pre-cache ${asset}:`, err);
                }
            }
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Flush deprecated caches from previous versions and claim clients
self.addEventListener('activate', (event) => {
    console.log('[Service Worker v15] Activating & Evicting Deprecated Caches');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME && cache !== OFFLINE_QUIZ_CACHE) {
                        console.log('[Service Worker v15] Evicting Deprecated Cache:', cache);
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
                console.warn('[Service Worker v15] Notification warning during activate:', err);
            }
        })
    );
});

self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'CACHE_OFFLINE_QUIZ') {
        const { quizKey, quizData, takesData, expiresAt } = event.data;
        if (quizKey && quizData) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                const quizPayload = {
                    ...quizData,
                    cachedAt: Date.now(),
                    expiresAt
                };
                cache.put(
                    new Request(`/api/offline-quiz/${encodeURIComponent(quizKey)}`),
                    new Response(JSON.stringify(quizPayload), {
                        headers: { 'Content-Type': 'application/json' }
                    })
                );
                if (takesData) {
                    cache.put(
                        new Request(`/api/offline-takes/${encodeURIComponent(quizKey)}`),
                        new Response(JSON.stringify(takesData), {
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                }
            }).catch(err => console.error('[SW] Failed to cache offline quiz:', err));
        }
    } else if (event.data.type === 'REMOVE_OFFLINE_QUIZ') {
        const { quizKey } = event.data;
        if (quizKey) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                cache.delete(new Request(`/api/offline-quiz/${encodeURIComponent(quizKey)}`));
                cache.delete(new Request(`/api/offline-takes/${encodeURIComponent(quizKey)}`));
            }).catch(err => console.error('[SW] Failed to delete offline quiz:', err));
        }
    } else if (event.data.type === 'PRUNE_EXPIRED_QUIZZES') {
        const { expiredKeys } = event.data;
        if (Array.isArray(expiredKeys)) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                expiredKeys.forEach(k => {
                    cache.delete(new Request(`/api/offline-quiz/${encodeURIComponent(k)}`));
                    cache.delete(new Request(`/api/offline-takes/${encodeURIComponent(k)}`));
                });
            }).catch(err => console.error('[SW] Failed to prune offline quizzes:', err));
        }
    }
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