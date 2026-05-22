import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress } from './helpers.js';
import { attachQuizEventListeners, loadSharedQuiz } from './quiz.js';

async function initApp() {
    try {
        // Bind a one-time user gesture to resume the AudioContext (Tone.js) when needed
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

        const urlParams = new URLSearchParams(window.location.search);
                const sharedQuizData = urlParams.get('q');
                if (sharedQuizData) {
                    // Remove the giant code from the URL bar to keep it looking clean
                    window.history.replaceState({}, document.title, window.location.pathname);
                    // Load it!
                    loadSharedQuiz(sharedQuizData);
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
