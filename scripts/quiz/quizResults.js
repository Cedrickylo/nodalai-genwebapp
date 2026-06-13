import { elements, state, constants } from '../state.js';
import {
    showView,
    clearInProgressQuiz,
    saveInProgressQuiz
} from '../helpers.js';

const {
    explanationAreaEl,
    nextQuestionBtn,
    skipQuestionBtn,
    summaryOnlyToggle,
    remedialOptionsView,
    resultsActions,
    createRemedialBtn,
    cancelRemedialBtn,
    generateRemedialQuizBtn,
    remedialQuestionCountInput,
    remedialDifficultyRadios,
    remedialCustomOptionsDiv,
    remedialCustomQuestionTypeSelect,
    remedialCustomMixedCountsDiv,
    remedialCustomCountInputs,
    remedialCustomTotalFeedback,
    remedialTimeLimitToggle,
    remedialTimeLimitOptions,
    remedialTimePresetRadios,
    remedialCustomTimeInputContainer,
    remedialCustomTimeLimitInput,
    remedialAttemptLimitToggle,
    remedialAttemptLimitOptions,
    remedialAttemptLimitInput
} = elements;

export function displayExplanation(qData, isCorrect) {
    
    // OFFLINE PROGRESS SILENCE GATE: If manual reveal is enabled, mask the prompt card entirely
    if (state.currentQuizConfig && state.currentQuizConfig.manualReveal) {
        explanationAreaEl.innerHTML = '';
        explanationAreaEl.classList.add('hidden');
    } else {
        const resCol = isCorrect ? 'text-green-400' : 'text-red-400';
        const resTxt = isCorrect ? 'Correct!' : 'Incorrect';
        let ansDisp = '';
        let explanationDisp = '';

        if (!state.currentQuizConfig.showAnswersInSummaryOnly) {
            if (!isCorrect) {
                const corrAns = Array.isArray(qData.answer) ? qData.answer.join(', ') : qData.answer;
                ansDisp = `<p class="text-sm text-gray-400 mt-2">Correct: <strong class="font-semibold text-white">${corrAns || 'N/A'}</strong></p>`;
            }
            explanationDisp = `<p class="mt-2 text-gray-300">${qData.explanation || 'No explanation.'}</p>`;
        }

        explanationAreaEl.innerHTML = `<div class="bg-gray-900/50 p-4 rounded-lg"><h3 class="font-bold text-lg ${resCol}">${resTxt}</h3>${ansDisp}${explanationDisp}</div>`;
        explanationAreaEl.classList.remove('hidden');
    }

    nextQuestionBtn.classList.remove('hidden');
    skipQuestionBtn.classList.add('hidden');
    
    let currOrigIdx = state.inSkippedRound 
        ? state.currentSkippedArray[state.currentSkippedItemIndex] 
        : state.shuffledIndices[state.currentShuffledIndexPos - 1];
    
    saveInProgressQuiz({
        key: state.currentQuizKey,
        questions: state.questions,
        config: state.currentQuizConfig,
        fileName: state.currentFileName,
        shuffledIndexPos: state.currentShuffledIndexPos,
        answeredIndices: Array.from(state.answeredOriginalIndices),
        skippedIndices: Array.from(state.skippedOriginalIndices),
        skippedIndexPos: state.currentSkippedItemIndex,
        inSkippedRound: state.inSkippedRound,
        score: state.score,
        answers: state.userAnswers,
        shuffledIndices: state.shuffledIndices,
        timeRemaining: state.timeRemaining,
        currentAttempts: state.currentAttempts
    });
}

export async function showResults() {
    const { stopQuizTimer } = await import('./quizExecution.js');
    stopQuizTimer();
    clearInProgressQuiz();
    showView('results');

    const totalQ = state.questions.length;
    const perc = totalQ > 0 ? Math.round((state.score / totalQ) * 100) : 0;
    document.getElementById('final-percentage').textContent = `Score: ${state.score}/${totalQ} (${perc}%)`;
    const msg = perc >= 90 ? 'Excellent!' : perc >= 75 ? 'Great!' : perc >= 50 ? 'Good.' : 'Practice!';
    document.getElementById('final-message').textContent = msg;

    const summaryCont = document.getElementById('summary-container');
    summaryCont.innerHTML = '';
    state.incorrectQuestionsForRemedial = [];

    state.questions.forEach((qData, origIdx) => {
        const userAnsObj = state.userAnswers.find(a => a.originalIndex === origIdx);
        const isCorrect = userAnsObj ? userAnsObj.isCorrect : false;
        
        const item = document.createElement('div');
        item.className = `summary-item bg-gray-700/50 p-4 rounded-lg ${isCorrect ? 'summary-correct' : 'summary-incorrect'}`;
        
        let userAnsTxt = 'No answer';
        if (userAnsObj && userAnsObj.userAnswer !== undefined && userAnsObj.userAnswer !== null && userAnsObj.userAnswer !== '') {
            userAnsTxt = Array.isArray(userAnsObj.userAnswer) ? userAnsObj.userAnswer.join(', ') : userAnsObj.userAnswer;
        }
        
        const corrAnsTxt = Array.isArray(qData.answer) ? qData.answer.join(', ') : qData.answer;
        
        item.innerHTML = `
            <p class="font-semibold text-gray-300">Q${origIdx + 1}: ${qData.question}</p>
            <p class="text-sm mt-2">You: <span class="font-mono text-gray-400">${userAnsTxt}</span></p>
            ${!isCorrect ? `<p class="text-sm">Correct: <span class="font-mono text-green-400">${corrAnsTxt || 'N/A'}</span></p>` : ''}
        `;
        
        summaryCont.appendChild(item);
        if (!isCorrect) {
            state.incorrectQuestionsForRemedial.push(qData);
        }
    });

    if (state.incorrectQuestionsForRemedial.length > 0) {
        createRemedialBtn.classList.remove('hidden');
    } else {
        createRemedialBtn.classList.add('hidden');
    }
    remedialOptionsView.classList.add('hidden');
    resultsActions.classList.remove('hidden');
}

