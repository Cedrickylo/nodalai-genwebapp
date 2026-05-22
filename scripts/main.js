import { initializeAudio, initializeAppState, attachAuthHandlers, updateAuthUI, prepareSavedProgress } from './helpers.js';
import { attachQuizEventListeners } from './quiz.js';

async function initApp() {
    try {
        initializeAudio();
        initializeAppState();
        attachAuthHandlers();
        attachQuizEventListeners();
        await updateAuthUI();
        prepareSavedProgress();
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
