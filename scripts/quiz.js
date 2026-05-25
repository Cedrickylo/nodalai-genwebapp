// =====================================================================
// QUIZ.JS - Main Entry Point
// This file imports all quiz modules and exports the public API
// =====================================================================

import { elements, state, constants } from './state.js';
import { 
    showToast,
    showView,
    customConfirm,
    clearHistory,
    handleTimePresetChange,
    handleCustomTypeChange,
    handleTimeToggle,
    handleAttemptToggle,
    validateAllInputs,
    handleDifficultyChange,
    clearInProgressQuiz,
    refreshHistory,
    openAccountModal,
    saveDisplayName,
    handleLogout
} from './helpers.js';

// Import modules
import { 
    handleFileSelect, 
    handleQuizImport, 
    resumeQuiz, 
    loadSharedQuiz,
    renderSelectedFilesList 
} from './quiz/fileHandling.js';

import { 
    handleQuizGeneration 
} from './quiz/quizGeneration.js';

import { 
    startQuiz,
    startQuizTimer,
    updateTimerDisplay,
    stopQuizTimer,
    updateAttemptDisplay,
    handleTimeUp,
    displayNextQuestion,
    skipQuestion,
    checkAnswer
} from './quiz/quizExecution.js';

import { 
    displayExplanation,
    showResults,
    setupRemedialView,
    handleRemedialDifficultyChange,
    handleRemedialCustomTypeChange,
    handleRemedialTimeToggle,
    handleRemedialAttemptToggle,
    handleRemedialTimePresetChange,
    validateRemedialInputs
} from './quiz/quizResults.js';

import { 
    handleHistoryClick,
    exportQuiz,
    exportQuizFromHistory,
    generateShareableLink,
    showAllHistoryFullScreen
} from './quiz/quizHistory.js';

import { 
    resetApp,
    resetStartViewUI,
    startLoadingAnimation,
    stopLoadingAnimation,
    saveCurrentQuiz,
    saveAndGoHome
} from './quiz/quizUtils.js';

const { IN_PROGRESS_QUIZ_KEY } = constants;

// =====================================================================
// EVENT LISTENERS SETUP
// =====================================================================

export function attachQuizEventListeners() {
    // Desktop View Navigation Button Checks
    const navHomeBtn = document.getElementById('desktop-nav-home-btn');
    if (navHomeBtn) {
        navHomeBtn.onclick = () => {
            showView('start');
            if (typeof refreshHistory === 'function') refreshHistory();
        };
    }

    const navHistoryBtn = document.getElementById('desktop-nav-history-btn');
    if (navHistoryBtn) {
        navHistoryBtn.onclick = () => {
            const { showAllHistoryFullScreen } = require('./quiz/quizHistory.js'); // fallback lazy link if decoupled
            if (typeof showAllHistoryFullScreen === 'function') {
                showAllHistoryFullScreen();
            } else {
                showView('history-fullscreen');
            }
        };
    }

    const navHelpBtn = document.getElementById('desktop-nav-help-btn');
    if (navHelpBtn) {
        navHelpBtn.onclick = () => showView('help');
    }

    const navAboutBtn = document.getElementById('desktop-nav-about-btn');
    if (navAboutBtn) {
        navAboutBtn.onclick = () => showView('about');
    }

    const navAccountBtn = document.getElementById('desktop-nav-account-btn');
    if (navAccountBtn) {
        navAccountBtn.onclick = () => {
            if (typeof openAccountModal === 'function') openAccountModal();
        };
    }

    // Mobile View Navigation Button Checks
    const mobileNavHomeBtn = document.getElementById('mobile-nav-home-btn');
    if (mobileNavHomeBtn) {
        mobileNavHomeBtn.onclick = () => {
            showView('start');
            if (typeof refreshHistory === 'function') refreshHistory();
        };
    }

    const mobileNavHistoryBtn = document.getElementById('mobile-nav-history-btn');
    if (mobileNavHistoryBtn) {
        mobileNavHistoryBtn.onclick = () => {
            showView('history-fullscreen-view');
            const fullList = document.getElementById('history-full-list');
            if (fullList && fullList.children.length === 0) {
                // Trigger full rendering layout shift if list container elements exist empty
                const showAllBtn = document.getElementById('show-all-history-btn');
                if (showAllBtn) showAllBtn.click();
            }
        };
    }

    const mobileNavMenuBtn = document.getElementById('mobile-nav-menu-btn');
    const mobileMenuModal = document.getElementById('mobile-menu-modal');
    if (mobileNavMenuBtn && mobileMenuModal) {
        mobileNavMenuBtn.onclick = () => mobileMenuModal.classList.remove('hidden');
    }

    const mobileMenuCloseBtn = document.getElementById('mobile-menu-close-btn');
    if (mobileMenuCloseBtn && mobileMenuModal) {
        mobileMenuCloseBtn.onclick = () => mobileMenuModal.classList.add('hidden');
    }

    const mobileMenuBackdrop = document.getElementById('mobile-menu-backdrop');
    if (mobileMenuBackdrop && mobileMenuModal) {
        mobileMenuBackdrop.onclick = () => mobileMenuModal.classList.add('hidden');
    }

    // Mobile Menu Internal Buttons Guard
    const mobileMenuHelpBtn = document.getElementById('mobile-menu-help-btn');
    if (mobileMenuHelpBtn) {
        mobileMenuHelpBtn.onclick = () => {
            if (mobileMenuModal) mobileMenuModal.classList.add('hidden');
            showView('help');
        };
    }

    const mobileMenuAboutBtn = document.getElementById('mobile-menu-about-btn');
    if (mobileMenuAboutBtn) {
        mobileMenuAboutBtn.onclick = () => {
            if (mobileMenuModal) mobileMenuModal.classList.add('hidden');
            showView('about');
        };
    }

    const mobileMenuAccountBtn = document.getElementById('mobile-menu-account-btn');
    if (mobileMenuAccountBtn) {
        mobileMenuAccountBtn.onclick = () => {
            if (mobileMenuModal) mobileMenuModal.classList.add('hidden');
            if (typeof openAccountModal === 'function') openAccountModal();
        };
    }

    // Secondary View Elements Back Actions Checks
    const historyBackBtn = document.getElementById('history-fullscreen-back-btn');
    if (historyBackBtn) {
        historyBackBtn.onclick = () => showView('start');
    }

    const helpBackBtn = document.getElementById('help-back-btn');
    if (helpBackBtn) {
        helpBackBtn.onclick = () => showView('start');
    }

    const aboutBackBtn = document.getElementById('about-back-btn');
    if (aboutBackBtn) {
        aboutBackBtn.onclick = () => showView('start');
    }

    // Share Modal Elements Sub-System Guard
    const closeShareModalBtn = document.getElementById('close-share-modal-btn');
    if (closeShareModalBtn && typeof closeShareModal === 'function') {
        closeShareModalBtn.onclick = closeShareModal;
    }

    // Shared Link Core Interceptors Guard
    if (elements.showAllHistoryBtn) {
        elements.showAllHistoryBtn.onclick = () => {
            // Dyn import fallback connector if context maps to different target name files
            import('./quiz/quizHistory.js').then(module => {
                if (module && module.showAllHistoryFullScreen) {
                    module.showAllHistoryFullScreen();
                }
            }).catch(() => {
                showView('history-fullscreen-view');
            });
        };
    }
}

