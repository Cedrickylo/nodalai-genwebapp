import { elements, state, constants } from '../state.js';
import { stopQuizTimer } from './quizExecution.js'; //  FIX: Added static import here
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
    
    //  FIX: Removed the broken 'require' line and called the function directly
    stopQuizTimer();
    
    resetStartViewUI();
    state.fileContent = '';
    state.fileHash = '';
    state.questions = [];
    state.userAnswers = [];
    state.score = 0;
    state.currentQuizKey = '';
    state.currentFileName = '';
    state.currentShuffledIndexPos = 0;
    state.answeredOriginalIndices.clear();
    state.skippedOriginalIndices.clear();
    state.currentSkippedItemIndex = 0;
    state.inSkippedRound = false;
    state.currentSkippedArray = [];
    fileUploadInput.value = '';
    addMoreFilesInput.value = '';
    importQuizInput.value = '';
    fileNameDisplay.textContent = 'Select Documents';
    statusMessage.textContent = '';
    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    timeLimitToggle.checked = false;
    timeLimitOptions.classList.add('hidden');
    document.getElementById('time-10m').checked = true;
    customTimeInputContainer.classList.add('hidden');
    customTimeLimitInput.value = 15;
    attemptLimitToggle.checked = false;
    attemptLimitOptions.classList.add('hidden');
    attemptLimitInput.value = 3;
    summaryOnlyToggle.checked = false;
    document.getElementById('difficulty-easy').checked = true;
    customQuestionTypeSelect.value = 'mixed';
    handleDifficultyChange();
    refreshHistory();
    remedialOptionsView.classList.add('hidden');
    resultsActions.classList.remove('hidden');
    createRemedialBtn.classList.add('hidden');
    state.incorrectQuestionsForRemedial = [];
    showView('start');
}

export function resetStartViewUI() {
    state.isCustomizingHistory = false;
    state.customizingQuizData = null;
    state.initialCustomizeState = {};
    state.currentFiles = []; 

    startSubtitle.textContent = 'Transform your documents into tailored assessments instantly.';
    
    renameContainer.classList.add('hidden');
    selectedFilesContainer.classList.add('hidden');
    selectedFilesList.innerHTML = '';
    addMoreFilesInput.value = '';
    editQuizNameInput.value = ''; 
    
    document.getElementById('customize-section').classList.add('hidden');
    deleteCustomizeBtn.classList.add('hidden');
    fileActionsDiv.classList.remove('hidden');
    cancelCustomizeBtn.classList.add('hidden');
    generateQuizBtn.textContent = 'Generate Quiz';
    
    // Reset fields and inputs on cancellation/reset
    document.getElementById('question-count-input').value = '10';
    if (difficultyRadios && difficultyRadios.length > 0) {
        difficultyRadios.forEach((radio, idx) => {
            radio.checked = (idx === 0); // Resets back to default 'easy'
        });
    }
    customQuestionTypeSelect.value = 'multiple-choice';
    
    const mcInput = document.getElementById('mc-count');
    const idInput = document.getElementById('id-count');
    const enInput = document.getElementById('en-count');
    if (mcInput) mcInput.value = '';
    if (idInput) idInput.value = '';
    if (enInput) enInput.value = '';
    
    timeLimitToggle.checked = false;
    attemptLimitToggle.checked = false;
    summaryOnlyToggle.checked = false;
    customTimeLimitInput.value = '';
    attemptLimitInput.value = '';

    // Automatically trigger visibility toggles to re-hide conditional sub-menus
    handleTimeToggle();
    handleAttemptToggle();
    handleDifficultyChange();

    validateAllInputs();
    
    // Restore layout controls and display state
    document.getElementById('quiz-custom-summary-banner')?.remove();

    const countGroup = document.getElementById('question-count-group') || document.getElementById('question-count-input').closest('.mb-4, .space-y-4, div');
    const diffGroup = document.getElementById('difficulty-group') || 
                      document.querySelector('.difficulty-section') || 
                      (difficultyRadios[0] ? difficultyRadios[0].closest('.mb-6, .mb-4, .space-y-4, div') : null);

    if (countGroup) countGroup.classList.remove('hidden');
    if (diffGroup) diffGroup.classList.remove('hidden');
    
    // Reset structural interaction restrictions back to standard execution configurations
    document.getElementById('question-count-input').readOnly = false;
    document.getElementById('question-count-input').classList.remove('locked-input');
    
    difficultyRadios.forEach(radio => {
        radio.disabled = false;
        radio.closest('div')?.querySelector('label')?.classList.remove('locked-label');
    });
    
    customQuestionTypeSelect.disabled = false;
    customQuestionTypeSelect.classList.remove('locked-input');
}

export function startLoadingAnimation() {
    loadingTitle.textContent = 'Generating Quiz...';
    loadingMessage.textContent = 'Contacting AI...';
    let dots = 0;
    state.loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        loadingMessage.textContent = 'Contacting AI' + '.'.repeat(dots);
    }, 500);
}

export function stopLoadingAnimation() {
    clearInterval(state.loadingInterval);
    loadingTitle.textContent = '';
    loadingMessage.textContent = '';
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