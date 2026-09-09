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
    openAiChoiceModal,
    closeAiChoiceModal,
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
    extractShareId,
    closeModalWithAnimation,
    updateResumeButtonVisibility,
    getGenerationCooldownWarning,
    confirmLeaveCustomizeIfActive
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
    handleQuizGeneration,
    startNodalAiGeneration,
    cancelNodalAiGeneration,
    cancelNodalAiGenerationAndCopyPrompt
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
    openRemedialSetupModal,
    closeRemedialSetupModal,
    handleRemedialDifficultyChange,
    handleRemedialCustomTypeChange,
    handleRemedialTimerModeChange,
    handleRemedialSecondChanceToggle,
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
        muteSoundBtn,
        historyList,
        showAllHistoryBtn,
        syncCloudBtn,
        timeLimitToggle,
        timePresetRadios,
        customTimeLimitInput,
        attemptLimitToggle,
        attemptLimitInput,
        saveCustomizeBtn,
        cancelCustomizeBtn,
        deleteCustomizeBtn,
        createRemedialBtn,
        closeRemedialSetupModalBtn,
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
    saveCustomizeBtn?.addEventListener('click', () => handleQuizGeneration(false, true));
    difficultyRadios.forEach(r => r.addEventListener('change', handleDifficultyChange));
    questionCountInput.addEventListener('input', validateAllInputs);
    customQuestionTypeSelect.addEventListener('change', handleCustomTypeChange);
    document.querySelectorAll('.custom-count').forEach(i => {
        i.addEventListener('input', validateAllInputs);
        i.addEventListener('change', validateAllInputs);
    });
    elements.editQuizNameInput?.addEventListener('input', (e) => {
        if (e.target.value.length > 35) {
            e.target.value = e.target.value.slice(0, 35);
        }
    });
    elements.remedialQuizNameInput?.addEventListener('input', (e) => {
        if (e.target.value.length > 35) {
            e.target.value = e.target.value.slice(0, 35);
        }
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

    // AI Choice Modal Event Listeners
    elements.closeAiChoiceModalBtn?.addEventListener('click', () => closeAiChoiceModal());
    elements.closeAiChoiceFooterBtn?.addEventListener('click', () => closeAiChoiceModal());
    elements.aiChoiceModal?.addEventListener('click', (e) => {
        if (e.target === elements.aiChoiceModal) closeAiChoiceModal();
    });
    elements.aiChoiceNodalBtn?.addEventListener('click', () => {
        const warning = getGenerationCooldownWarning();
        if (warning) {
            showToast(warning, 5000, 'warning');
            return;
        }
        startNodalAiGeneration(state.currentQuizConfig, state.currentFileName);
    });
    elements.aiChoiceOtherBtn?.addEventListener('click', () => {
        closeAiChoiceModal(false, true);
        openAiPromptModal(state.currentQuizConfig, state.currentFileName, false);
    });

    // Loading View Cancel Buttons
    elements.loadingCancelCopyBtn?.addEventListener('click', () => {
        cancelNodalAiGenerationAndCopyPrompt(state.currentQuizConfig, state.currentFileName, false);
    });
    elements.loadingCancelBtn?.addEventListener('click', () => {
        cancelNodalAiGeneration();
    });

    // AI Prompt Modal Event Listeners
    elements.closeAiPromptModalBtn?.addEventListener('click', () => closeAiPromptModal());
    elements.closeAiPromptFooterBtn?.addEventListener('click', () => closeAiPromptModal());
    elements.aiPromptModal?.addEventListener('click', (e) => {
        if (e.target === elements.aiPromptModal) closeAiPromptModal();
    });
    
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
        const importInput = elements.importQuizInput || document.getElementById('import-quiz-input');
        if (importInput) {
            importInput.click();
        }
    });

    // Import Choice Modal Event Listeners
    const openImportChoiceBtn = elements.openImportChoiceBtn || document.getElementById('open-import-choice-btn');
    const closeImportChoiceModalBtn = elements.closeImportChoiceModalBtn || document.getElementById('close-import-choice-modal-btn');
    const closeImportChoiceFooterBtn = elements.closeImportChoiceFooterBtn || document.getElementById('close-import-choice-footer-btn');
    const importChoiceFileBtn = elements.importChoiceFileBtn || document.getElementById('import-choice-file-btn');
    const importChoicePasteBtn = elements.importChoicePasteBtn || document.getElementById('import-choice-paste-btn');

    const importChoiceModal = elements.importChoiceModal || document.getElementById('import-choice-modal');
    importChoiceModal?.addEventListener('click', async (e) => {
        if (e.target === importChoiceModal) {
            const { closeImportChoiceModal } = await import('./helpers.js');
            closeImportChoiceModal();
        }
    });

    openImportChoiceBtn?.addEventListener('click', async () => {
        const { openImportChoiceModal } = await import('./helpers.js');
        openImportChoiceModal();
    });

    closeImportChoiceModalBtn?.addEventListener('click', async () => {
        const { closeImportChoiceModal } = await import('./helpers.js');
        closeImportChoiceModal();
    });

    closeImportChoiceFooterBtn?.addEventListener('click', async () => {
        const { closeImportChoiceModal } = await import('./helpers.js');
        closeImportChoiceModal();
    });

    importChoiceFileBtn?.addEventListener('click', async () => {
        const { closeImportChoiceModal } = await import('./helpers.js');
        closeImportChoiceModal(true);
        const importInput = elements.importQuizInput || document.getElementById('import-quiz-input');
        importInput?.click();
    });

    importChoicePasteBtn?.addEventListener('click', async () => {
        const { closeImportChoiceModal, openPasteJsonModal } = await import('./helpers.js');
        closeImportChoiceModal(true);
        openPasteJsonModal();
    });

    // Paste Quiz JSON Modal Event Listeners
    const pasteJsonModal = elements.pasteJsonModal || document.getElementById('paste-json-modal');
    pasteJsonModal?.addEventListener('click', async (e) => {
        if (e.target === pasteJsonModal) {
            const { closePasteJsonModal } = await import('./helpers.js');
            closePasteJsonModal();
        }
    });

    const openPasteJsonBtn = elements.openPasteJsonBtn || document.getElementById('open-paste-json-btn');
    openPasteJsonBtn?.addEventListener('click', async () => {
        const { openPasteJsonModal } = await import('./helpers.js');
        openPasteJsonModal();
    });

    const aiPromptPasteBtn = elements.aiPromptPasteBtn || document.getElementById('ai-prompt-paste-btn');
    aiPromptPasteBtn?.addEventListener('click', async () => {
        const { closeAiPromptModal, openPasteJsonModal } = await import('./helpers.js');
        closeAiPromptModal(true);
        openPasteJsonModal();
    });

    const closePasteJsonModalBtn = elements.closePasteJsonModalBtn || document.getElementById('close-paste-json-modal-btn');
    closePasteJsonModalBtn?.addEventListener('click', async () => {
        const { closePasteJsonModal } = await import('./helpers.js');
        closePasteJsonModal();
    });

    const cancelPasteJsonBtn = elements.cancelPasteJsonBtn || document.getElementById('cancel-paste-json-btn');
    cancelPasteJsonBtn?.addEventListener('click', async () => {
        const { closePasteJsonModal } = await import('./helpers.js');
        closePasteJsonModal();
    });

    const submitPasteJsonBtn = elements.submitPasteJsonBtn || document.getElementById('submit-paste-json-btn');
    submitPasteJsonBtn?.addEventListener('click', async () => {
        const textarea = elements.pasteJsonTextarea || document.getElementById('paste-json-textarea');
        const text = textarea?.value || '';
        if (!text.trim()) {
            const { showToast } = await import('./helpers.js');
            showToast('Please paste your quiz JSON text first.', 3000, 'warning');
            return;
        }
        const { importQuizFromText } = await import('./quiz/fileHandling.js');
        const success = await importQuizFromText(text);
        if (success) {
            const { closePasteJsonModal } = await import('./helpers.js');
            closePasteJsonModal(true);
        }
    });

    // Fix: Navbar Account Button
    if (elements.navAccountBtn) {
        elements.navAccountBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!await confirmLeaveCustomizeIfActive()) return;
            await openAccountAsView(); 
        });
    }

    // Fix: Navbar History Button
    if (elements.navHistoryBtn) {
        elements.navHistoryBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!await confirmLeaveCustomizeIfActive()) return;
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
        const { navigateToShareStep, showToast, customConfirm, updateAuthUI, syncHistoryWithCloud } = await import('./helpers.js');
        if (!navigator.onLine) {
            showToast('Cannot generate a new share link while offline. Please connect to the internet.', 4000, 'warning');
            return;
        }

        // Generating a public cloud share link requires Puter cloud access
        if (typeof puter === 'undefined' || !window.puter || !puter.auth || !puter.auth.isSignedIn()) {
            const wantsToLogin = await customConfirm(
                'You must be signed in to Puter to create a public cloud share link.\n\nWould you like to sign in now? (You can also export as JSON without an account).',
                'Sign In Required for Link Sharing',
                'Sign In to Puter',
                'Cancel',
                false
            );
            if (wantsToLogin) {
                try {
                    await puter.auth.signIn();
                    await updateAuthUI();
                    syncHistoryWithCloud();
                    navigateToShareStep('config');
                } catch (err) {
                    console.error('Sign in failed during link sharing', err);
                }
            }
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

    function updateMuteButtonUI() {
        const btn = elements.muteSoundBtn || document.getElementById('mute-sound-btn');
        if (!btn) return;
        const unmutedIcon = btn.querySelector('.mute-icon-unmuted');
        const mutedIcon = btn.querySelector('.mute-icon-muted');
        if (unmutedIcon) unmutedIcon.classList.toggle('hidden', !!state.isMuted);
        if (mutedIcon) mutedIcon.classList.toggle('hidden', !state.isMuted);
        btn.title = state.isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects';
        btn.setAttribute('aria-pressed', state.isMuted ? 'true' : 'false');
    }

    elements.muteSoundBtn?.addEventListener('click', () => {
        state.isMuted = !state.isMuted;
        localStorage.setItem('nodal_quiz_muted', state.isMuted ? 'true' : 'false');
        updateMuteButtonUI();
        showToast(state.isMuted ? 'Sound effects muted' : 'Sound effects unmuted', 2000, 'info');
    });

    updateMuteButtonUI();
    historyList.addEventListener('click', handleHistoryClick);
    showAllHistoryBtn?.addEventListener('click', () => {
        state.historyOrigin = 'home-card';
        showAllHistoryFullScreen();
    });
    // Full-screen history back button
    elements.historyFullscreenBackBtn?.addEventListener('click', () => {
        if (window.history.length > 1 && window.location.hash === '#history') {
            window.history.back();
        } else {
            state.historyOrigin = 'nav';
            showView('start');
        }
    });
    // Mobile bottom nav
    elements.mobileNavHomeBtn?.addEventListener('click', async () => {
        if (!await confirmLeaveCustomizeIfActive()) return;
        state.historyOrigin = 'nav';
        setMobileNavActive('home'); setDesktopNavActive('home');
        showView('start');
        // ensure we scroll to top when returning home on mobile
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    elements.mobileNavHistoryBtn?.addEventListener('click', async () => {
        if (!await confirmLeaveCustomizeIfActive()) return;
        state.historyOrigin = 'nav';
        setMobileNavActive('history'); setDesktopNavActive('history');
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

    // Dynamic validation listeners for customize/edit fields (enables conditional Save Changes button)
    elements.editQuizNameInput?.addEventListener('input', validateAllInputs);
    elements.customTimeLimitInput?.addEventListener('input', validateAllInputs);
    elements.attemptLimitInput?.addEventListener('input', validateAllInputs);
    elements.questionTimeInput?.addEventListener('input', validateAllInputs);
    elements.secondChanceToggle?.addEventListener('change', validateAllInputs);
    elements.maxChancesInput?.addEventListener('change', validateAllInputs);
    elements.shuffleQuestionsToggle?.addEventListener('change', validateAllInputs);
    elements.shuffleChoicesToggle?.addEventListener('change', validateAllInputs);
    elements.allowchangetoggle?.addEventListener('change', validateAllInputs);
    document.querySelectorAll('input[name="ui_mode"]').forEach(r => r.addEventListener('change', validateAllInputs));

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
                const effectiveKey = key === 'whats-new' ? 'help' : key;
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
                    btn.classList.toggle('text-white', k === effectiveKey);
                    btn.classList.toggle('bg-blue-600', k === effectiveKey);
                    btn.classList.toggle('text-gray-300', k !== effectiveKey);
                    btn.setAttribute('aria-current', k === effectiveKey ? 'true' : 'false');
                });
            }

            // Menu open/close (mobile)
            elements.mobileNavMenuBtn?.addEventListener('click', () => {
                if (elements.mobileMenuModal) elements.mobileMenuModal.classList.remove('hidden');
            });
            elements.mobileMenuCloseBtn?.addEventListener('click', () => {
                closeModalWithAnimation(elements.mobileMenuModal);
            });
            elements.mobileMenuBackdrop?.addEventListener('click', () => {
                closeModalWithAnimation(elements.mobileMenuModal);
            });
            elements.mobileMenuDownloadsBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) {
                    return;
                }
                closeModalWithAnimation(elements.mobileMenuModal, async () => {
                    const { renderDownloadsView } = await import('./quiz/quizOffline.js');
                    renderDownloadsView();
                });
            });
            elements.mobileMenuHelpBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) {
                    return;
                }
                closeModalWithAnimation(elements.mobileMenuModal, () => {
                    showView('help');
                });
            });
            elements.mobileMenuAboutBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) {
                    return;
                }
                closeModalWithAnimation(elements.mobileMenuModal, () => {
                    showView('about');
                });
            });
            elements.mobileMenuAccountBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) {
                    return;
                }
                closeModalWithAnimation(elements.mobileMenuModal, async () => {
                    await openAccountAsView();
                });
            });

            // Desktop nav handlers
            elements.desktopNavHomeBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                state.historyOrigin = 'nav';
                setDesktopNavActive('home'); setMobileNavActive('home');
                showView('start');
            });
            elements.desktopNavHistoryBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                state.historyOrigin = 'nav';
                setDesktopNavActive('history'); setMobileNavActive('history');
                showAllHistoryFullScreen();
            });
            elements.desktopNavDownloadsBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                setDesktopNavActive('downloads');
                const { renderDownloadsView } = await import('./quiz/quizOffline.js');
                renderDownloadsView();
            });
            elements.desktopNavHelpBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                setDesktopNavActive('help');
                showView('help');
            });
            elements.desktopNavAboutBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                setDesktopNavActive('about');
                showView('about');
            });
            elements.desktopNavAccountBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                setDesktopNavActive('account');
                await openAccountAsView();
            });

            // Downloads Back button
            elements.downloadsBackBtn?.addEventListener('click', () => {
                if (window.history.length > 1 && window.location.hash === '#downloads') {
                    window.history.back();
                } else {
                    setDesktopNavActive('home'); setMobileNavActive('home');
                    showView('start');
                }
            });

            // What's New Page listeners
            elements.openWhatsNewBtn?.addEventListener('click', async () => {
                if (!await confirmLeaveCustomizeIfActive()) return;
                showView('whats-new');
            });
            elements.whatsNewBackBtn?.addEventListener('click', () => {
                if (window.history.length > 1 && window.location.hash === '#whats-new') {
                    window.history.back();
                } else {
                    showView('help');
                }
            });
            elements.whatsNewCrumbHelp?.addEventListener('click', () => {
                if (window.history.length > 1 && window.location.hash === '#whats-new') {
                    window.history.back();
                } else {
                    showView('help');
                }
            });
            document.querySelectorAll('.whats-new-toggle').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.dataset.target;
                    const targetEl = document.getElementById(targetId);
                    const chevron = btn.querySelector('.chevron-icon');
                    if (targetEl) {
                        const isExpanded = !targetEl.classList.contains('hidden');
                        if (isExpanded) {
                            targetEl.classList.add('hidden');
                            if (chevron) chevron.classList.remove('rotate-180');
                        } else {
                            targetEl.classList.remove('hidden');
                            if (chevron) chevron.classList.add('rotate-180');
                        }
                    }
                });
            });

            // Unified Data Migration Popup Modal listeners
            const handleOpenMigration = async () => {
                const { openMigrationModal } = await import('./quiz/quizMigration.js');
                openMigrationModal('choice', true);
            };
            elements.openMigrationBtn?.addEventListener('click', handleOpenMigration);
            elements.openMigrationLoggedOutBtn?.addEventListener('click', handleOpenMigration);

            // Modal Header Controls (Back and Close)
            document.getElementById('migration-modal-back-btn')?.addEventListener('click', async () => {
                const { navigateToMigrationStep } = await import('./quiz/quizMigration.js');
                navigateToMigrationStep('choice');
            });

            document.getElementById('close-migration-modal-btn')?.addEventListener('click', async () => {
                const { closeMigrationModal } = await import('./quiz/quizMigration.js');
                closeMigrationModal();
            });

            // Step 1 (Choice) Navigation
            document.getElementById('migration-choice-export-btn')?.addEventListener('click', async () => {
                const { navigateToMigrationStep } = await import('./quiz/quizMigration.js');
                navigateToMigrationStep('export');
            });

            document.getElementById('migration-choice-import-btn')?.addEventListener('click', async () => {
                const { navigateToMigrationStep } = await import('./quiz/quizMigration.js');
                navigateToMigrationStep('import');
            });

            // Step 2 (Export) Controls
            document.getElementById('export-select-all-btn')?.addEventListener('click', () => {
                document.querySelectorAll('.export-checkbox').forEach(cb => { cb.checked = true; });
            });
            document.getElementById('export-clear-all-btn')?.addEventListener('click', () => {
                document.querySelectorAll('.export-checkbox').forEach(cb => { cb.checked = false; });
            });
            document.getElementById('start-export-btn')?.addEventListener('click', async () => {
                const { executeExport } = await import('./quiz/quizMigration.js');
                executeExport();
            });

            // Step 3 (Import) Controls
            const migrationFileInput = document.getElementById('migration-file-input');
            const selectImportFileBtn = document.getElementById('select-import-file-btn');
            const migrationDropZone = document.getElementById('migration-drop-zone');

            selectImportFileBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                migrationFileInput?.click();
            });
            migrationDropZone?.addEventListener('click', () => {
                migrationFileInput?.click();
            });
            migrationDropZone?.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                migrationDropZone.classList.add('border-blue-500', 'bg-gray-900/60');
            });
            migrationDropZone?.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                migrationDropZone.classList.remove('border-blue-500', 'bg-gray-900/60');
            });
            migrationDropZone?.addEventListener('drop', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                migrationDropZone.classList.remove('border-blue-500', 'bg-gray-900/60');
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                    const { handleFileSelectionForImport } = await import('./quiz/quizMigration.js');
                    handleFileSelectionForImport(e.dataTransfer.files[0]);
                }
            });
            migrationFileInput?.addEventListener('change', async (e) => {
                if (e.target.files && e.target.files[0]) {
                    const { handleFileSelectionForImport } = await import('./quiz/quizMigration.js');
                    handleFileSelectionForImport(e.target.files[0]);
                }
            });
            document.getElementById('import-pick-different-btn')?.addEventListener('click', async () => {
                const { resetImportStaging } = await import('./quiz/quizMigration.js');
                resetImportStaging();
                migrationFileInput?.click();
            });
            document.getElementById('start-import-btn')?.addEventListener('click', async () => {
                const { executeImport } = await import('./quiz/quizMigration.js');
                executeImport();
            });

            // Step 4 (Progress) & Error Modal Handlers
            document.getElementById('migration-progress-done-btn')?.addEventListener('click', async () => {
                const { closeMigrationModal } = await import('./quiz/quizMigration.js');
                closeMigrationModal();
                const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                showAllHistoryFullScreen(true);
            });
            document.getElementById('migration-error-close-btn')?.addEventListener('click', async () => {
                const { closeMigrationErrorModal } = await import('./quiz/quizMigration.js');
                closeMigrationErrorModal();
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
                'You are currently customizing quiz generation. Leaving this page will cancel your current quiz setup and clear your selected documents.\n\nDo you want to stay or cancel generation?',
                'Customizing Quiz Generation',
                'Cancel Generation',
                'Stay',
                true
            );
            if (!confirmed) return;
            clearSubState('#customize');
            resetApp(true);
            window.history.replaceState({ view: 'start' }, '', '#home');
            showToast('Quiz generation cancelled.', 2000, 'neutral');
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
        const isContentOpen = !content.classList.contains('hidden');
        document.getElementById('start-view')?.classList.toggle('customize-expanded', isContentOpen);

        if (isContentOpen) {
            resumeQuizBtn.classList.add('hidden');
            setHistoryVisibility(false);
            if (!state.isCustomizingHistory) {
                document.getElementById('quiz-custom-summary-banner')?.remove();
                document.getElementById('quiz-type-group')?.classList.remove('hidden');
                document.getElementById('ui-mode-group')?.classList.remove('hidden');
                document.getElementById('question-count-group')?.classList.remove('hidden');
                document.getElementById('difficulty-group')?.classList.remove('hidden');
                handleCustomTypeChange();
            }
        } else {
            prepareResumeButton();
            if (!state.isCustomizingHistory && (!state.currentFiles || state.currentFiles.length === 0)) {
                setHistoryVisibility(true);
            }
        }
    });

    createRemedialBtn?.addEventListener('click', () => openRemedialSetupModal(true));
    closeRemedialSetupModalBtn?.addEventListener('click', () => closeRemedialSetupModal());
    cancelRemedialBtn?.addEventListener('click', () => closeRemedialSetupModal());
    elements.remedialSetupModal?.addEventListener('click', (e) => {
        if (e.target === elements.remedialSetupModal) closeRemedialSetupModal();
    });
    generateRemedialQuizBtn?.addEventListener('click', () => {
        if (elements.remedialSetupModal) {
            elements.remedialSetupModal.classList.add('hidden');
        }
        handleQuizGeneration(true, false);
    });
    remedialDifficultyRadios.forEach(r => r.addEventListener('change', handleRemedialDifficultyChange));
    remedialCustomQuestionTypeSelect?.addEventListener('change', handleRemedialCustomTypeChange);
    remedialCustomCountInputs.forEach(i => i.addEventListener('input', validateRemedialInputs));
    remedialQuestionCountInput?.addEventListener('input', validateRemedialInputs);
    remedialTimeLimitToggle?.addEventListener('change', handleRemedialTimeToggle);
    remedialAttemptLimitToggle?.addEventListener('change', handleRemedialAttemptToggle);
    remedialTimePresetRadios.forEach(r => r.addEventListener('change', handleRemedialTimePresetChange));
    remedialCustomTimeLimitInput?.addEventListener('input', validateRemedialInputs);
    remedialAttemptLimitInput?.addEventListener('input', validateRemedialInputs);
    elements.remedialTimerModeSelect?.addEventListener('change', handleRemedialTimerModeChange);
    elements.remedialSecondChanceToggle?.addEventListener('change', handleRemedialSecondChanceToggle);
    elements.remedialQuestionTimeInput?.addEventListener('input', validateRemedialInputs);
    elements.remedialMaxChancesInput?.addEventListener('change', validateRemedialInputs);
    elements.remedialAllowChangeToggle?.addEventListener('change', validateRemedialInputs);
    elements.remedialShuffleQuestionsToggle?.addEventListener('change', validateRemedialInputs);
    elements.remedialShuffleChoicesToggle?.addEventListener('change', validateRemedialInputs);
    elements.remedialQuizNameInput?.addEventListener('input', validateRemedialInputs);
    document.querySelectorAll('input[name="remedial_ui_mode"]').forEach(r => r.addEventListener('change', validateRemedialInputs));

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
            if (elements.historyActionsModal) {
                elements.historyActionsModal.classList.add('hidden');
            }
            if (key) {
                state.lastHistoryMenuKey = key;
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
            if (elements.historyActionsModal) {
                elements.historyActionsModal.classList.add('hidden');
            }
            if (key) {
                state.lastHistoryMenuKey = key;
                const { openQuizStatistics } = await import('./quiz/quizStatistics.js');
                openQuizStatistics(key, true, origin);
            }
        });
    }
    if (elements.historySubmenuShareBtn) {
        elements.historySubmenuShareBtn.addEventListener('click', () => {
            const key = state.activeHistoryMenuKey;
            if (elements.historyActionsModal) {
                elements.historyActionsModal.classList.add('hidden');
            }
            if (key) {
                state.lastHistoryMenuKey = key;
                handleHistoryClick({ target: { closest: () => ({ dataset: { key, action: 'share' } }) } });
            }
        });
    }
    if (elements.historySubmenuEditBtn) {
        elements.historySubmenuEditBtn.addEventListener('click', () => {
            const key = state.activeHistoryMenuKey;
            if (elements.historyActionsModal) {
                elements.historyActionsModal.classList.add('hidden');
            }
            if (key) {
                state.lastHistoryMenuKey = key;
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
    updateResumeButtonVisibility();
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
    startNodalAiGeneration,
    cancelNodalAiGeneration,
    cancelNodalAiGenerationAndCopyPrompt,
    
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

try {
    handleCustomTypeChange();
} catch (e) {
    console.warn('[Quiz] Initial custom type sync error:', e);
}

