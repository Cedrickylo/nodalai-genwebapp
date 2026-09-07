import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress, initWelcomeModal, initRouter } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';
import { showToast, syncHistoryWithCloud, validateAllInputs, setSyncing } from './helpers.js';
import { elements } from './state.js';

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

        // Smoothly dismiss the initial startup loader overlay
        const appInitLoader = document.getElementById('app-init-loader');
        if (appInitLoader) {
            appInitLoader.classList.add('opacity-0', 'pointer-events-none');
            setTimeout(() => {
                appInitLoader.classList.add('hidden');
            }, 300);
        }

        // ==================================================================
        // SERVICE WORKER REGISTRATION & PWA LIFECYCLE (v13)
        // ==================================================================
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    const reg = await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
                    console.log('[SW] ServiceWorker registered with scope:', reg.scope);
                    
                    // Listen for updates
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('[SW] New version available, triggering activation...');
                                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                                }
                            });
                        }
                    });
                } catch (swErr) {
                    console.warn('[SW] ServiceWorker registration failed:', swErr);
                }
            });

            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'SW_ACTIVATED') {
                    console.log('[SW] Active version:', event.data.version);
                }
            });
        }

        // ==================================================================
        // PWA STANDALONE MODE & APP INSTALLATION PROMPTS
        // ==================================================================
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isStandalone) {
            document.documentElement.classList.add('pwa-standalone');
            console.log('[PWA] Running in dedicated standalone window mode');
        }

        let deferredInstallPrompt = null;
        const desktopInstallBtn = elements.desktopNavInstallBtn;
        const mobileInstallBtn = elements.mobileMenuInstallBtn;

        function setInstallButtonsVisibility(show) {
            if (isStandalone) {
                desktopInstallBtn?.classList.add('hidden');
                mobileInstallBtn?.classList.add('hidden');
                return;
            }
            if (show) {
                desktopInstallBtn?.classList.remove('hidden');
                mobileInstallBtn?.classList.remove('hidden');
            } else {
                desktopInstallBtn?.classList.add('hidden');
                mobileInstallBtn?.classList.add('hidden');
            }
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredInstallPrompt = event;
            setInstallButtonsVisibility(true);
            console.log('[PWA] beforeinstallprompt captured; install affordance enabled');
        });

        async function handleAppInstall() {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                const choice = await deferredInstallPrompt.userChoice;
                if (choice && choice.outcome === 'accepted') {
                    showToast('Thanks for installing Nodal AI!', 3500, 'success');
                }
                deferredInstallPrompt = null;
                setInstallButtonsVisibility(false);
            } else {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIOS) {
                    showToast("To install on iOS: tap the Share button in Safari, then choose 'Add to Home Screen'.", 6000, 'info');
                } else {
                    showToast("To install Nodal AI, look for the 'Install' icon in your browser address bar or menu.", 4500, 'info');
                }
            }
        }

        desktopInstallBtn?.addEventListener('click', handleAppInstall);
        mobileInstallBtn?.addEventListener('click', handleAppInstall);

        window.addEventListener('appinstalled', () => {
            deferredInstallPrompt = null;
            setInstallButtonsVisibility(false);
            showToast('Nodal AI was successfully installed!', 3500, 'success');
            console.log('[PWA] App successfully installed');
        });

        // For iOS Safari or browsers where beforeinstallprompt does not fire:
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (!isStandalone && isIOSDevice) {
            setInstallButtonsVisibility(true);
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
        
        if (shareId) {
            window.history.replaceState({}, document.title, window.location.pathname);
            loadSharedQuiz(shareId);
        }
                
    } catch (error) {
        console.error('Critical Init Error:', error);
        const appInitLoader = document.getElementById('app-init-loader');
        if (appInitLoader) appInitLoader.classList.add('hidden');
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