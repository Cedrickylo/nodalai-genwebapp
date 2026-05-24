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
    refreshHistory
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
    const {
        resumeQuizBtn,
        fileUploadInput,
        addMoreFilesInput,
        importQuizInput,
        generateQuizBtn,
        difficultyRadios,
        questionCountInput,
        customQuestionTypeSelect,
        customCountInputs,
        nextQuestionBtn,
        skipQuestionBtn,
        restartQuizBtn,
        exportQuizBtn,
        homeBtn,
        saveQuizBtn,
        historyList,
        showAllHistoryBtn,
        syncCloudBtn,
        timeLimitToggle,
        timePresetRadios,
        customTimeLimitInput,
        attemptLimitToggle,
        attemptLimitInput,
        cancelCustomizeBtn,
        deleteCustomizeBtn,
        createRemedialBtn,
        cancelRemedialBtn,
        generateRemedialQuizBtn,
        remedialDifficultyRadios,
        remedialCustomQuestionTypeSelect,
        remedialCustomCountInputs,
        remedialQuestionCountInput,
        remedialTimeLimitToggle,
        remedialTimePresetRadios,
        remedialAttemptLimitToggle,
        remedialCustomTimeLimitInput,
        remedialAttemptLimitInput,
        remedialCustomTimeInputContainer,
        remedialTimeLimitOptions,
        remedialAttemptLimitOptions,
        remedialOptionsView,
        resultsActions
    } = elements;

    resumeQuizBtn.addEventListener('click', () => { if (state.savedProgress) resumeQuiz(state.savedProgress); });
    fileUploadInput.addEventListener('change', handleFileSelect);
    addMoreFilesInput.addEventListener('change', handleFileSelect);
    importQuizInput.addEventListener('change', handleQuizImport);
    generateQuizBtn.addEventListener('click', () => handleQuizGeneration(false, false));
    difficultyRadios.forEach(r => r.addEventListener('change', handleDifficultyChange));
    questionCountInput.addEventListener('input', validateAllInputs);
    customQuestionTypeSelect.addEventListener('change', handleCustomTypeChange);
    customCountInputs.forEach(i => i.addEventListener('input', validateAllInputs));
    nextQuestionBtn.addEventListener('click', displayNextQuestion);
    skipQuestionBtn.addEventListener('click', skipQuestion);
    restartQuizBtn.addEventListener('click', () => resetApp(true));
    exportQuizBtn.addEventListener('click', exportQuiz);
    elements.generateShareLinkBtn.onclick = () => generateShareableLink(state.currentShareQuizKey);
    
    // Copy Link Button
    elements.copyShareLinkBtn.onclick = () => {
        elements.shareLinkInput.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 2000, 'success');
    };

    // Disable Share Button
    elements.disableShareBtn.onclick = async () => {
        const quiz = state.quizHistory[state.currentShareQuizKey];
        if (quiz && quiz.share && quiz.share.shareId) {
            try {
                const { syncHistoryWithCloud, closeShareModal } = await import('./helpers.js');
                
                // Delete from Puter FS
                await puter.fs.delete(quiz.share.shareId);
                
                // Reset metadata
                quiz.share = { isShared: false };
                quiz.timestamp = Date.now();

                localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
                localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());

                await syncHistoryWithCloud();
                refreshHistory();
                closeShareModal();
                showToast('Sharing disabled.', 3000, 'info');
            } catch (err) {
                console.error('Disable Error:', err);
                showToast('Failed to disable sharing.', 3000, 'error');
            }
        }
    };

    // Modal Navigation & Closing
    elements.closeShareModalBtn.onclick = async () => {
        const { closeShareModal } = await import('./helpers.js');
        closeShareModal();
    };
    elements.shareMenuLinkBtn.onclick = async () => {
        const { navigateToShareStep } = await import('./helpers.js');
        navigateToShareStep('config');
    };
    elements.shareMenuExportBtn.onclick = async () => {
        const { exportQuizAsJSON, closeShareModal } = await import('./helpers.js');
        exportQuizAsJSON(state.currentShareQuizKey);
        closeShareModal();
    };
    elements.shareBackBtn.onclick = async () => {
        const { navigateToShareStep } = await import('./helpers.js');
        navigateToShareStep('menu');
    };
    
    homeBtn.addEventListener('click', async () => { 
        if (await customConfirm('Save progress and return to the home screen?', 'Return Home', 'Save & Exit', 'Cancel')) {
            saveAndGoHome(); 
        }
    });
    
    saveQuizBtn.addEventListener('click', saveCurrentQuiz);
    historyList.addEventListener('click', handleHistoryClick);
    showAllHistoryBtn?.addEventListener('click', () => showAllHistoryFullScreen());
    // Full-screen history back button
    elements.historyFullscreenBackBtn?.addEventListener('click', () => showView('start'));
    // Mobile bottom nav
    elements.mobileNavHomeBtn?.addEventListener('click', () => {
        showView('start');
        // ensure we scroll to top when returning home on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    elements.mobileNavHistoryBtn?.addEventListener('click', () => {
        showAllHistoryFullScreen();
    });
    syncCloudBtn.addEventListener('click', async () => {
        const { syncHistoryWithCloud } = await import('./helpers.js');
        syncHistoryWithCloud(true);
    });
    
    timeLimitToggle.addEventListener('change', handleTimeToggle);
    timePresetRadios.forEach(r => r.addEventListener('change', handleTimePresetChange));
            // Mobile nav active state helper
            function setMobileNavActive(key) {
                const homeBtn = elements.mobileNavHomeBtn;
                const histBtn = elements.mobileNavHistoryBtn;
                if (homeBtn) {
                    homeBtn.classList.toggle('text-white', key === 'home');
                    homeBtn.classList.toggle('bg-blue-600', key === 'home');
                    homeBtn.classList.toggle('text-gray-300', key !== 'home');
                    homeBtn.setAttribute('aria-current', key === 'home' ? 'true' : 'false');
                }
                if (histBtn) {
                    histBtn.classList.toggle('text-white', key === 'history');
                    histBtn.classList.toggle('bg-blue-600', key === 'history');
                    histBtn.classList.toggle('text-gray-300', key !== 'history');
                    histBtn.setAttribute('aria-current', key === 'history' ? 'true' : 'false');
                }
            }

            // Desktop nav active state helper
            function setDesktopNavActive(key) {
                const map = {
                    home: elements.desktopNavHomeBtn,
                    history: elements.desktopNavHistoryBtn,
                    help: elements.desktopNavHelpBtn,
                    about: elements.desktopNavAboutBtn,
                    account: elements.desktopNavAccountBtn
                };
                Object.keys(map).forEach(k => {
                    const btn = map[k];
                    if (!btn) return;
                    btn.classList.toggle('text-white', k === key);
                    btn.classList.toggle('bg-blue-600', k === key);
                    btn.classList.toggle('text-gray-300', k !== key);
                    btn.setAttribute('aria-current', k === key ? 'true' : 'false');
                });
            }

            elements.mobileNavHomeBtn?.addEventListener('click', () => {
                setMobileNavActive('home'); setDesktopNavActive('home');
                showView('start');
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            elements.mobileNavHistoryBtn?.addEventListener('click', () => {
                setMobileNavActive('history'); setDesktopNavActive('history');
                showAllHistoryFullScreen();
            });
            // Menu open/close (mobile)
            elements.mobileNavMenuBtn?.addEventListener('click', () => {
                if (elements.mobileMenuModal) elements.mobileMenuModal.classList.remove('hidden');
            });
            elements.mobileMenuCloseBtn?.addEventListener('click', () => {
                if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden');
            });
            elements.mobileMenuBackdrop?.addEventListener('click', () => {
                if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden');
            });
            elements.mobileMenuHelpBtn?.addEventListener('click', () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); showToast('Help: For assistance, visit docs or contact support.'); });
            elements.mobileMenuAboutBtn?.addEventListener('click', () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); showToast('About: Nodal AI v1.'); });
            elements.mobileMenuAccountBtn?.addEventListener('click', () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); elements.accountModal?.classList.remove('hidden'); });

            // Desktop nav handlers
            elements.desktopNavHomeBtn?.addEventListener('click', () => { setDesktopNavActive('home'); setMobileNavActive('home'); showView('start'); });
            elements.desktopNavHistoryBtn?.addEventListener('click', () => { setDesktopNavActive('history'); setMobileNavActive('history'); showAllHistoryFullScreen(); });
            elements.desktopNavHelpBtn?.addEventListener('click', () => { setDesktopNavActive('help'); showToast('Help: For assistance, visit docs or contact support.'); });
            elements.desktopNavAboutBtn?.addEventListener('click', () => { setDesktopNavActive('about'); showToast('About: Nodal AI v1.'); });
            elements.desktopNavAccountBtn?.addEventListener('click', () => { setDesktopNavActive('account'); elements.accountModal?.classList.remove('hidden'); });
    
    cancelCustomizeBtn.addEventListener('click', async () => {
        const { hasUnsavedChanges, setupCustomizeView } = await import('./helpers.js');
        if (hasUnsavedChanges() && state.isCustomizingHistory) {
            const wantsToSave = await customConfirm(
                'You have unsaved changes! Do you want to save them before exiting?\n\n• OK = Save changes\n• Cancel = Discard changes',
                'Unsaved Changes',
                'Save Changes',
                'Discard',
                false
            );
            
            if (wantsToSave) {
                handleQuizGeneration(false, true);
                return;
            }
        }
        resetApp(true);
    });
    
    deleteCustomizeBtn.addEventListener('click', async () => {
        if (!state.isCustomizingHistory || !state.customizingQuizData) return;

        const confirmed = await customConfirm(
            'Delete this quiz from history? This action cannot be undone.',
            'Delete Quiz',
            'Delete',
            'Cancel',
            true
        );
        if (!confirmed) return;

        delete state.quizHistory[state.customizingQuizData.key];
        localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
        refreshHistory();
        showToast('Quiz deleted.', 3000, 'success');
        resetApp(true);
    });

    document.getElementById('customize-toggle-btn').addEventListener('click', () => {
        const content = document.getElementById('customize-content');
        content.classList.toggle('hidden');
        document.getElementById('customize-toggle-icon').classList.toggle('rotate-180');

        if (!content.classList.contains('hidden')) {
            resumeQuizBtn.classList.add('hidden');
        } else {
            prepareResumeButton();
        }
    });

    createRemedialBtn.addEventListener('click', setupRemedialView);
    cancelRemedialBtn.addEventListener('click', () => {
        remedialOptionsView.classList.add('hidden');
        resultsActions.classList.remove('hidden');
        createRemedialBtn.classList.add('hidden');
    });
    generateRemedialQuizBtn.addEventListener('click', () => handleQuizGeneration(true, false));
    remedialDifficultyRadios.forEach(r => r.addEventListener('change', handleRemedialDifficultyChange));
    remedialCustomQuestionTypeSelect.addEventListener('change', handleRemedialCustomTypeChange);
    remedialCustomCountInputs.forEach(i => i.addEventListener('input', validateRemedialInputs));
    remedialQuestionCountInput.addEventListener('input', validateRemedialInputs);
    remedialTimeLimitToggle.addEventListener('change', () => {
        remedialTimeLimitOptions.classList.toggle('hidden', !remedialTimeLimitToggle.checked);
        if (remedialTimeLimitToggle.checked) {
            const sel = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
            remedialCustomTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
        } else {
            remedialCustomTimeInputContainer.classList.add('hidden');
        }
        validateRemedialInputs();
    });
    remedialAttemptLimitToggle.addEventListener('change', () => {
        remedialAttemptLimitOptions.classList.toggle('hidden', !remedialAttemptLimitToggle.checked);
        validateRemedialInputs();
    });
    remedialTimePresetRadios.forEach(r => r.addEventListener('change', () => {
        const sel = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
        remedialCustomTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
        validateRemedialInputs();
    }));
    remedialCustomTimeLimitInput.addEventListener('input', validateRemedialInputs);
    remedialAttemptLimitInput.addEventListener('input', validateRemedialInputs);
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