export function prepareResumeButton() {
    try {
        const { resumeQuizBtn } = elements;
        const saved = localStorage.getItem(IN_PROGRESS_QUIZ_KEY);
        if (saved && document.getElementById('customize-content').classList.contains('hidden')) {
            const data = JSON.parse(saved);
            if (data?.questions?.length && (data.shuffledIndexPos < data.shuffledIndices?.length || data.inSkippedRound)) {
                state.savedProgress = data;
                resumeQuizBtn.classList.remove('hidden');
                resumeQuizBtn.textContent = `Resume: ${data.fileName || 'Quiz'} (${data.answeredIndices?.length || 0}/${data.questions.length})`;
            } else {
                clearInProgressQuiz();
            }
        }
    } catch (e) {
        console.error('Could not read progress', e);
        clearInProgressQuiz();
    }
}

// =====================================================================
// PUBLIC API EXPORTS
// =====================================================================

export {
    // File handling
    handleFileSelect,
    handleQuizImport,
    resumeQuiz,
    loadSharedQuiz,
    renderSelectedFilesList,
    
    // Quiz generation
    handleQuizGeneration,
    
    // Quiz execution
    startQuiz,
    startQuizTimer,
    updateTimerDisplay,
    stopQuizTimer,
    updateAttemptDisplay,
    handleTimeUp,
    displayNextQuestion,
    skipQuestion,
    checkAnswer,
    
    // Results
    displayExplanation,
    showResults,
    setupRemedialView,
    handleRemedialDifficultyChange,
    handleRemedialCustomTypeChange,
    handleRemedialTimeToggle,
    handleRemedialAttemptToggle,
    handleRemedialTimePresetChange,
    validateRemedialInputs,
    
    // History
    handleHistoryClick,
    exportQuiz,
    exportQuizFromHistory,
    generateShareableLink,
    
    // Utils
    resetApp,
    resetStartViewUI,
    startLoadingAnimation,
    stopLoadingAnimation,
    saveCurrentQuiz,
    saveAndGoHome
};

// Initialize
const clearFilesBtn = document.getElementById('clear-files-btn');
if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', async () => {
        const confirmed = await customConfirm(
            'Are you sure you want to clear the selected files? This action cannot be undone.',
            'Clear Files',
            'Clear',
            'Cancel',
            true // true makes the button red (destructive)
        );

        if (confirmed) {
            resetApp();
        }
    });
}
