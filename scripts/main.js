import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress, initWelcomeModal } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';
import { showToast, syncHistoryWithCloud, validateAllInputs, setSyncing } from './helpers.js';
import { initAdmin, syncProfileToSupabase, refreshAdminVisibility } from './admin.js';
import { getCurrentProvider, setCurrentProvider, getUserApiKey, setUserApiKey } from './aiService.js';
import { initShortcuts } from './shortcuts.js';

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

const THEME_KEY = 'nodal_theme';

function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(theme);

    const toggleBtn = document.getElementById('theme-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const current = document.documentElement.classList.contains('light-mode') ? 'light' : 'dark';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            localStorage.setItem(THEME_KEY, next);
        });
    }
}

function applyTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.classList.toggle('light-mode', isLight);
    const darkIcon = document.getElementById('theme-icon-dark');
    const lightIcon = document.getElementById('theme-icon-light');
    const label = document.getElementById('theme-label');
    if (darkIcon) darkIcon.classList.toggle('hidden', isLight);
    if (lightIcon) lightIcon.classList.toggle('hidden', !isLight);
    if (label) label.textContent = isLight ? 'Light' : 'Dark';
}

function initProviderSelector() {
    const select = document.getElementById('ai-provider-select');
    const settingsBtn = document.getElementById('ai-provider-settings-btn');

    if (select) {
        // Set saved provider
        select.value = getCurrentProvider();
        select.addEventListener('change', () => {
            setCurrentProvider(select.value);
        });
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            const modal = document.getElementById('api-key-modal');
            if (!modal) return;
            // Load saved keys
            ['groq', 'openai', 'anthropic', 'gemini'].forEach(p => {
                const input = document.getElementById(`api-key-${p}`);
                if (input) input.value = getUserApiKey(p);
            });
            modal.classList.remove('hidden');
        });
    }

    // Save API keys handler
    window.__saveApiKeys = () => {
        ['groq', 'openai', 'anthropic', 'gemini'].forEach(p => {
            const input = document.getElementById(`api-key-${p}`);
            if (input) setUserApiKey(p, input.value.trim());
        });
        document.getElementById('api-key-modal')?.classList.add('hidden');
        if (typeof showToast === 'function') showToast('API keys saved!', 2000, 'success');
    };
}

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
            // Sync Puter.js user profile to Supabase database
            try {
                await syncProfileToSupabase();
            } catch (profileErr) {
                console.warn('Profile sync to Supabase failed (non-blocking):', profileErr);
            }
        } catch (authError) {
            console.warn('Non-fatal authentication UI initialization failure (handled gracefully offline):', authError);
            setSyncing('offline');
        }

        prepareSavedProgress();
        initWelcomeModal();
        initTheme();
        initProviderSelector();
        initShortcuts();

        // Initialize admin panel (adds Admin nav button if user is admin)
        try {
            const isAdminUser = await initAdmin();
            if (isAdminUser) {
                // Setup admin back button
                const adminBackBtn = document.getElementById('admin-back-btn');
                if (adminBackBtn) {
                    adminBackBtn.onclick = async () => {
                        const { showView } = await import('./helpers.js');
                        showView('start');
                    };
                }
            }
        } catch (e) {
            console.warn('Admin init failed (non-blocking):', e);
        }

        // ==================================================================
        // SERVICE WORKER: Register + auto-detect new builds
        // ==================================================================
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    const registration = await navigator.serviceWorker.register('/sw.js');
                    console.log('ServiceWorker registered with scope:', registration.scope);

                    // Check for updates on each page load
                    registration.update();
                } catch (err) {
                    console.warn('ServiceWorker registration failed:', err);
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