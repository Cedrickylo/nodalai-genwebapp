// quiz.js - Main Entry Point & Unified App Event Binding Engine
import { showView, showToast, setupCustomizeView, exportQuizAsJSON, openAccountModal, syncHistoryWithCloud } from './helpers.js';
import { handleFileSelect, handleQuizImport, resumeQuiz } from './quiz/fileHandling.js';
import { handleQuizGeneration } from './quiz/quizGeneration.js';
import { skipQuestion } from './quiz/quizExecution.js';
import { state } from './state.js';

export function attachQuizEventListeners() {
    console.log("Unified Application Event Binding Engine Activated.");

    // Helper to safely bind click event maps
    const bindClick = (targetId, callback) => {
        const el = document.getElementById(targetId);
        if (el) el.onclick = callback;
    };

    // ==========================================
    // 1. NAVIGATION ROUTING (SIDEBAR & BOTTOM FOOTER)
    // ==========================================
    bindClick('desktop-nav-home-btn', () => showView('start'));
    bindClick('desktop-nav-help-btn', () => showView('help'));
    bindClick('desktop-nav-about-btn', () => showView('about'));
    bindClick('desktop-nav-account-btn', () => openAccountModal());
    bindClick('desktop-nav-history-btn', () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });

    // Mobile Navigation Bar Buttons
    bindClick('mobile-nav-home-btn', () => showView('start'));
    bindClick('mobile-nav-history-btn', () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });
    
    // Mobile Pop-up Menu Layer Drawer Toggle
    const mobNavMenuBtn = document.getElementById('mobile-nav-menu-btn');
    const mobMenuModal = document.getElementById('mobile-menu-modal');
    if (mobNavMenuBtn && mobMenuModal) {
        mobNavMenuBtn.onclick = () => mobMenuModal.classList.remove('hidden');
    }

    const closeMobileMenu = () => {
        if (mobMenuModal) mobMenuModal.classList.add('hidden');
    };

    bindClick('mobile-menu-close-btn', closeMobileMenu);
    const mobMenuBackdrop = document.getElementById('mobile-menu-backdrop');
    if (mobMenuBackdrop) mobMenuBackdrop.onclick = closeMobileMenu;

    // Mobile Menu Internal Options
    bindClick('mobile-menu-help-btn', () => { closeMobileMenu(); showView('help'); });
    bindClick('mobile-menu-about-btn', () => { closeMobileMenu(); showView('about'); });
    bindClick('mobile-menu-account-btn', () => { closeMobileMenu(); openAccountModal(); });

    // Independent View Layer Back Targets
    bindClick('history-fullscreen-back-btn', () => showView('start'));
    bindClick('help-back-btn', () => showView('start'));
    bindClick('about-back-btn', () => showView('start'));

    // Account Modal Close Trigger
    bindClick('close-account-modal', () => {
        const accModal = document.getElementById('account-modal');
        if (accModal) accModal.classList.add('hidden');
    });

    // ==========================================
    // 2. LIVE ACTIVE QUIZ CONTROLS
    // ==========================================
    bindClick('skip-question-btn', () => skipQuestion());
    
    bindClick('save-quiz-btn', () => {
        import('./quiz/quizUtils.js').then(m => m.saveCurrentQuiz());
    });

    bindClick('home-btn', () => {
        import('./quiz/quizUtils.js').then(m => {
            m.resetApp(false); // Safeguard working choices state context 
            showView('start');
        });
    });

    // ==========================================
    // 3. CLOUD SYNC & INLINE DISPATCH HISTORY ACTIONS
    // ==========================================
    bindClick('sync-cloud-btn', () => syncHistoryWithCloud());
    bindClick('show-all-history-btn', () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });

    // Delegated click interceptor layout router for cards generated on page
    const routeHistoryActions = (event) => {
        if (event.target.closest('button')) {
            import('./quiz/quizHistory.js').then(m => m.handleHistoryClick(event));
        }
    };

    const inlineHistoryContainer = document.getElementById('history-list');
    const absoluteHistoryContainer = document.getElementById('history-full-list');
    if (inlineHistoryContainer) inlineHistoryContainer.onclick = routeHistoryActions;
    if (absoluteHistoryContainer) absoluteHistoryContainer.onclick = routeHistoryActions;

    // ==========================================
    // 4. PREFERENCES SETTINGS CARD TUNERS (Toggles & Padding Inputs)
    // ==========================================
    const customizeToggleBtn = document.getElementById('customize-toggle-btn');
    const customizeContent = document.getElementById('customize-content');
    const customizeToggleIcon = document.getElementById('customize-toggle-icon');
    if (customizeToggleBtn && customizeContent) {
        customizeToggleBtn.onclick = () => {
            const isHidden = customizeContent.classList.toggle('hidden');
            if (customizeToggleIcon) {
                customizeToggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        };
    }

    // Custom Difficulty Toggle Panel Layout Tweak
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
        radio.onchange = () => {
            const customOptions = document.getElementById('custom-options');
            if (customOptions) customOptions.classList.toggle('hidden', radio.value !== 'custom');
        };
    });

    // Custom Question Category Type Selector Menu Tracking Option
    const customTypeSelect = document.getElementById('custom-question-type');
    if (customTypeSelect) {
        customTypeSelect.onchange = () => {
            const mixedCounts = document.getElementById('custom-mixed-counts');
            if (mixedCounts) mixedCounts.classList.toggle('hidden', customTypeSelect.value !== 'mixed');
        };
    }

    // Timed Quiz Toggle Configuration Submenu Toggles
    const timeLimitToggle = document.getElementById('time-limit-toggle');
    const timeLimitOptions = document.getElementById('time-limit-options');
    if (timeLimitToggle && timeLimitOptions) {
        timeLimitToggle.onchange = () => {
            timeLimitOptions.classList.toggle('hidden', !timeLimitToggle.checked);
        };
    }

    document.querySelectorAll('input[name="time_preset"]').forEach(radio => {
        radio.onchange = () => {
            const customTimeInput = document.getElementById('custom-time-input-container');
            if (customTimeInput) customTimeInput.classList.toggle('hidden', radio.value !== 'custom');
        };
    });

    // Attempt Limit Input Display Field Grid Controls
    const attemptLimitToggle = document.getElementById('attempt-limit-toggle');
    const attemptLimitOptions = document.getElementById('attempt-limit-options');
    if (attemptLimitToggle && attemptLimitOptions) {
        attemptLimitToggle.onchange = () => {
            attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
        };
    }

    // Core Document Input Selection Pickers handlers
    const fileUploadInput = document.getElementById('file-upload-input');
    if (fileUploadInput) fileUploadInput.onchange = (e) => handleFileSelect(e);

    const addMoreFilesInput = document.getElementById('add-more-files-input');
    if (addMoreFilesInput) addMoreFilesInput.onchange = (e) => handleFileSelect(e);

    const importQuizInput = document.getElementById('import-quiz-input');
    if (importQuizInput) importQuizInput.onchange = (e) => handleQuizImport(e);

    // Multi-Document Erase Removal Selection Clear Action (With local element isolation styling)
    bindClick('clear-files-btn', () => {
        const listEl = document.getElementById('selected-files-list');
        const displayLabel = document.getElementById('file-name');
        if (listEl) listEl.innerHTML = '';
        if (displayLabel) displayLabel.textContent = 'Select Documents';
        state.fileContent = '';
        state.fileHash = '';
        showToast('Documents cleared.', 2000, 'info');
    });

    // Main Run Trigger Launch Generator Action Engine Activation Button Target Call
    bindClick('generate-quiz-btn', () => handleQuizGeneration(false, false));
    bindClick('resume-quiz-btn', () => resumeQuiz());

    console.log("All functional pathways assigned completely.");
}
export { loadSharedQuiz } from './quiz/fileHandling.js';