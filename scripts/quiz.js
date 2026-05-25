import { showView, showToast, setupCustomizeView, exportQuizAsJSON, openAccountModal, syncHistoryWithCloud } from './helpers.js';
import { handleFileSelect, handleQuizImport, resumeQuiz, resetAppFiles } from './quiz/fileHandling.js';
import { handleQuizGeneration } from './quiz/quizGeneration.js';
import { skipQuestion } from './quiz/quizExecution.js';
import { state } from './state.js';

export function attachQuizEventListeners() {
    console.log("Unified Application Event Binding Engine Activated.");

    // ==========================================
    // 1. NAVIGATION (SIDEBAR, FOOTER, POPUPS)
    // ==========================================
    const clickRoute = (targetId, viewName, runCallback) => {
        const btn = document.getElementById(targetId);
        if (btn) {
            btn.onclick = () => {
                if (viewName) showView(viewName);
                if (runCallback) runCallback();
            };
        }
    };

    // Desktop
    clickRoute('desktop-nav-home-btn', 'start');
    clickRoute('desktop-nav-help-btn', 'help');
    clickRoute('desktop-nav-about-btn', 'about');
    clickRoute('desktop-nav-account-btn', null, () => openAccountModal());
    clickRoute('desktop-nav-history-btn', null, () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });

    // Mobile Navigation & Drawer Menu
    clickRoute('mobile-nav-home-btn', 'start');
    clickRoute('mobile-nav-history-btn', null, () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });
    
    const mobMenuBtn = document.getElementById('mobile-nav-menu-btn');
    const mobMenuModal = document.getElementById('mobile-menu-modal');
    if (mobMenuBtn && mobMenuModal) {
        mobMenuBtn.onclick = () => mobMenuModal.classList.remove('hidden');
    }

    const closeMenu = () => mobMenuModal && mobMenuModal.classList.add('hidden');
    clickRoute('mobile-menu-close-btn', null, closeMenu);
    
    const backdrop = document.getElementById('mobile-menu-backdrop');
    if (backdrop) backdrop.onclick = closeMenu;

    clickRoute('mobile-menu-help-btn', 'help', closeMenu);
    clickRoute('mobile-menu-about-btn', 'about', closeMenu);
    clickRoute('mobile-menu-account-btn', null, () => { closeMenu(); openAccountModal(); });

    // Modals Close Targets
    clickRoute('history-fullscreen-back-btn', 'start');
    clickRoute('help-back-btn', 'start');
    clickRoute('about-back-btn', 'start');
    
    const closeAccBtn = document.getElementById('close-account-modal');
    const accModal = document.getElementById('account-modal');
    if (closeAccBtn && accModal) {
        closeAccBtn.onclick = () => accModal.classList.add('hidden');
    }

    // ==========================================
    // 2. LIVE ACTIVE QUIZ CONTROLS
    // ==========================================
    const skipBtn = document.getElementById('skip-question-btn');
    if (skipBtn) skipBtn.onclick = () => skipQuestion();

    const saveQuizBtn = document.getElementById('save-quiz-btn');
    if (saveQuizBtn) {
        saveQuizBtn.onclick = () => {
            import('./quiz/quizUtils.js').then(m => m.saveCurrentQuiz());
        };
    }

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.onclick = () => {
            import('./quiz/quizUtils.js').then(m => {
                m.resetApp(false);
                showView('start');
            });
        };
    }

    // ==========================================
    // 3. HOMEPAGE HISTORY CARDS (Sync & Routing)
    // ==========================================
    clickRoute('sync-cloud-btn', null, () => syncHistoryWithCloud());
    clickRoute('show-all-history-btn', null, () => {
        import('./quiz/quizHistory.js').then(m => m.showAllHistoryFullScreen());
    });

    const routeHistoryClick = (e) => {
        if (e.target.closest('button')) {
            import('./quiz/quizHistory.js').then(m => m.handleHistoryClick(e));
        }
    };
    
    const listHome = document.getElementById('history-list');
    const listFull = document.getElementById('history-full-list');
    if (listHome) listHome.onclick = routeHistoryClick;
    if (listFull) listFull.onclick = routeHistoryClick;

    // ==========================================
    // 4. QUIZ SETTINGS & CUSTOMIZATION FORM MATRIX
    // ==========================================
    const toggleBtn = document.getElementById('customize-toggle-btn');
    const toggleContent = document.getElementById('customize-content');
    const toggleIcon = document.getElementById('customize-toggle-icon');
    if (toggleBtn && toggleContent) {
        toggleBtn.onclick = () => {
            const isHidden = toggleContent.classList.toggle('hidden');
            if (toggleIcon) toggleIcon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(180deg)';
        };
    }

    // Difficulty Radio Triggers (Hides/Shows Custom Selection)
    document.querySelectorAll('input[name="difficulty"]').forEach(radio => {
        radio.onchange = () => {
            const opts = document.getElementById('custom-options');
            if (opts) opts.classList.toggle('hidden', radio.value !== 'custom');
        };
    });

    // Custom Mixed Types Counters Tracker
    const typeSelect = document.getElementById('custom-question-type');
    if (typeSelect) {
        typeSelect.onchange = () => {
            const mixedPanel = document.getElementById('custom-mixed-counts');
            if (mixedPanel) mixedPanel.classList.toggle('hidden', typeSelect.value !== 'mixed');
        };
    }

    // Timed Quiz Toggles
    const timeToggle = document.getElementById('time-limit-toggle');
    const timeOptions = document.getElementById('time-limit-options');
    if (timeToggle && timeOptions) {
        timeToggle.onchange = () => timeOptions.classList.toggle('hidden', !timeToggle.checked);
    }

    document.querySelectorAll('input[name="time_preset"]').forEach(radio => {
        radio.onchange = () => {
            const customTimeInput = document.getElementById('custom-time-input-container');
            if (customTimeInput) customTimeInput.classList.toggle('hidden', radio.value !== 'custom');
        };
    });

    // Attempt Limit Toggles
    const attemptToggle = document.getElementById('attempt-limit-toggle');
    const attemptOptions = document.getElementById('attempt-limit-options');
    if (attemptToggle && attemptOptions) {
        attemptToggle.onchange = () => attemptOptions.classList.toggle('hidden', !attemptToggle.checked);
    }

    // File Inputs & Clear Actions
    const fileInp = document.getElementById('file-upload-input');
    if (fileInp) fileInp.onchange = (e) => handleFileSelect(e);

    const addMoreInp = document.getElementById('add-more-files-input');
    if (addMoreInp) addMoreInp.onchange = (e) => handleFileSelect(e);

    const importInp = document.getElementById('import-quiz-input');
    if (importInp) importInp.onchange = (e) => handleQuizImport(e);

    const clearBtn = document.getElementById('clear-files-btn');
    if (clearBtn) {
        clearBtn.onclick = async () => {
            const confirmed = await customConfirm(
                'Are you sure you want to clear the selected files? This action cannot be undone.',
                'Clear Files', 'Clear', 'Cancel', true
            );
            if (confirmed) {
                const list = document.getElementById('selected-files-list');
                const label = document.getElementById('file-name');
                if (list) list.innerHTML = '';
                if (label) label.textContent = 'Select Documents';
                state.fileContent = '';
                state.fileHash = '';
                showToast('Documents cleared.', 2000);
            }
        };
    }

    // Main Engine Activator Trigger
    const genBtn = document.getElementById('generate-quiz-btn');
    if (genBtn) genBtn.onclick = () => handleQuizGeneration(false, false);
}
export { loadSharedQuiz } from './quiz/fileHandling.js';