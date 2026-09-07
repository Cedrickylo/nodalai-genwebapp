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
    openAccountAsView,
    saveDisplayName,
    handleLogout,
    openAiPromptModal,
    closeAiPromptModal,
    autoBalanceMixedCounts,
    setHistoryVisibility,
    saveQuizToDB,
    closeHistoryActionsModal,
    openHistoryActionsModal,
    closeSharedQuizModal,
    openSharedQuizModal,
    setupCustomizeView,
    pushSubState,
    extractShareId
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
    displayCurrentQuestion,
    displayNextQuestion,
    displayPreviousQuestion,
    handleNextUnansweredOrSubmit,
    checkAndHandleSubmit,
    skipQuestion,
    checkAnswer,
    revealAnswer
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
    initQuizStatisticsListeners
} from './quiz/quizStatistics.js';

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
        summaryOnlyToggle,
        timerModeSelect,
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
        resultsActions,
        allowChangeToggle,
        prevQuestionBtn,
        nextUnansweredBtn
    } = elements;

    resumeQuizBtn.addEventListener('click', () => { if (state.savedProgress) resumeQuiz(state.savedProgress); });
    fileUploadInput.addEventListener('change', handleFileSelect);
    addMoreFilesInput.addEventListener('change', handleFileSelect);
    importQuizInput.addEventListener('change', handleQuizImport);
    generateQuizBtn.addEventListener('click', () => handleQuizGeneration(false, false));
    difficultyRadios.forEach(r => r.addEventListener('change', handleDifficultyChange));
    questionCountInput.addEventListener('input', validateAllInputs);
    customQuestionTypeSelect.addEventListener('change', handleCustomTypeChange);
    document.querySelectorAll('.custom-count').forEach(i => {
        i.addEventListener('input', validateAllInputs);
        i.addEventListener('change', validateAllInputs);
    });
    prevQuestionBtn?.addEventListener('click', displayPreviousQuestion);
    nextQuestionBtn.addEventListener('click', displayNextQuestion);
    nextUnansweredBtn?.addEventListener('click', handleNextUnansweredOrSubmit);
    skipQuestionBtn.addEventListener('click', skipQuestion);
    restartQuizBtn.addEventListener('click', () => resetApp(true));
    exportQuizBtn?.addEventListener('click', exportQuiz);
    elements.generateShareLinkBtn.onclick = () => generateShareableLink(state.currentShareQuizKey);
    // Help, About, and Account back buttons (navigate directly to homepage)
    elements.helpBackBtn?.addEventListener('click', () => showView('start'));
    elements.aboutBackBtn?.addEventListener('click', () => showView('start'));
    document.getElementById('account-mobile-back-btn')?.addEventListener('click', () => showView('start'));
    
    // Copy Link Button
    elements.copyShareLinkBtn.onclick = () => {
        elements.shareLinkInput.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 2000, 'success');
    };

    // AI Prompt Modal Event Listeners
    elements.closeAiPromptModalBtn?.addEventListener('click', closeAiPromptModal);
    elements.closeAiPromptFooterBtn?.addEventListener('click', closeAiPromptModal);
    
    elements.copyAiPromptBtn?.addEventListener('click', async () => {
        if (elements.aiPromptTextarea) {
            elements.aiPromptTextarea.select();
            try {
                await navigator.clipboard.writeText(elements.aiPromptTextarea.value);
                showToast('System prompt copied to clipboard!', 2500, 'success');
                if (elements.copyAiPromptBtnText) {
                    elements.copyAiPromptBtnText.textContent = 'Copied!';
                    setTimeout(() => {
                        if (elements.copyAiPromptBtnText) elements.copyAiPromptBtnText.textContent = 'Copy Prompt';
                    }, 2000);
                }
            } catch (err) {
                document.execCommand('copy');
                showToast('System prompt copied to clipboard!', 2500, 'success');
                if (elements.copyAiPromptBtnText) {
                    elements.copyAiPromptBtnText.textContent = 'Copied!';
                    setTimeout(() => {
                        if (elements.copyAiPromptBtnText) elements.copyAiPromptBtnText.textContent = 'Copy Prompt';
                    }, 2000);
                }
            }
        }
    });

    elements.aiPromptImportBtn?.addEventListener('click', () => {
        if (elements.importQuizInput) {
            elements.importQuizInput.click();
        }
    });

    // Fix: Navbar Account Button
    if (elements.navAccountBtn) {
        elements.navAccountBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Call the same function that your main button uses
            await openAccountAsView(); 
        });
    }

    // Fix: Navbar History Button
    if (elements.navHistoryBtn) {
        elements.navHistoryBtn.addEventListener('click', (e) => {
            e.preventDefault();
            showView('start'); 
            refreshHistory();
            
            // Smooth scroll to history if needed
            document.getElementById('history-section')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Disable Share Button
    elements.disableShareBtn.onclick = async () => {
        const quiz = state.quizHistory[state.currentShareQuizKey];
        if (quiz && quiz.share && quiz.share.shareId) {
            try {
                const { syncHistoryWithCloud, closeShareModal, showLoadingOverlay, hideLoadingOverlay } = await import('./helpers.js');

                // Provide immediate feedback: show blurred loading screen without polluting history
                if (elements.shareModal) elements.shareModal.classList.add('hidden');
                showLoadingOverlay('Revoking Link Access...', 'Removing shared quiz from cloud...');
                
                // Delete from Puter FS
                await puter.fs.delete(quiz.share.shareId);
                
                // Reset metadata
                quiz.share = { isShared: false };
                quiz.timestamp = Date.now();

                localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
                localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());

                await syncHistoryWithCloud();
                refreshHistory();
                hideLoadingOverlay();
                closeShareModal(true);
                showToast('Sharing disabled.', 3000, 'info');
            } catch (err) {
                console.error('Disable Error:', err);
                const { hideLoadingOverlay } = await import('./helpers.js');
                hideLoadingOverlay();
                if (elements.shareModal) elements.shareModal.classList.remove('hidden');
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
        const { navigateToShareStep, showToast } = await import('./helpers.js');
        if (!navigator.onLine) {
            showToast('Cannot generate a new share link while offline. Please connect to the internet.', 4000, 'warning');
            return;
        }
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
    // Target both Sync buttons to trigger cloud sync
    const triggerSync = async () => {
        const { syncHistoryWithCloud } = await import('./helpers.js');
        syncHistoryWithCloud(true);
    };

    if (syncCloudBtn) syncCloudBtn.addEventListener('click', triggerSync);
    if (elements.fullHistorySyncBtn) elements.fullHistorySyncBtn.addEventListener('click', triggerSync);
    
    timeLimitToggle.addEventListener('change', handleTimeToggle);
    timePresetRadios.forEach(r => r.addEventListener('change', handleTimePresetChange));
    attemptLimitToggle.addEventListener('change', handleAttemptToggle);

    // FIX: Add change listener to dynamically trigger visibility/clearance code
    summaryOnlyToggle.addEventListener('change', validateAllInputs);

    // FIX: Listen for timer style changes to instantly toggle and sanitize hidden fields
    if (timerModeSelect) {
        timerModeSelect.addEventListener('change', () => {
            const isQuestionMode = timerModeSelect.value === 'question';
            
            // Toggle containers cleanly using your existing layout IDs
            document.getElementById('quiz-time-presets-container')?.classList.toggle('hidden', isQuestionMode);
            document.getElementById('question-time-container')?.classList.toggle('hidden', !isQuestionMode);
            
            // AUTOMATED PURGE: Safely clear inputs when they become hidden or disabled
            if (isQuestionMode) {
                // Reset hidden total quiz time limit parameters to default state values
                const time10m = document.getElementById('time-10m');
                if (time10m) time10m.checked = true;
                if (elements.customTimeLimitInput) elements.customTimeLimitInput.value = 15;
                document.getElementById('custom-time-input-container')?.classList.add('hidden');
            } else {
                // Reset hidden question timeout inputs back to standard defaults
                if (elements.questionTimeInput) elements.questionTimeInput.value = 30;
            }
            
            validateAllInputs();
        });
    }

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
                    downloads: elements.desktopNavDownloadsBtn,
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
            elements.mobileMenuDownloadsBtn?.addEventListener('click', async () => {
                if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden');
                const { renderDownloadsView } = await import('./quiz/quizOffline.js');
                renderDownloadsView();
            });
            elements.mobileMenuHelpBtn?.addEventListener('click', () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); showView('help'); });
            elements.mobileMenuAboutBtn?.addEventListener('click', () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); showView('about'); });
            elements.mobileMenuAccountBtn?.addEventListener('click', async () => { if (elements.mobileMenuModal) elements.mobileMenuModal.classList.add('hidden'); await openAccountAsView(); });

            // Desktop nav handlers
            elements.desktopNavHomeBtn?.addEventListener('click', () => { setDesktopNavActive('home'); setMobileNavActive('home'); showView('start'); });
            elements.desktopNavHistoryBtn?.addEventListener('click', () => { setDesktopNavActive('history'); setMobileNavActive('history'); showAllHistoryFullScreen(); });
            elements.desktopNavDownloadsBtn?.addEventListener('click', async () => {
                setDesktopNavActive('downloads');
                const { renderDownloadsView } = await import('./quiz/quizOffline.js');
                renderDownloadsView();
            });
            elements.desktopNavHelpBtn?.addEventListener('click', () => { setDesktopNavActive('help'); showView('help'); });
            elements.desktopNavAboutBtn?.addEventListener('click', () => { setDesktopNavActive('about'); showView('about'); });
            elements.desktopNavAccountBtn?.addEventListener('click', async () => { setDesktopNavActive('account'); await openAccountAsView(); });

            // Downloads Back button
            elements.downloadsBackBtn?.addEventListener('click', () => {
                setDesktopNavActive('home'); setMobileNavActive('home');
                showView('start');
            });
    
    cancelCustomizeBtn.addEventListener('click', async () => {
        const { hasUnsavedChanges, clearSubState } = await import('./helpers.js');
        if (state.isCustomizingHistory) {
            if (hasUnsavedChanges()) {
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
            clearSubState('#edit');
            resetApp(true);
            if (state.editOriginView === 'history-fullscreen') {
                const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
                showAllHistoryFullScreen();
            } else {
                window.history.replaceState({ view: 'start' }, '', '#home');
                showView('start', false);
            }
            showToast('Customization closed.', 2000, 'info');
        } else {
            const confirmed = await customConfirm(
                'Are you sure you want to cancel quiz generation and return to the home screen? Any selected documents will be cleared.',
                'Cancel Quiz Generation',
                'Yes, Return Home',
                'Stay Here',
                true
            );
            if (!confirmed) return;
            clearSubState('#customize');
            resetApp(true);
            window.history.replaceState({ view: 'start' }, '', '#home');
            showToast('Quiz generation cancelled.', 2000, 'info');
        }
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

        const keyToDelete = state.customizingQuizData.key;
        const returnToHistory = state.editOriginView === 'history-fullscreen';

        const { deleteQuizPermanently, clearSubState, showLoadingOverlay, hideLoadingOverlay } = await import('./helpers.js');
        const { resetStartViewUI } = await import('./quiz/quizUtils.js');

        showLoadingOverlay('Deleting Quiz...', 'Removing quiz permanently...');
        clearSubState('#edit');
        resetStartViewUI();

        try {
            await deleteQuizPermanently(keyToDelete);
            showToast('Quiz deleted.', 3000, 'success');
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete quiz.', 3000, 'error');
        } finally {
            hideLoadingOverlay();
        }

        if (returnToHistory) {
            const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
            window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
            showAllHistoryFullScreen();
        } else {
            window.history.replaceState({ view: 'start' }, '', '#home');
            showView('start', false);
        }
    });

    document.getElementById('customize-toggle-btn').addEventListener('click', () => {
        const content = document.getElementById('customize-content');
        content.classList.toggle('hidden');
        document.getElementById('customize-toggle-icon').classList.toggle('rotate-180');

        if (!content.classList.contains('hidden')) {
            resumeQuizBtn.classList.add('hidden');
            setHistoryVisibility(false);
            if (!state.isCustomizingHistory) {
                document.getElementById('quiz-custom-summary-banner')?.remove();
                document.getElementById('quiz-type-group')?.classList.remove('hidden');
                document.getElementById('ui-mode-group')?.classList.remove('hidden');
                document.getElementById('question-count-group')?.classList.remove('hidden');
                document.getElementById('difficulty-group')?.classList.remove('hidden');
            }
        } else {
            prepareResumeButton();
            if (!state.isCustomizingHistory && (!state.currentFiles || state.currentFiles.length === 0)) {
                setHistoryVisibility(true);
            }
        }
    });

    createRemedialBtn.addEventListener('click', setupRemedialView);
    cancelRemedialBtn.addEventListener('click', () => {
        remedialOptionsView.classList.add('hidden');
        resultsActions.classList.remove('hidden');
        
        // FIXED: Changed .add('hidden') to .remove('hidden') so button returns safely
        createRemedialBtn.classList.remove('hidden'); 
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

    // --- Advanced Customization Interface Event Handlers ---
    if (elements.timerModeSelect) {
        elements.timerModeSelect.addEventListener('change', () => {
            const isQuestionMode = elements.timerModeSelect.value === 'question';
            const qTimeContainer = document.getElementById('question-time-container');
            if (qTimeContainer) qTimeContainer.classList.toggle('hidden', !isQuestionMode);
            validateAllInputs();
        });
    }

    if (elements.questionTimeInput) {
        elements.questionTimeInput.addEventListener('input', validateAllInputs);
    }

    if (elements.secondChanceToggle) {
        elements.secondChanceToggle.addEventListener('change', () => {
            const sChanceOptions = document.getElementById('second-chance-options');
            if (sChanceOptions) sChanceOptions.classList.toggle('hidden', !elements.secondChanceToggle.checked);
            validateAllInputs();
        });
    }

    if (elements.manualRevealToggle) {
        elements.manualRevealToggle.addEventListener('change', validateAllInputs);
    }
    
    if (elements.shuffleQuestionsToggle) {
        elements.shuffleQuestionsToggle.addEventListener('change', validateAllInputs);
    }
    
    if (elements.shuffleChoicesToggle) {
        elements.shuffleChoicesToggle.addEventListener('change', validateAllInputs);
    }

    if (elements.revealAnswerBtn) {
        elements.revealAnswerBtn.addEventListener('click', revealAnswer);
    }

    // Mobile History Actions Submenu Event Listeners
    if (elements.historyActionsBackdrop) {
        elements.historyActionsBackdrop.addEventListener('click', () => closeHistoryActionsModal(false));
    }
    if (elements.historyActionsCloseBtn) {
        elements.historyActionsCloseBtn.addEventListener('click', () => closeHistoryActionsModal(false));
    }
    if (elements.historyActionsCancelBtn) {
        elements.historyActionsCancelBtn.addEventListener('click', () => closeHistoryActionsModal(false));
    }
    if (elements.historySubmenuOfflineBtn) {
        elements.historySubmenuOfflineBtn.addEventListener('click', async () => {
            const key = state.activeHistoryMenuKey;
            closeHistoryActionsModal(false, false);
            if (key) {
                const { openOfflineModal } = await import('./quiz/quizOffline.js');
                openOfflineModal(key);
            }
        });
    }
    if (elements.historySubmenuStatsBtn) {
        elements.historySubmenuStatsBtn.addEventListener('click', async () => {
            const key = state.activeHistoryMenuKey;
            const { getActiveViewId } = await import('./helpers.js');
            const activeV = getActiveViewId();
            const origin = (state.historyMenuOriginHash === '#home' || state.historyMenuOriginHash === '' || activeV === 'start')
                ? 'home'
                : (state.historyMenuOriginHash === '#downloads' || activeV === 'downloads')
                ? 'downloads'
                : 'history';
            closeHistoryActionsModal(false, false);
            if (key) {
                const { openQuizStatistics } = await import('./quiz/quizStatistics.js');
                openQuizStatistics(key, true, origin);
            }
        });
    }
    if (elements.historySubmenuShareBtn) {
        elements.historySubmenuShareBtn.addEventListener('click', () => {
            const key = state.activeHistoryMenuKey;
            closeHistoryActionsModal(false, false);
            if (key) {
                handleHistoryClick({ target: { closest: () => ({ dataset: { key, action: 'share' } }) } });
            }
        });
    }
    if (elements.historySubmenuEditBtn) {
        elements.historySubmenuEditBtn.addEventListener('click', () => {
            const key = state.activeHistoryMenuKey;
            closeHistoryActionsModal(false, false);
            if (key) {
                handleHistoryClick({ target: { closest: () => ({ dataset: { key, action: 'customize' } }) } });
            }
        });
    }
    if (elements.historySubmenuDeleteBtn) {
        elements.historySubmenuDeleteBtn.addEventListener('click', () => {
            const key = state.activeHistoryMenuKey;
            closeHistoryActionsModal(false, false);
            if (key) {
                handleHistoryClick({ target: { closest: () => ({ dataset: { key, action: 'delete' } }) } });
            }
        });
    }

    // Shared Quiz Received Action Modal Event Listeners
    if (elements.sharedQuizCloseBtn) {
        elements.sharedQuizCloseBtn.addEventListener('click', () => closeSharedQuizModal(false, true));
    }
    if (elements.sharedQuizStartBtn) {
        elements.sharedQuizStartBtn.addEventListener('click', () => {
            if (!state.pendingSharedQuiz) return;
            const pending = state.pendingSharedQuiz;
            let quizKey;

            if (pending.isAlreadySaved && pending.existingKey) {
                // Reuse existing key without making a duplicate copy!
                quizKey = pending.existingKey;
                const existing = state.quizHistory[quizKey] || pending.existingQuiz;
                state.questions = existing.questions || pending.questions;
                state.currentQuizConfig = existing.config || pending.config || {};
                state.currentFileName = existing.fileName || pending.fileName || 'Shared Quiz';
            } else {
                quizKey = 'shared-' + Date.now();
                const validShareId = (pending.shareId && pending.shareId !== 'token-read' && pending.shareId !== 'read') ? pending.shareId : extractShareId(pending.shareUrl);
                saveQuizToDB(quizKey, {
                    questions: pending.questions,
                    fileName: pending.fileName,
                    config: pending.config,
                    sourceShareId: validShareId,
                    sourceShareUrl: pending.shareUrl
                });
                refreshHistory();
                state.questions = pending.questions;
                state.currentQuizConfig = pending.config || {};
                state.currentFileName = pending.fileName || 'Shared Quiz';
            }
            
            clearInProgressQuiz();
            state.currentQuizKey = quizKey;
            state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
            state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
            state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
            state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;
            
            closeSharedQuizModal(false, false);
            showToast('Quiz started!', 2000, 'success');
            startQuiz();
        });
    }
    if (elements.sharedQuizCustomizeBtn) {
        elements.sharedQuizCustomizeBtn.addEventListener('click', () => {
            if (!state.pendingSharedQuiz) return;
            const pending = state.pendingSharedQuiz;
            let quizKey;
            let questionsToUse;
            let configToUse;
            let fileNameToUse;

            if (pending.isAlreadySaved && pending.existingKey) {
                // Reuse existing quiz settings without duplicating
                quizKey = pending.existingKey;
                const existing = state.quizHistory[quizKey] || pending.existingQuiz;
                questionsToUse = existing.questions || pending.questions;
                configToUse = existing.config || pending.config;
                fileNameToUse = existing.fileName || pending.fileName;
            } else {
                quizKey = 'shared-' + Date.now();
                const validShareId = (pending.shareId && pending.shareId !== 'token-read' && pending.shareId !== 'read') ? pending.shareId : extractShareId(pending.shareUrl);
                saveQuizToDB(quizKey, {
                    questions: pending.questions,
                    fileName: pending.fileName,
                    config: pending.config,
                    sourceShareId: validShareId,
                    sourceShareUrl: pending.shareUrl
                });
                refreshHistory();
                questionsToUse = pending.questions;
                configToUse = pending.config;
                fileNameToUse = pending.fileName;
            }

            state.editOriginView = 'start';
            state.customizingQuizData = { key: quizKey, questions: questionsToUse, config: configToUse, fileName: fileNameToUse };
            closeSharedQuizModal(false, false);
            setupCustomizeView(configToUse, fileNameToUse);
            setHistoryVisibility(false);
            showView('start', false);
            pushSubState('#edit');
            showToast('Quiz settings loaded.', 2000, 'info');
        });
    }
    if (elements.sharedQuizSaveBtn) {
        elements.sharedQuizSaveBtn.addEventListener('click', () => {
            if (!state.pendingSharedQuiz) return;
            const pending = state.pendingSharedQuiz;

            if (pending.isAlreadySaved && pending.existingKey) {
                // Already saved in account! Do not duplicate!
                const existing = state.quizHistory[pending.existingKey] || pending.existingQuiz;
                const existingName = existing?.fileName || pending.fileName || 'Quiz';
                closeSharedQuizModal(false, false);
                showToast(`"${existingName}" is already saved in your library!`, 3000, 'info');
                return;
            }

            const quizKey = 'shared-' + Date.now();
            const validShareId = (pending.shareId && pending.shareId !== 'token-read' && pending.shareId !== 'read') ? pending.shareId : extractShareId(pending.shareUrl);
            saveQuizToDB(quizKey, {
                questions: pending.questions,
                fileName: pending.fileName,
                config: pending.config,
                sourceShareId: validShareId,
                sourceShareUrl: pending.shareUrl
            });
            refreshHistory();
            closeSharedQuizModal(false, false);
            showToast(`Saved "${pending.fileName || 'Quiz'}" to history!`, 3000, 'success');
        });
    }

    initQuizStatisticsListeners();
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
    displayCurrentQuestion,
    displayNextQuestion,
    displayPreviousQuestion,
    handleNextUnansweredOrSubmit,
    checkAndHandleSubmit,
    skipQuestion,
    checkAnswer,
    revealAnswer,
    
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

// Initialize Offline downloads listeners and prune expired downloads on startup
import('./quiz/quizOffline.js').then(({ initQuizOfflineListeners, pruneExpiredOfflineDownloads }) => {
    initQuizOfflineListeners();
    pruneExpiredOfflineDownloads();
}).catch(err => console.error('[Quiz] Failed to initialize offline module:', err));

