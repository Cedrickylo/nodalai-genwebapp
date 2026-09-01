import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    saveQuizToDB,
    refreshHistory,
    openAiPromptModal
} from '../helpers.js';

const {
    questionCountInput,
    customTimeLimitInput,
    timeLimitToggle,
    attemptLimitToggle,
    attemptLimitInput,
    summaryOnlyToggle
} = elements;

export async function handleQuizGeneration(isRemedial = false, skipStart = false) {

    // 1. CUSTOMIZATION CHECK FOR EXISTING QUIZ IN HISTORY
    if (state.isCustomizingHistory && state.customizingQuizData && !isRemedial) {
        const { editQuizNameInput } = elements;
        const newName = editQuizNameInput.value.trim() || state.customizingQuizData.fileName;
        state.questions = state.customizingQuizData.questions;
        state.currentFileName = newName;
        state.currentQuizConfig = { ...state.customizingQuizData.config };

        state.isTimedQuiz = timeLimitToggle.checked;
        if (state.isTimedQuiz) {
            const selectedPreset = document.querySelector('input[name="time_preset"]:checked')?.value || '10';
            if (selectedPreset === 'custom') {
                state.totalQuizTime = (parseInt(customTimeLimitInput.value, 10) || 0) * 60;
            } else {
                state.totalQuizTime = (parseInt(selectedPreset, 10) || 0) * 60;
            }
            if (state.totalQuizTime <= 0) {
                showToast('Invalid custom time.', 3000, 'error');
                return;
            }
        } else {
            state.totalQuizTime = 0;
        }

        state.currentQuizConfig.isTimed = state.isTimedQuiz;
        state.currentQuizConfig.totalTime = state.totalQuizTime;
        state.isAttemptLimited = attemptLimitToggle.checked;
        state.maxAttempts = state.isAttemptLimited ? (parseInt(attemptLimitInput.value, 10) || 1) : 0;
        if (state.isAttemptLimited && state.maxAttempts <= 0) {
            showToast('Invalid attempt limit.', 3000, 'error');
            return;
        }
        state.currentQuizConfig.isAttemptLimited = state.isAttemptLimited;
        state.currentQuizConfig.maxAttempts = state.maxAttempts;
        state.currentQuizConfig.showAnswersInSummaryOnly = summaryOnlyToggle.checked;

        // --- Core Advanced Configuration State Bundle Packing ---
        if (elements.timerModeSelect) {
            state.currentQuizConfig.timerMode = elements.timerModeSelect.value;
            if (state.currentQuizConfig.timerMode === 'question') state.isTimedQuiz = true;
        }
        if (elements.questionTimeInput) state.currentQuizConfig.questionTime = parseInt(elements.questionTimeInput.value, 10) || 30;
        if (elements.secondChanceToggle) state.currentQuizConfig.enableSecondChance = elements.secondChanceToggle.checked;
        if (elements.maxChancesInput) state.currentQuizConfig.maxChances = parseInt(elements.maxChancesInput.value, 10) || 1;
        if (elements.manualRevealToggle) state.currentQuizConfig.manualReveal = elements.manualRevealToggle.checked;
        if (elements.shuffleQuestionsToggle) state.currentQuizConfig.randomizeQuestions = elements.shuffleQuestionsToggle.checked;
        if (elements.shuffleChoicesToggle) state.currentQuizConfig.randomizeChoices = elements.shuffleChoicesToggle.checked;
        
        const allowChangeToggleEl = document.getElementById('allow-change-toggle');
        state.currentQuizConfig.allowChangeSelection = allowChangeToggleEl ? allowChangeToggleEl.checked : false;

        const newQuizId = CryptoJS.SHA256(JSON.stringify(state.questions) + JSON.stringify(state.currentQuizConfig) + newName).toString();
        if (newQuizId !== state.customizingQuizData.key && state.quizHistory[state.customizingQuizData.key]) {
            delete state.quizHistory[state.customizingQuizData.key];
        }
        state.currentQuizKey = newQuizId;
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: newName, config: state.currentQuizConfig });

        const { resetStartViewUI } = await import('./quizUtils.js');
        resetStartViewUI();
        refreshHistory();
        openAiPromptModal(state.currentQuizConfig, newName);
        return;
    }

    // 2. UI PARSING & MATH LOGIC FOR PROMPT GENERATION
    const qCountInput = isRemedial ? elements.remedialQuestionCountInput : questionCountInput;
    const diffSelector = isRemedial ? 'input[name="remedial_difficulty"]:checked' : 'input[name="difficulty"]:checked';
    const timeToggle = isRemedial ? elements.remedialTimeLimitToggle : timeLimitToggle;
    const attemptToggle = isRemedial ? elements.remedialAttemptLimitToggle : attemptLimitToggle;
    const summaryToggle = isRemedial ? document.getElementById('remedial-summary-only-toggle') : summaryOnlyToggle;
    const mainCustTypeSelect = isRemedial ? elements.remedialCustomQuestionTypeSelect : elements.customQuestionTypeSelect;

    const selDiff = document.querySelector(diffSelector)?.value || 'easy';
    let mc = 0, tf = 0, id = 0, en = 0, custType = null, custTypeShort = null;
    const totalQ = parseInt(qCountInput?.value, 10) || 10;

    if (!Number.isInteger(totalQ) || totalQ < constants.MIN_QUIZ_QUESTIONS || totalQ > constants.MAX_QUIZ_QUESTIONS) {
        showToast(`Number of questions must be between ${constants.MIN_QUIZ_QUESTIONS} and ${constants.MAX_QUIZ_QUESTIONS}.`, 5000, 'warning');
        if (!isRemedial) showView('start');
        return;
    }

    if (selDiff === 'custom') {
        custType = mainCustTypeSelect?.value || 'mixed';
        if (custType === 'mixed') {
            mc = parseInt(document.getElementById(isRemedial ? 'remedial-mc-count' : 'mc-count')?.value, 10) || 0;
            tf = parseInt(document.getElementById(isRemedial ? 'remedial-tf-count' : 'tf-count')?.value, 10) || 0;
            id = parseInt(document.getElementById(isRemedial ? 'remedial-id-count' : 'id-count')?.value, 10) || 0;
            en = parseInt(document.getElementById(isRemedial ? 'remedial-en-count' : 'en-count')?.value, 10) || 0;
            custTypeShort = 'Mix';
            if (mc + tf + id + en !== totalQ) {
                showToast(`Custom counts (${mc + tf + id + en}) do not match total (${totalQ}).`, 3000, 'error');
                return;
            }
        } else if (custType === 'multiple-choice') {
            mc = totalQ; tf = 0; id = 0; en = 0; custTypeShort = 'MC';
        } else if (custType === 'true-or-false') {
            mc = 0; tf = totalQ; id = 0; en = 0; custTypeShort = 'TF';
        } else if (custType === 'identification') {
            mc = 0; tf = 0; id = totalQ; en = 0; custTypeShort = 'ID';
        } else if (custType === 'enumeration') {
            mc = 0; tf = 0; id = 0; en = totalQ; custTypeShort = 'EN';
        }
    } else if (selDiff === 'easy') {
        mc = Math.round(totalQ * 0.5);
        tf = Math.round(totalQ * 0.35);
        id = totalQ - mc - tf;
        en = 0;
        custTypeShort = 'EASY';
    } else if (selDiff === 'medium') {
        mc = Math.round(totalQ * 0.35);
        tf = Math.round(totalQ * 0.25);
        id = Math.round(totalQ * 0.2);
        en = totalQ - mc - tf - id;
        custTypeShort = 'MED';
    } else if (selDiff === 'hard') {
        mc = Math.round(totalQ * 0.2);
        tf = Math.round(totalQ * 0.1);
        id = Math.round(totalQ * 0.35);
        en = totalQ - mc - tf - id;
        custTypeShort = 'HARD';
    }

    let calcTime = 0;
    state.isTimedQuiz = timeToggle ? timeToggle.checked : false;
    if (state.isTimedQuiz) {
        const selPreset = document.querySelector(isRemedial ? 'input[name="remedial_time_preset"]:checked' : 'input[name="time_preset"]:checked')?.value || '10';
        if (selPreset === 'custom') {
            calcTime = (parseInt(isRemedial ? elements.remedialCustomTimeLimitInput.value : customTimeLimitInput.value, 10) || 0) * 60;
        } else {
            calcTime = (parseInt(selPreset, 10) || 0) * 60;
        }
        if (calcTime <= 0) {
            showToast(isRemedial ? 'Invalid remedial time.' : 'Invalid time.', 3000, 'error');
            return;
        }
    }

    state.totalQuizTime = calcTime;
    state.isAttemptLimited = attemptToggle ? attemptToggle.checked : false;
    state.maxAttempts = state.isAttemptLimited ? (parseInt(isRemedial ? elements.remedialAttemptLimitInput.value : attemptLimitInput.value, 10) || 1) : 0;

    const showAnswersInSummaryOnly = summaryToggle ? summaryToggle.checked : false;
    const timerMode = elements.timerModeSelect ? elements.timerModeSelect.value : 'quiz';
    const questionTime = elements.questionTimeInput ? parseInt(elements.questionTimeInput.value, 10) || 30 : 30;
    const enableSecondChance = elements.secondChanceToggle ? elements.secondChanceToggle.checked : false;
    const maxChances = elements.maxChancesInput ? parseInt(elements.maxChancesInput.value, 10) || 1 : 1;
    const manualReveal = elements.manualRevealToggle ? elements.manualRevealToggle.checked : false;
    const randomizeQuestions = elements.shuffleQuestionsToggle ? elements.shuffleQuestionsToggle.checked : true;
    const randomizeChoices = elements.shuffleChoicesToggle ? elements.shuffleChoicesToggle.checked : true;
    const allowChangeSelection = document.getElementById('allow-change-toggle')?.checked || false;

    if (timerMode === 'question') state.isTimedQuiz = true;

    state.currentQuizConfig = {
        count: totalQ,
        difficulty: selDiff,
        mc: mc,
        tf: tf,
        id: id, 
        en: en, 
        customType: custType || (selDiff === 'custom' ? 'mixed' : selDiff), 
        customTypeShort: custTypeShort || (selDiff.toUpperCase()),
        isTimed: state.isTimedQuiz,
        totalTime: state.totalQuizTime,
        isAttemptLimited: state.isAttemptLimited,
        maxAttempts: state.maxAttempts,
        showAnswersInSummaryOnly,
        isRemedial: isRemedial,
        timerMode,
        questionTime,
        enableSecondChance,
        maxChances,
        manualReveal,
        randomizeQuestions,
        randomizeChoices,
        allowChangeSelection
    };

    let quizName = 'Custom Quiz';
    if (isRemedial) {
        quizName = elements.remedialQuizNameInput?.value.trim() || ((state.currentFileName || 'Quiz') + ' - Remedial');
    } else {
        quizName = elements.editQuizNameInput?.value.trim() || state.currentFileName || 'Custom Quiz';
    }
    state.currentFileName = quizName;

    // 3. OPEN AI PROMPT BACKUP MODAL
    openAiPromptModal(state.currentQuizConfig, quizName);
}
