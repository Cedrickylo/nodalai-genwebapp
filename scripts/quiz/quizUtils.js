import { elements, state, constants } from '../state.js';
import { stopQuizTimer } from './quizExecution.js'; 
import {
    showView,
    showToast,
    saveQuizToDB,
    customConfirm,
    clearInProgressQuiz,
    refreshHistory,
    setHistoryVisibility,
    handleDifficultyChange,
    handleTimeToggle,
    handleAttemptToggle,
    handleCustomTypeChange,
    validateAllInputs,
    clearSubState,
    updateResumeButtonVisibility
} from '../helpers.js';

const {
    fileUploadInput,
    addMoreFilesInput,
    importQuizInput,
    fileNameDisplay,
    statusMessage,
    timeLimitToggle,
    timeLimitOptions,
    customTimeInputContainer,
    customTimeLimitInput,
    attemptLimitToggle,
    attemptLimitOptions,
    attemptLimitInput,
    summaryOnlyToggle,
    difficultyRadios,
    customQuestionTypeSelect,
    customCountInputs,
    loadingTitle,
    loadingMessage,
    homeBtn,
    saveQuizBtn,
    startSubtitle,
    renameContainer,
    editQuizNameInput,
    selectedFilesContainer,
    selectedFilesList,
    fileActionsDiv,
    cancelCustomizeBtn,
    deleteCustomizeBtn,
    generateQuizBtn,
    resumeQuizBtn,
    resultsActions,
    createRemedialBtn
} = elements;

export function resetAdvancedOptions() {
    if (elements.shuffleQuestionsToggle) elements.shuffleQuestionsToggle.checked = true;
    if (elements.shuffleChoicesToggle) elements.shuffleChoicesToggle.checked = true;
    if (elements.summaryOnlyToggle) elements.summaryOnlyToggle.checked = false;
    if (elements.allowChangeToggle) elements.allowChangeToggle.checked = false;
    if (elements.allowchangetoggle) elements.allowchangetoggle.checked = false;
    if (elements.secondChanceToggle) elements.secondChanceToggle.checked = false;
    document.getElementById('second-chance-options')?.classList.add('hidden');
    if (elements.maxChancesInput) elements.maxChancesInput.value = 1;

    if (elements.timeLimitToggle) elements.timeLimitToggle.checked = false;
    elements.timeLimitOptions?.classList.add('hidden');
    if (elements.timerModeSelect) elements.timerModeSelect.value = 'quiz';
    document.getElementById('quiz-time-presets-container')?.classList.remove('hidden');
    document.getElementById('question-time-container')?.classList.add('hidden');
    if (elements.questionTimeInput) elements.questionTimeInput.value = 30;
    const time10m = document.getElementById('time-10m');
    if (time10m) time10m.checked = true;
    elements.customTimeInputContainer?.classList.add('hidden');
    if (elements.customTimeLimitInput) elements.customTimeLimitInput.value = 15;

    if (elements.attemptLimitToggle) elements.attemptLimitToggle.checked = false;
    elements.attemptLimitOptions?.classList.add('hidden');
    if (elements.attemptLimitInput) elements.attemptLimitInput.value = 3;
}

export function resetApp(clearProg = true) {
    if (clearProg) clearInProgressQuiz();
    
    stopQuizTimer();

    // --- Advanced Option Clearance Track ---
    if (state.questionTimerInterval) {
        clearInterval(state.questionTimerInterval);
        state.questionTimerInterval = null;
    }

    clearSubState('#customize');
    clearSubState('#edit');

    resetStartViewUI();
    
    state.fileContent = '';
    state.fileHash = '';
    state.questions = [];
    state.userAnswers = [];
    state.score = 0;
    state.currentQuizKey = '';
    state.currentFileName = '';
    state.currentShuffledIndexPos = 0;
    state.currentQuestionIndex = 0;
    state.isReviewingUnanswered = false;
    state.answeredOriginalIndices.clear();
    state.skippedOriginalIndices.clear();
    state.currentSkippedItemIndex = 0;
    state.inSkippedRound = false;
    state.currentSkippedArray = [];

    elements.unansweredModal?.classList.add('hidden');
    elements.nextUnansweredBtn?.classList.add('hidden');
    setHistoryVisibility(true);
    
    if (fileUploadInput) fileUploadInput.value = '';
    if (addMoreFilesInput) addMoreFilesInput.value = '';
    if (importQuizInput) importQuizInput.value = '';
    if (fileNameDisplay) fileNameDisplay.textContent = 'Select Documents';
    
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    }
    
    resetAdvancedOptions();
    
    const diffEasy = document.getElementById('difficulty-easy');
    if (diffEasy) diffEasy.checked = true;
    
    if (customQuestionTypeSelect) customQuestionTypeSelect.value = 'mixed';
    
    handleDifficultyChange();
    refreshHistory();
    
    elements.remedialSetupModal?.classList.add('hidden');
    clearSubState('#remedial-setup');
    resultsActions?.classList.remove('hidden');
    createRemedialBtn?.classList.add('hidden');
    
    state.incorrectQuestionsForRemedial = [];
    state.isQuizCompleted = false;
    showView('start');
}