export function setupRemedialView() {
    resultsActions.classList.add('hidden');
    remedialOptionsView.classList.remove('hidden');
    createRemedialBtn.classList.add('hidden');

    elements.remedialQuizNameInput.value = (state.currentFileName || 'Quiz') + ' - Remedial';

    const defaultTotal = Math.min(10, state.incorrectQuestionsForRemedial.length * 2);
    remedialQuestionCountInput.value = defaultTotal;
    remedialQuestionCountInput.max = state.incorrectQuestionsForRemedial.length * 3;

    const defaultMC = Math.round(defaultTotal * 0.4);
    const defaultID = Math.round(defaultTotal * 0.3);
    const defaultEN = Math.max(0, defaultTotal - defaultMC - defaultID);

    document.getElementById('remedial-difficulty-easy').checked = true;
    remedialCustomQuestionTypeSelect.value = 'mixed';
    document.getElementById('remedial-mc-count').value = defaultMC;
    document.getElementById('remedial-id-count').value = defaultID;
    document.getElementById('remedial-en-count').value = defaultEN;

    remedialTimeLimitToggle.checked = false;
    remedialAttemptLimitToggle.checked = false;
    document.getElementById('remedial-summary-only-toggle').checked = false;
    remedialTimeLimitOptions.classList.add('hidden');
    remedialAttemptLimitOptions.classList.add('hidden');
    remedialCustomTimeInputContainer.classList.add('hidden');
    document.getElementById('remedial-time-10m').checked = true;
    remedialCustomTimeLimitInput.value = 15;
    remedialAttemptLimitInput.value = 3;

    handleRemedialDifficultyChange();
    validateRemedialInputs();
}

export function handleRemedialDifficultyChange() {
    const sel = document.querySelector('input[name="remedial_difficulty"]:checked').value;
    const isCust = sel === 'custom';
    remedialCustomOptionsDiv.classList.toggle('hidden', !isCust);
    if (isCust) {
        handleRemedialCustomTypeChange();
    } else {
        remedialCustomMixedCountsDiv.classList.add('hidden');
    }
    validateRemedialInputs();
}

export function handleRemedialCustomTypeChange() {
    const sel = remedialCustomQuestionTypeSelect.value;
    remedialCustomMixedCountsDiv.classList.toggle('hidden', sel !== 'mixed');
    validateRemedialInputs();
}

export function handleRemedialTimeToggle() {
    remedialTimeLimitOptions.classList.toggle('hidden', !remedialTimeLimitToggle.checked);
    if (remedialTimeLimitToggle.checked) {
        handleRemedialTimePresetChange();
    } else {
        remedialCustomTimeInputContainer.classList.add('hidden');
    }
    validateRemedialInputs();
}

export function handleRemedialAttemptToggle() {
    remedialAttemptLimitOptions.classList.toggle('hidden', !remedialAttemptLimitToggle.checked);
    validateRemedialInputs();
}

export function handleRemedialTimePresetChange() {
    const selected = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
    remedialCustomTimeInputContainer.classList.toggle('hidden', selected !== 'custom');
    validateRemedialInputs();
}

export function validateRemedialInputs() {
    const selDiff = document.querySelector('input[name="remedial_difficulty"]:checked').value;
    let custOk = true;
    if (selDiff === 'custom') {
        const selCustType = remedialCustomQuestionTypeSelect.value;
        if (selCustType === 'mixed') {
            const totalQ = parseInt(remedialQuestionCountInput.value, 10);
            const mc = parseInt(document.getElementById('remedial-mc-count').value, 10) || 0;
            const id = parseInt(document.getElementById('remedial-id-count').value, 10) || 0;
            const en = parseInt(document.getElementById('remedial-en-count').value, 10) || 0;
            const sum = mc + id + en;
            if (sum !== totalQ || totalQ <= 0) {
                remedialCustomTotalFeedback.textContent = sum !== totalQ ? `Counts(${sum}) != total(${totalQ}).` : 'Total > 0.';
                remedialCustomTotalFeedback.className = 'text-xs text-center mt-3 h-4 text-red-400';
                custOk = false;
            } else {
                remedialCustomTotalFeedback.textContent = 'Counts match.';
                remedialCustomTotalFeedback.className = 'text-xs text-center mt-3 h-4 text-green-400';
            }
        } else {
            remedialCustomTotalFeedback.textContent = '';
        }
    } else {
        remedialCustomTotalFeedback.textContent = '';
    }

    const qCountOk = parseInt(remedialQuestionCountInput.value, 10) > 0;
    let timeOk = true;
    if (remedialTimeLimitToggle.checked) {
        const selPreset = document.querySelector('input[name="remedial_time_preset"]:checked').value;
        if (selPreset === 'custom') {
            const timeVal = parseInt(remedialCustomTimeLimitInput.value, 10);
            timeOk = timeVal > 0;
        }
    }

    let attOk = true;
    if (remedialAttemptLimitToggle.checked) {
        const attVal = parseInt(remedialAttemptLimitInput.value, 10);
        attOk = attVal > 0;
    }

    generateRemedialQuizBtn.disabled = !(custOk && qCountOk && timeOk && attOk);
}