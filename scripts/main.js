import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress, initWelcomeModal, initRouter } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';
import { showToast, syncHistoryWithCloud, validateAllInputs, setSyncing } from './helpers.js';

// ==================================================================
// GLOBAL UNHANDLED REJECTION SAFETY NET
// Prevents asynchronous network failures inside third-party cloud SDKs
// from triggering browser crash cascades when operating offline.
// ==================================================================
window.addEventListener('unhandledrejection', (event) => {
    const isPuterRelated = event.reason && (
        event.reason.name === 'XMLHttpRequest' || 
        String(event.reason).includes('puter') || 
        String(event.reason.message || '').includes('puter')
    );
    if (isPuterRelated || !navigator.onLine) {
        console.warn('Globally intercepted and suppressed offline cloud promise rejection:', event.reason);
        event.preventDefault(); // Silences the red error crash trigger
    }
});

async function initApp() {
    if (window.puter) puter.quiet = true;
    try {
        // Bind user gesture to resume AudioContext (Tone.js)
        function bindUserGestureToStartAudio() {
            const resumeAudio = async () => {
                try {
                    if (window.Tone && Tone.context && Tone.context.state === 'suspended') {
                        await Tone.start();
                        console.log('AudioContext resumed via Tone.start()');
                    }
                } catch (e) {
                    console.warn('Tone.start() failed', e);
                }
            };
            window.addEventListener('click', resumeAudio, { once: true });
            window.addEventListener('keydown', resumeAudio, { once: true });
        }
        bindUserGestureToStartAudio();
        initializeAudio();
        initializeAppState();
        attachAuthHandlers();
        attachQuizEventListeners();

        // ==================================================================
        // ISOLATED INITIALIZATION BLOCK
        // Prevents spotty or offline credentials checks from throwing global 
        // exceptions that trigger the "App Failed" crash layout screen.
        // ==================================================================
        try {
            await updateAuthUI();
        } catch (authError) {
            console.warn('Non-fatal authentication UI initialization failure (handled gracefully offline):', authError);
            setSyncing('offline');
        }

        prepareSavedProgress();
        initWelcomeModal();
        initRouter();

        // ==================================================================
        // SERVICE WORKER REGISTRATION & STALE CACHE MIGRATION (V4)
        // ==================================================================
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                const SW_VERSION_TAG = 'nodal_sw_migration_v4';
                try {
                    const registrations = await navigator.serviceWorker.getRegistrations();
                    const isMigrated = localStorage.getItem(SW_VERSION_TAG) === 'complete';

                    if (registrations.length > 0 && !isMigrated) {
                        // User has an already saved legacy service worker: Remove and replace
                        console.log('[SW Migration] Found existing saved service worker. Removing and replacing...');
                        for (const registration of registrations) {
                            await registration.unregister();
                            console.log('[SW Migration] Unregistered old worker:', registration.scope);
                        }

                        // Clear old caches to remove stale saved state
                        if ('caches' in window) {
                            const cacheKeys = await caches.keys();
                            await Promise.all(cacheKeys.map(key => caches.delete(key)));
                            console.log('[SW Migration] Deprecated caches cleared.');
                        }

                        localStorage.removeItem('nodal_sw_migration_v1');
                        localStorage.removeItem('nodal_sw_migration_v2');
                        localStorage.removeItem('nodal_sw_migration_v3');
                        localStorage.setItem(SW_VERSION_TAG, 'complete');

                        // Register the new service worker
                        const newReg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                        console.log('[SW Migration] New service worker registered:', newReg.scope);

                        // Reload page once to load fresh assets directly from the server
                        window.location.reload();
                        return;
                    } else if (registrations.length === 0 && !isMigrated) {
                        // If user doesn't have a service worker saved: clean keys, mark migrated
                        console.log('[SW Migration] No existing service worker saved. Skipping removal.');
                        localStorage.removeItem('nodal_sw_migration_v1');
                        localStorage.removeItem('nodal_sw_migration_v2');
                        localStorage.removeItem('nodal_sw_migration_v3');
                        localStorage.setItem(SW_VERSION_TAG, 'complete');
                        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                        console.log('[SW] ServiceWorker registered with scope:', reg.scope);
                    } else {
                        // Already migrated, ensure current registration is active
                        const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                        console.log('[SW] ServiceWorker active with scope:', reg.scope);
                    }
                } catch (swErr) {
                    console.warn('[SW Migration] ServiceWorker registration/migration failed:', swErr);
                }
            });

            // Listen for service worker activation or updates to reload smoothly if needed
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing && localStorage.getItem('nodal_sw_migration_v4') !== 'complete') {
                    refreshing = true;
                    window.location.reload();
                }
            });

            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_ACTIVATED') {
                    console.log('[SW] New version activated:', event.data.version);
                }
            });
        }

        // ==================================================================
        // NEW: LISTEN FOR CONNECTIVITY SHIFTS TO RE-DOCK NETWORK UTILITIES
        // ==================================================================
        window.addEventListener('online', () => {
            showToast('You are back online! Reconnecting to Puter cloud...', 3000, 'success');
            syncHistoryWithCloud(true);
            validateAllInputs();
        });

        window.addEventListener('offline', () => {
            showToast('Connection lost. Running in Offline Mode (Quiz Generation disabled).', 4000, 'warning');
            validateAllInputs();
        });

        const urlParams = new URLSearchParams(window.location.search);
        const shareId = urlParams.get('share');
        
        if (shareId && navigator.onLine) { // Added online check protection guardrail
            window.history.replaceState({}, document.title, window.location.pathname);
            loadSharedQuiz(shareId);
        }
                
    } catch (error) {
        console.error('Critical Init Error:', error);
        document.body.innerHTML = `
            <div style="max-width:400px; margin:50px auto; padding:20px; background-color:#400; border:1px solid #800; color:#fcc; text-align:center; font-family:sans-serif;">
                <h1 style="font-size:1.2em; font-weight:bold; color:#f99;">App Failed</h1>
                <p>A critical error occurred. Please check your connection and refresh the page.</p>
                <p style="font-size:0.8em; color:#f77; margin-top:5px;">${error.message}</p>
            </div>
        `;
    }
}

window.addEventListener('DOMContentLoaded', initApp);