export function resetStartViewUI(preserveFileName = false) {
    state.isCustomizingHistory = false;
    state.customizingQuizData = null;
    state.initialCustomizeState = {};
    state.currentFiles = []; 
    state.fileContent = '';
    state.fileHash = '';
    if (!preserveFileName) {
        state.currentFileName = '';
    }

    if (startSubtitle) startSubtitle.textContent = 'Transform your documents into tailored assessments instantly.';
    
    renameContainer?.classList.add('hidden');
    selectedFilesContainer?.classList.add('hidden');
    document.getElementById('selected-files-container')?.classList.add('hidden');
    if (selectedFilesList) selectedFilesList.innerHTML = '';
    const selListEl = document.getElementById('selected-files-list');
    if (selListEl) selListEl.innerHTML = '';
    if (addMoreFilesInput) addMoreFilesInput.value = '';
    if (fileUploadInput) fileUploadInput.value = '';
    if (editQuizNameInput) editQuizNameInput.value = ''; 
    
    document.getElementById('customize-section')?.classList.add('hidden');
    document.getElementById('customize-content')?.classList.add('hidden');
    document.getElementById('customize-toggle-icon')?.classList.remove('rotate-180');
    document.getElementById('start-view')?.classList.remove('customize-expanded');
    deleteCustomizeBtn?.classList.add('hidden');
    elements.saveCustomizeBtn?.classList.add('hidden');
    fileActionsDiv?.classList.remove('hidden');
    cancelCustomizeBtn?.classList.add('hidden');
    setHistoryVisibility(true);
    elements.unansweredModal?.classList.add('hidden');
    elements.nextUnansweredBtn?.classList.add('hidden');
    state.isReviewingUnanswered = false;
    state.currentQuestionIndex = 0;
    if (generateQuizBtn) {
        generateQuizBtn.textContent = 'Generate Quiz';
        generateQuizBtn.disabled = true;
    }
    
    // Reset fields and inputs on cancellation/reset
    const questionCountInput = document.getElementById('question-count') || document.getElementById('question-count-input');
    if (questionCountInput) questionCountInput.value = '10';
    
    if (difficultyRadios && difficultyRadios.length > 0) {
        difficultyRadios.forEach((radio, idx) => {
            if (radio) radio.checked = (idx === 0); 
        });
    }
    if (customQuestionTypeSelect) customQuestionTypeSelect.value = 'mixed';
    
    const mcInput = document.getElementById('mc-count');
    const tfInput = document.getElementById('tf-count');
    const idInput = document.getElementById('id-count');
    const enInput = document.getElementById('en-count');
    if (mcInput) mcInput.value = '4';
    if (tfInput) tfInput.value = '2';
    if (idInput) idInput.value = '2';
    if (enInput) enInput.value = '2';
    
    resetAdvancedOptions();

    handleTimeToggle();
    handleAttemptToggle();
    handleDifficultyChange();
    handleCustomTypeChange();
    validateAllInputs();
    
    document.getElementById('quiz-custom-summary-banner')?.remove();

    const countGroup = document.getElementById('question-count-group') || (questionCountInput ? questionCountInput.closest('.mb-4, .space-y-4, div') : null);
    const diffGroup = document.getElementById('difficulty-group') || 
                      document.querySelector('.difficulty-section') || 
                      (difficultyRadios && difficultyRadios[0] ? difficultyRadios[0].closest('.mb-6, .mb-4, .space-y-4, div') : null);

    if (countGroup) countGroup.classList.remove('hidden');
    if (diffGroup) diffGroup.classList.remove('hidden');
    document.getElementById('quiz-type-group')?.classList.remove('hidden');
    document.getElementById('ui-mode-group')?.classList.remove('hidden');
    
    if (questionCountInput) {
        questionCountInput.readOnly = false;
        questionCountInput.classList.remove('locked-input');
    }
    
    if (difficultyRadios) {
        difficultyRadios.forEach(radio => {
            if (radio) {
                radio.disabled = false;
                radio.closest('div')?.querySelector('label')?.classList.remove('locked-label');
            }
        });
    }
    
    if (customQuestionTypeSelect) {
        customQuestionTypeSelect.disabled = false;
        customQuestionTypeSelect.classList.remove('locked-input');
    }
    updateResumeButtonVisibility();
}

export function startLoadingAnimation() {
    if (loadingTitle) loadingTitle.textContent = 'Generating Quiz...';
    if (loadingMessage) loadingMessage.textContent = 'Contacting AI...';
    let dots = 0;
    state.loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        if (loadingMessage) loadingMessage.textContent = 'Contacting AI' + '.'.repeat(dots);
    }, 500);
}

export function stopLoadingAnimation() {
    clearInterval(state.loadingInterval);
    if (loadingTitle) loadingTitle.textContent = '';
    if (loadingMessage) loadingMessage.textContent = '';
}

export function saveCurrentQuiz() {
    if (state.currentQuizKey && state.questions.length > 0) {
        const fallbackName = (state.currentFileName || state.quizHistory[state.currentQuizKey]?.fileName || 'Untitled Quiz').slice(0, 35);
        state.currentFileName = fallbackName;
        const saved = saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: fallbackName, config: state.currentQuizConfig });
        if (saved) {
            showToast('Progress saved!');
            refreshHistory();
        }
    }
}

export function saveAndGoHome() {
    saveCurrentQuiz();
    resetApp(false);
}