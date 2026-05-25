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
            // FIX: Replaced Node.js 'require' with browser-supported dynamic 'import()'
            import('./quiz/quizHistory.js')
                .then(module => {
                    if (module && typeof module.showAllHistoryFullScreen === 'function') {
                        module.showAllHistoryFullScreen();
                    } else {
                        showView('history-fullscreen-view');
                    }
                })
                .catch(err => {
                    console.warn("Lazy history module loading failed, falling back to direct view toggle:", err);
                    showView('history-fullscreen-view');
                });
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
            // Safely trigger full rendering loop if lists are empty
            import('./quiz/quizHistory.js').then(module => {
                if (module && typeof module.showAllHistoryFullScreen === 'function') {
                    module.showAllHistoryFullScreen();
                }
            }).catch(() => {
                const showAllBtn = document.getElementById('show-all-history-btn');
                if (showAllBtn) showAllBtn.click();
            });
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
    const inlineShowAllHistoryBtn = document.getElementById('show-all-history-btn');
    if (inlineShowAllHistoryBtn) {
        inlineShowAllHistoryBtn.onclick = () => {
            import('./quiz/quizHistory.js').then(module => {
                if (module && module.showAllHistoryFullScreen) {
                    module.showAllHistoryFullScreen();
                }
            }).catch(() => {
                showView('history-fullscreen-view');
            });
        };
    }

    // --- FIX: CORE QUIZ OPERATIONS BINDINGS ---
    
    // 1. Select Documents Trigger
    const fileUploadInput = document.getElementById('file-upload-input');
    if (fileUploadInput) {
        fileUploadInput.onchange = (e) => {
            if (typeof handleFileSelect === 'function') handleFileSelect(e);
        };
    }

    // 2. Add More Documents Trigger
    const addMoreFilesInput = document.getElementById('add-more-files-input');
    if (addMoreFilesInput) {
        addMoreFilesInput.onchange = (e) => {
            if (typeof handleFileSelect === 'function') handleFileSelect(e);
        };
    }

    // 3. Import Quiz JSON Button
    const importQuizInput = document.getElementById('import-quiz-input');
    if (importQuizInput) {
        importQuizInput.onchange = (e) => {
            if (typeof handleQuizImport === 'function') handleQuizImport(e);
        };
    }

    // 4. Main Generate Quiz Button Engine
    const generateQuizBtn = document.getElementById('generate-quiz-btn');
    if (generateQuizBtn) {
        generateQuizBtn.onclick = () => {
            if (typeof handleQuizGeneration === 'function') {
                handleQuizGeneration(false, false);
            }
        };
    }

    // 5. Resume Quiz Progress Button
    const resumeQuizBtn = document.getElementById('resume-quiz-btn');
    if (resumeQuizBtn) {
        resumeQuizBtn.onclick = () => {
            if (typeof resumeQuiz === 'function') resumeQuiz();
        };
    }

    // 6. Settings Flyout Container Toggle
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
