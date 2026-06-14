import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress, initWelcomeModal } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';
import { showToast, syncHistoryWithCloud, validateAllInputs, setSyncing } from './helpers.js';
import { state } from './state.js';

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
        // ==================================================================
        // NEW: LOAD ADMINISTRATIVE CONFIGURATIONS ON BOOT WITH DEFENSIVE CHECKS
        // ==================================================================
        if (window.puter && puter.auth.isSignedIn() && navigator.onLine) {
            try {
                const cloudConfigRaw = await puter.kv.get('nodal_cloud_global_app_config');
                if (cloudConfigRaw) {
                    const parsedConfig = JSON.parse(cloudConfigRaw);
                    
                    // FIX: Enforce defensive object existence check before parsing sub-properties
                    if (parsedConfig && parsedConfig.version) {
                        state.globalConfig = parsedConfig;
                        
                        // Update dynamic footer version tag if an element exists
                        const mainVersionLabel = document.getElementById('main-app-version-footer');
                        if (mainVersionLabel) {
                            mainVersionLabel.textContent = `v${parsedConfig.version.major || 1}.${parsedConfig.version.minor || 0}.${parsedConfig.version.patch || 0}`;
                        }
                    }
                }
            } catch (configError) {
                console.warn("Falling back to local application defaults; cloud settings unreachable.");
            }

            // ==================================================================
            // NEW BACKGROUND LOGGING GATE: UPSERT USER METRICS ON LOG IN
            // ==================================================================
            puter.auth.getUser().then(async (currentUserObj) => {
                try {
                    await fetch('/.netlify/functions/user-checkin', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            puterId: currentUserObj.username || currentUserObj.id,
                            displayName: currentUserObj.username || 'Puter User'
                        })
                    });
                } catch (err) {
                    console.warn("Background admin telemetry tracking synchronization failed.");
                }
            });
        }

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

        // ==================================================================
        // NEW: REGISTER PWA BACKGROUND SERVICE WORKER FOR OFFLINE MODE
        // ==================================================================
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js')
                    .then((registration) => {
                        console.log('ServiceWorker registered successfully with scope: ', registration.scope);
                    })
                    .catch((err) => {
                        console.warn('ServiceWorker registration failed: ', err);
                    });
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