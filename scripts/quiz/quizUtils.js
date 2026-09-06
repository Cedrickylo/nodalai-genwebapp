import { elements, state, constants } from '../state.js';
import { stopQuizTimer } from './quizExecution.js'; 
import {
    showView,
    showToast,
    saveQuizToDB,
    customConfirm,
    clearInProgressQuiz,
    refreshHistory,
    handleDifficultyChange,
    handleTimeToggle,
    handleAttemptToggle,
    validateAllInputs
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
    remedialOptionsView,
    resultsActions,
    createRemedialBtn
} = elements;

export function resetApp(clearProg = true) {
    if (clearProg) clearInProgressQuiz();
    
    stopQuizTimer();

    // --- Advanced Option Clearance Track ---
    if (state.questionTimerInterval) {
        clearInterval(state.questionTimerInterval);
        state.questionTimerInterval = null;
    }

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
    elements.historySection?.classList.remove('hidden');
    
    if (fileUploadInput) fileUploadInput.value = '';
    if (addMoreFilesInput) addMoreFilesInput.value = '';
    if (importQuizInput) importQuizInput.value = '';
    if (fileNameDisplay) fileNameDisplay.textContent = 'Select Documents';
    
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    }
    
    if (timeLimitToggle) timeLimitToggle.checked = false;
    timeLimitOptions?.classList.add('hidden');
    
    const time10m = document.getElementById('time-10m');
    if (time10m) time10m.checked = true;
    
    customTimeInputContainer?.classList.add('hidden');
    if (customTimeLimitInput) customTimeLimitInput.value = 15;
    if (attemptLimitToggle) attemptLimitToggle.checked = false;
    attemptLimitOptions?.classList.add('hidden');
    if (attemptLimitInput) attemptLimitInput.value = 3;
    if (summaryOnlyToggle) summaryOnlyToggle.checked = false;
    
    const diffEasy = document.getElementById('difficulty-easy');
    if (diffEasy) diffEasy.checked = true;
    
    if (customQuestionTypeSelect) customQuestionTypeSelect.value = 'mixed';
    
    handleDifficultyChange();
    refreshHistory();
    
    remedialOptionsView?.classList.add('hidden');
    resultsActions?.classList.remove('hidden');
    createRemedialBtn?.classList.add('hidden');
    
    state.incorrectQuestionsForRemedial = [];
    showView('start');
}

export function resetStartViewUI() {
    state.isCustomizingHistory = false;
    state.customizingQuizData = null;
    state.initialCustomizeState = {};
    state.currentFiles = []; 

    if (startSubtitle) startSubtitle.textContent = 'Transform your documents into tailored assessments instantly.';
    
    //  Safeguarded UI element assignments against undefined references
    renameContainer?.classList.add('hidden');
    selectedFilesContainer?.classList.add('hidden');
    if (selectedFilesList) selectedFilesList.innerHTML = '';
    if (addMoreFilesInput) addMoreFilesInput.value = '';
    if (editQuizNameInput) editQuizNameInput.value = ''; 
    
    document.getElementById('customize-section')?.classList.add('hidden');
    deleteCustomizeBtn?.classList.add('hidden');
    fileActionsDiv?.classList.remove('hidden');
    cancelCustomizeBtn?.classList.add('hidden');
    elements.historySection?.classList.remove('hidden');
    elements.unansweredModal?.classList.add('hidden');
    elements.nextUnansweredBtn?.classList.add('hidden');
    state.isReviewingUnanswered = false;
    state.currentQuestionIndex = 0;
    if (generateQuizBtn) generateQuizBtn.textContent = 'Generate Quiz';
    
    // Reset fields and inputs on cancellation/reset
    const questionCountInput = document.getElementById('question-count') || document.getElementById('question-count-input');
    if (questionCountInput) questionCountInput.value = '10';
    
    if (difficultyRadios && difficultyRadios.length > 0) {
        difficultyRadios.forEach((radio, idx) => {
            if (radio) radio.checked = (idx === 0); 
        });
    }
    if (customQuestionTypeSelect) customQuestionTypeSelect.value = 'multiple-choice';
    
    const mcInput = document.getElementById('mc-count');
    const tfInput = document.getElementById('tf-count');
    const idInput = document.getElementById('id-count');
    const enInput = document.getElementById('en-count');
    if (mcInput) mcInput.value = '4';
    if (tfInput) tfInput.value = '2';
    if (idInput) idInput.value = '2';
    if (enInput) enInput.value = '2';
    
    if (timeLimitToggle) timeLimitToggle.checked = false;
    if (attemptLimitToggle) attemptLimitToggle.checked = false;
    if (summaryOnlyToggle) summaryOnlyToggle.checked = false;
    if (customTimeLimitInput) customTimeLimitInput.value = '';
    if (attemptLimitInput) attemptLimitInput.value = '';

    handleTimeToggle();
    handleAttemptToggle();
    handleDifficultyChange();
    validateAllInputs();
    
    document.getElementById('quiz-custom-summary-banner')?.remove();

    const countGroup = document.getElementById('question-count-group') || (questionCountInput ? questionCountInput.closest('.mb-4, .space-y-4, div') : null);
    const diffGroup = document.getElementById('difficulty-group') || 
                      document.querySelector('.difficulty-section') || 
                      (difficultyRadios && difficultyRadios[0] ? difficultyRadios[0].closest('.mb-6, .mb-4, .space-y-4, div') : null);

    if (countGroup) countGroup.classList.remove('hidden');
    if (diffGroup) diffGroup.classList.remove('hidden');
    
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
        const saved = saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
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