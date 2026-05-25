import { showView, showToast, setupCustomizeView, exportQuizAsJSON, openAccountModal, syncHistoryWithCloud } from './helpers.js';
import { handleFileSelect, handleQuizImport, resumeQuiz, resetAppFiles } from './quiz/fileHandling.js';
import { handleQuizGeneration } from './quiz/quizGeneration.js';
import { skipQuestion } from './quiz/quizExecution.js';
import { state, elements } from './state.js';

export function attachQuizEventListeners() {
    console.log("Initializing unified application event listener matrix...");

    // ==========================================
    // 1. SIDEBAR & NAVIGATION BUTTON INTERCEPTORS
    // ==========================================
    const navHomeBtn = document.getElementById('desktop-nav-home-btn');
    if (navHomeBtn) {
        navHomeBtn.onclick = () => showView('start');
    }

    const navHistoryBtn = document.getElementById('desktop-nav-history-btn');
    if (navHistoryBtn) {
        navHistoryBtn.onclick = () => {
            import('./quiz/quizHistory.js').then(module => {
                if (module && typeof module.showAllHistoryFullScreen === 'function') {
                    module.showAllHistoryFullScreen();
                } else {
                    showView('history-fullscreen-view');
                }
            }).catch(() => showView('history-fullscreen-view'));
        };
    }

    const navHelpBtn = document.getElementById('desktop-nav-help-btn');
    if (navHelpBtn) navHelpBtn.onclick = () => showView('help');

    const navAboutBtn = document.getElementById('desktop-nav-about-btn');
    if (navAboutBtn) navAboutBtn.onclick = () => showView('about');

    const navAccountBtn = document.getElementById('desktop-nav-account-btn');
    if (navAccountBtn) {
        navAccountBtn.onclick = () => {
            if (typeof openAccountModal === 'function') openAccountModal();
        };
    }

    // Mobile Navigation Equivalents
    const mobileNavHomeBtn = document.getElementById('mobile-nav-home-btn');
    if (mobileNavHomeBtn) mobileNavHomeBtn.onclick = () => showView('start');

    const mobileNavHistoryBtn = document.getElementById('mobile-nav-history-btn');
    if (mobileNavHistoryBtn) {
        mobileNavHistoryBtn.onclick = () => {
            showView('history-fullscreen-view');
            import('./quiz/quizHistory.js').then(module => {
                if (module && typeof module.showAllHistoryFullScreen === 'function') {
                    module.showAllHistoryFullScreen();
                }
            });
        };
    }

    const mobileNavMenuBtn = document.getElementById('mobile-nav-menu-btn');
    const mobileMenuModal = document.getElementById('mobile-menu-modal');
    if (mobileNavMenuBtn && mobileMenuModal) {
        mobileNavMenuBtn.onclick = () => mobileMenuModal.classList.remove('hidden');
    }

    // ==========================================
    // 2. LIVE QUIZ INTERACTIVE CORE (Skip, Save, Home)
    // ==========================================
    const skipBtn = document.getElementById('skip-question-btn');
    if (skipBtn) {
        skipBtn.onclick = () => {
            if (typeof skipQuestion === 'function') skipQuestion();
        };
    }

    const saveQuizBtn = document.getElementById('save-quiz-btn');
    if (saveQuizBtn) {
        saveQuizBtn.onclick = () => {
            // Invokes the native dynamic state exporter function matching dashboard structure
            if (state.currentQuizKey) {
                showToast('Saving live session state...', 2000, 'info');
                import('./quiz/quizUtils.js').then(module => {
                    if (module && typeof module.saveCurrentQuiz === 'function') module.saveCurrentQuiz();
                });
            } else {
                showToast('No active quiz session found to persist.', 2500, 'warning');
            }
        };
    }

    const homeBtn = document.getElementById('home-btn');
    if (homeBtn) {
        homeBtn.onclick = () => {
            import('./quiz/quizUtils.js').then(module => {
                if (module && typeof module.resetApp === 'function') {
                    module.resetApp(false); // return safely to view layout home without erasing session
                }
                showView('start');
            }).catch(() => showView('start'));
        };
    }

    // ==========================================
    // 3. HOMEPAGE & INLINE HISTORY CONTROLS (Cloud Sync, Show All)
    // ==========================================
    const syncCloudBtn = document.getElementById('sync-cloud-btn');
    if (syncCloudBtn) {
        syncCloudBtn.onclick = () => {
            if (typeof syncHistoryWithCloud === 'function') {
                syncHistoryWithCloud();
            }
        };
    }

    const showAllHistoryBtn = document.getElementById('show-all-history-btn');
    if (showAllHistoryBtn) {
        showAllHistoryBtn.onclick = () => {
            import('./quiz/quizHistory.js').then(module => {
                if (module && typeof module.showAllHistoryFullScreen === 'function') {
                    module.showAllHistoryFullScreen();
                }
            });
        };
    }

    // Dynamic Event Router for Inline History Lists (Share, Edit, Load)
    const historyListContainer = document.getElementById('history-list');
    const fullHistoryListContainer = document.getElementById('history-full-list');
    
    const inlineHistoryRouter = (event) => {
        const targetBtn = event.target.closest('button');
        if (!targetBtn) return;
        
        import('./quiz/quizHistory.js').then(module => {
            if (module && typeof module.handleHistoryClick === 'function') {
                module.handleHistoryClick(event);
            }
        });
    };

    if (historyListContainer) historyListContainer.onclick = inlineHistoryRouter;
    if (fullHistoryListContainer) fullHistoryListContainer.onclick = inlineHistoryRouter;

    // ==========================================
    // 4. QUIZ PREFERENCES & SETTINGS CARD INPUTS
    // ==========================================
    
    // Custom Configuration flyout sub-menu block expander logic
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

    // Difficulty radio toggles handler router connection hook
    const difficultyRadioElements = document.querySelectorAll('input[name="difficulty"]');
    difficultyRadioElements.forEach(radio => {
        radio.onchange = () => {
            const customOptionsDiv = document.getElementById('custom-options');
            if (customOptionsDiv) {
                customOptionsDiv.classList.toggle('hidden', radio.value !== 'custom');
            }
        };
    });

    // Timed Quiz parameter sub-menu interface manager toggles
    const timeLimitToggle = document.getElementById('time-limit-toggle');
    const timeLimitOptions = document.getElementById('time-limit-options');
    if (timeLimitToggle && timeLimitOptions) {
        timeLimitToggle.onchange = () => {
            timeLimitOptions.classList.toggle('hidden', !timeLimitToggle.checked);
        };
    }

    // Custom Time field layout preview router hook
    const timePresetRadios = document.querySelectorAll('input[name="time_preset"]');
    timePresetRadios.forEach(radio => {
        radio.onchange = () => {
            const customTimeInputContainer = document.getElementById('custom-time-input-container');
            if (customTimeInputContainer) {
                customTimeInputContainer.classList.toggle('hidden', radio.value !== 'custom');
            }
        };
    });

    // Attempt Limits configuration card check input hook listeners
    const attemptLimitToggle = document.getElementById('attempt-limit-toggle');
    const attemptLimitOptions = document.getElementById('attempt-limit-options');
    if (attemptLimitToggle && attemptLimitOptions) {
        attemptLimitToggle.onchange = () => {
            attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
        };
    }

    // Document Selectors Picker connection triggers
    const fileUploadInput = document.getElementById('file-upload-input');
    if (fileUploadInput) {
        fileUploadInput.onchange = (e) => {
            if (typeof handleFileSelect === 'function') handleFileSelect(e);
        };
    }

    const addMoreFilesInput = document.getElementById('add-more-files-input');
    if (addMoreFilesInput) {
        addMoreFilesInput.onchange = (e) => {
            if (typeof handleFileSelect === 'function') handleFileSelect(e);
        };
    }

    // Clear Document Selections Buttons
    const clearFilesBtn = document.getElementById('clear-files-btn');
    if (clearFilesBtn) {
        clearFilesBtn.onclick = async () => {
            // Standardizes on your multi-file removal confirmation dialog flow step
            import('./quiz/fileHandling.js').then(module => {
                if (module && typeof module.resetAppFiles === 'function') {
                    resetAppFiles();
                } else {
                    const selectedList = document.getElementById('selected-files-list');
                    const fileDisplay = document.getElementById('file-name');
                    if (selectedList) selectedList.innerHTML = '';
                    if (fileDisplay) fileDisplay.textContent = 'Select Documents';
                    state.fileContent = '';
                    state.fileHash = '';
                    showToast('Documents cleared.', 2000);
                }
            });
        };
    }

    // Import Quiz Engine hook connector logic link step
    const importQuizInput = document.getElementById('import-quiz-input');
    if (importQuizInput) {
        importQuizInput.onchange = (e) => {
            if (typeof handleQuizImport === 'function') handleQuizImport(e);
        };
    }

    // Main Engine Launch Generation Activator Route Trigger binding link
    const generateQuizBtn = document.getElementById('generate-quiz-btn');
    if (generateQuizBtn) {
        generateQuizBtn.onclick = () => {
            if (typeof handleQuizGeneration === 'function') {
                handleQuizGeneration(false, false);
            }
        };
    }

    console.log("All functional listener pathways attached completely and successfully.");
}