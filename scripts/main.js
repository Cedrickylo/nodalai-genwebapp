import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress, initWelcomeModal } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';
import { showToast, syncHistoryWithCloud, validateAllInputs } from './helpers.js';

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
        await updateAuthUI();
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
