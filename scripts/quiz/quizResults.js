import { elements, state, constants } from '../state.js';
import {
    showView,
    clearInProgressQuiz,
    saveInProgressQuiz,
    getQuizTakes,
    saveQuizTake,
    pushSubState,
    clearSubState,
    closeModalWithAnimation,
    syncHistoryWithCloud
} from '../helpers.js';

const {
    explanationAreaEl,
    nextQuestionBtn,
    skipQuestionBtn,
    summaryOnlyToggle,
    resultsActions,
    createRemedialBtn,
    remedialSetupModal,
    closeRemedialSetupModalBtn,
    cancelRemedialBtn,
    generateRemedialQuizBtn,
    remedialQuizNameInput,
    remedialQuestionCountInput,
    remedialDifficultyRadios,
    remedialCustomOptionsDiv,
    remedialCustomQuestionTypeSelect,
    remedialCustomMixedCountsDiv,
    remedialCustomCountInputs,
    remedialCustomTotalFeedback,
    remedialTimeLimitToggle,
    remedialTimeLimitOptions,
    remedialTimerModeSelect,
    remedialQuizTimePresetsContainer,
    remedialQuestionTimeContainer,
    remedialQuestionTimeInput,
    remedialTimePresetRadios,
    remedialCustomTimeInputContainer,
    remedialCustomTimeLimitInput,
    remedialAttemptLimitToggle,
    remedialAttemptLimitOptions,
    remedialAttemptLimitInput,
    remedialSummaryOnlyToggle,
    remedialSecondChanceToggle,
    remedialSecondChanceOptions,
    remedialMaxChancesInput,
    remedialAllowChangeToggle,
    remedialShuffleQuestionsToggle,
    remedialShuffleChoicesToggle,
    remedialUiModeModern,
    remedialUiModeClassic
} = elements;

export function displayExplanation(qData, isCorrect) {
    
    // OFFLINE PROGRESS SILENCE GATE: If summary only is enabled, mask the prompt card entirely
    if (state.currentQuizConfig && state.currentQuizConfig.showAnswersInSummaryOnly) {
        explanationAreaEl.innerHTML = '';
        explanationAreaEl.classList.add('hidden');
    } else {
        const resCol = isCorrect ? 'text-green-400' : 'text-red-400';
        const resTxt = isCorrect ? 'Correct!' : 'Incorrect';
        let ansDisp = '';
        let explanationDisp = '';

        if (!isCorrect) {
            const corrAns = Array.isArray(qData.answer) ? qData.answer.join(', ') : qData.answer;
            ansDisp = `<p class="text-sm text-gray-400 mt-2">Correct: <strong class="font-semibold text-white">${corrAns || 'N/A'}</strong></p>`;
        }
        explanationDisp = `<p class="mt-2 text-gray-300">${qData.explanation || 'No explanation.'}</p>`;

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
    stopQuizTimer(true);
    clearInProgressQuiz();
    state.isQuizCompleted = true;
    showView('results', false);
    window.history.replaceState({ view: 'results' }, '', '#results');

    const totalQ = state.questions.length;
    const perc = totalQ > 0 ? Math.round((state.score / totalQ) * 100) : 0;
    document.getElementById('final-percentage').textContent = `Score: ${state.score}/${totalQ} (${perc}%)`;
    const msg = perc >= 90 ? 'Excellent!' : perc >= 75 ? 'Great!' : perc >= 50 ? 'Good.' : 'Practice!';
    document.getElementById('final-message').textContent = msg;

    const summaryCont = document.getElementById('summary-container');
    summaryCont.innerHTML = '';
    state.incorrectQuestionsForRemedial = [];

    // Order questions according to their presentation sequence on the quiz screen
    const displayOrder = (state.shuffledIndices && state.shuffledIndices.length === state.questions.length)
        ? state.shuffledIndices
        : state.questions.map((_, idx) => idx);

    displayOrder.forEach((origIdx, displayIdx) => {
        const qData = state.questions[origIdx];
        if (!qData) return;

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
            <p class="font-semibold text-gray-300 break-words whitespace-normal leading-snug">Q${displayIdx + 1}: ${qData.question}</p>
            <p class="text-sm mt-2 break-words whitespace-normal">You: <span class="font-mono text-gray-400 break-words">${userAnsTxt}</span></p>
            ${!isCorrect ? `<p class="text-sm break-words whitespace-normal mt-1">Correct: <span class="font-mono text-green-400 break-words">${corrAnsTxt || 'N/A'}</span></p>` : ''}
        `;
        
        summaryCont.appendChild(item);
        if (!isCorrect) {
            state.incorrectQuestionsForRemedial.push(qData);
        }
    });

    if (state.incorrectQuestionsForRemedial.length > 0) {
        createRemedialBtn.classList.remove('hidden');
        createRemedialBtn.onclick = () => openRemedialSetupModal(true);
    } else {
        createRemedialBtn.classList.add('hidden');
    }
    if (elements.remedialSetupModal) {
        elements.remedialSetupModal.classList.add('hidden');
    }
    resultsActions.classList.remove('hidden');

    // Persist completed take separately in nodal_quiz_takes_v1
    const quizKey = state.currentQuizKey || (state.currentFileName ? state.currentFileName.replace(/[^a-zA-Z0-9_-]/g, '_') : 'quiz_' + Date.now());
    const existingTakes = getQuizTakes(quizKey) || [];
    const takeNumber = existingTakes.length + 1;
    const now = Date.now();
    const dateStr = new Date(now).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });

    const takeRecord = {
        id: `take_${now}_${Math.random().toString(36).substring(2, 7)}`,
        quizKey: quizKey,
        takeNumber: takeNumber,
        completedAt: now,
        formattedDate: dateStr,
        score: state.score,
        totalQuestions: totalQ,
        percentage: perc,
        fileName: state.currentFileName || 'Quiz',
        displayOrder: [...displayOrder],
        questions: JSON.parse(JSON.stringify(state.questions)),
        userAnswers: JSON.parse(JSON.stringify(state.userAnswers || [])),
        shuffledIndices: state.shuffledIndices ? [...state.shuffledIndices] : [...displayOrder],
        shuffledOptionsMap: state.shuffledOptionsMap ? JSON.parse(JSON.stringify(state.shuffledOptionsMap)) : {}
    };

    saveQuizTake(quizKey, takeRecord);
    state.currentCompletedTake = takeRecord;
    state.currentStatsQuizKey = quizKey;

    // Automatically trigger cloud synchronization so completed takes and scores sync across devices immediately
    try {
        syncHistoryWithCloud(false).catch(err => console.warn('[QuizResults] Auto-sync after quiz take error:', err));
    } catch (e) {}

    // Wire up Review Quiz button to launch test review with 'results' origin
    if (elements.reviewQuizBtn) {
        elements.reviewQuizBtn.onclick = async () => {
            const { openTestReview } = await import('./quizStatistics.js');
            openTestReview(state.currentCompletedTake, 'results');
        };
    }
}

export function openRemedialSetupModal(isNew = true, fromPopState = false) {
    if (!elements.remedialSetupModal) return;

    if (isNew) {
        if (elements.remedialQuizNameInput) {
            elements.remedialQuizNameInput.value = ((state.currentFileName || 'Quiz') + ' - Remedial').slice(0, 35);
        }

        const incorrectLen = state.incorrectQuestionsForRemedial?.length || 1;
        const defaultTotal = Math.min(10, Math.max(5, incorrectLen * 2));
        if (remedialQuestionCountInput) {
            remedialQuestionCountInput.value = defaultTotal;
            remedialQuestionCountInput.max = Math.max(10, incorrectLen * 3);
        }

        const defaultMC = Math.round(defaultTotal * 0.4);
        const defaultTF = Math.round(defaultTotal * 0.2);
        const defaultID = Math.round(defaultTotal * 0.2);
        const defaultEN = Math.max(0, defaultTotal - defaultMC - defaultTF - defaultID);

        const rEasy = document.getElementById('remedial-difficulty-easy');
        if (rEasy) rEasy.checked = true;

        if (remedialCustomQuestionTypeSelect) {
            remedialCustomQuestionTypeSelect.value = 'mixed';
        }

        const rMc = document.getElementById('remedial-mc-count');
        const rTf = document.getElementById('remedial-tf-count');
        const rId = document.getElementById('remedial-id-count');
        const rEn = document.getElementById('remedial-en-count');
        if (rMc) rMc.value = defaultMC;
        if (rTf) rTf.value = defaultTF;
        if (rId) rId.value = defaultID;
        if (rEn) rEn.value = defaultEN;

        if (elements.remedialUiModeModern) elements.remedialUiModeModern.checked = true;

        if (remedialTimeLimitToggle) remedialTimeLimitToggle.checked = false;
        if (elements.remedialTimerModeSelect) elements.remedialTimerModeSelect.value = 'quiz';
        const rTime10m = document.getElementById('remedial-time-10m');
        if (rTime10m) rTime10m.checked = true;
        if (remedialCustomTimeLimitInput) remedialCustomTimeLimitInput.value = 15;
        if (elements.remedialQuestionTimeInput) elements.remedialQuestionTimeInput.value = 30;

        if (remedialAttemptLimitToggle) remedialAttemptLimitToggle.checked = false;
        if (remedialAttemptLimitInput) remedialAttemptLimitInput.value = 3;

        if (elements.remedialSummaryOnlyToggle) elements.remedialSummaryOnlyToggle.checked = false;

        if (elements.remedialSecondChanceToggle) elements.remedialSecondChanceToggle.checked = false;
        if (elements.remedialMaxChancesInput) elements.remedialMaxChancesInput.value = '1';

        if (elements.remedialAllowChangeToggle) elements.remedialAllowChangeToggle.checked = false;

        if (elements.remedialShuffleQuestionsToggle) elements.remedialShuffleQuestionsToggle.checked = true;
        if (elements.remedialShuffleChoicesToggle) elements.remedialShuffleChoicesToggle.checked = true;
    }

    // Refresh sub-container visibility
    handleRemedialCustomTypeChange();
    handleRemedialTimeToggle();
    handleRemedialTimerModeChange();
    handleRemedialAttemptToggle();
    handleRemedialSecondChanceToggle();
    validateRemedialInputs();

    elements.remedialSetupModal.classList.remove('hidden');

    if (!fromPopState) {
        pushSubState('#remedial-setup', { view: 'results' });
    }
}

export function closeRemedialSetupModal(fromPopState = false) {
    clearSubState('#remedial-setup');
    const modal = elements.remedialSetupModal || document.getElementById('remedial-setup-modal');
    if (!modal || modal.classList.contains('hidden')) return;

    closeModalWithAnimation(modal, () => {
        if (!fromPopState && window.location.hash === '#remedial-setup') {
            window.history.back();
        }
    });
}

export const setupRemedialView = () => openRemedialSetupModal(true);

export function handleRemedialDifficultyChange() {
    validateRemedialInputs();
}

export function handleRemedialCustomTypeChange() {
    const sel = remedialCustomQuestionTypeSelect?.value || 'mixed';
    if (elements.remedialCustomMixedCountsDiv) {
        elements.remedialCustomMixedCountsDiv.classList.toggle('hidden', sel !== 'mixed');
    }
    validateRemedialInputs();
}

export function handleRemedialTimerModeChange() {
    const isQuestionMode = elements.remedialTimerModeSelect?.value === 'question';
    if (elements.remedialQuizTimePresetsContainer) {
        elements.remedialQuizTimePresetsContainer.classList.toggle('hidden', isQuestionMode);
    }
    if (elements.remedialQuestionTimeContainer) {
        elements.remedialQuestionTimeContainer.classList.toggle('hidden', !isQuestionMode);
    }
    validateRemedialInputs();
}

export function handleRemedialSecondChanceToggle() {
    if (elements.remedialSecondChanceOptions) {
        elements.remedialSecondChanceOptions.classList.toggle('hidden', !elements.remedialSecondChanceToggle?.checked);
    }
    validateRemedialInputs();
}

export function handleRemedialTimeToggle() {
    const isEnabled = !!remedialTimeLimitToggle?.checked;
    if (remedialTimeLimitOptions) {
        remedialTimeLimitOptions.classList.toggle('hidden', !isEnabled);
    }
    if (isEnabled) {
        handleRemedialTimerModeChange();
        const selPreset = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
        if (remedialCustomTimeInputContainer) {
            remedialCustomTimeInputContainer.classList.toggle('hidden', selPreset !== 'custom');
        }
    }
    validateRemedialInputs();
}

export function handleRemedialAttemptToggle() {
    if (remedialAttemptLimitOptions) {
        remedialAttemptLimitOptions.classList.toggle('hidden', !remedialAttemptLimitToggle?.checked);
    }
    validateRemedialInputs();
}

export function handleRemedialTimePresetChange() {
    const selected = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
    if (remedialCustomTimeInputContainer) {
        remedialCustomTimeInputContainer.classList.toggle('hidden', selected !== 'custom');
    }
    validateRemedialInputs();
}

export function validateRemedialInputs() {
    const selCustType = remedialCustomQuestionTypeSelect?.value || 'mixed';
    let custOk = true;
    if (selCustType === 'mixed') {
        const totalQ = parseInt(remedialQuestionCountInput?.value, 10) || 0;
        const mc = parseInt(document.getElementById('remedial-mc-count')?.value, 10) || 0;
        const tf = parseInt(document.getElementById('remedial-tf-count')?.value, 10) || 0;
        const id = parseInt(document.getElementById('remedial-id-count')?.value, 10) || 0;
        const en = parseInt(document.getElementById('remedial-en-count')?.value, 10) || 0;
        const sum = mc + tf + id + en;
        if (sum !== totalQ || totalQ <= 0) {
            if (remedialCustomTotalFeedback) {
                remedialCustomTotalFeedback.textContent = `Total: ${sum} / ${totalQ} (MC: ${mc}, T/F: ${tf}, ID: ${id}, EN: ${en})`;
                remedialCustomTotalFeedback.className = 'text-xs text-center mt-3 h-4 text-red-400 font-medium';
            }
            custOk = false;
        } else {
            if (remedialCustomTotalFeedback) {
                remedialCustomTotalFeedback.textContent = `Counts match: ${mc} MC + ${tf} T/F + ${id} ID + ${en} EN = ${totalQ}`;
                remedialCustomTotalFeedback.className = 'text-xs text-center mt-3 h-4 text-green-400 font-medium';
            }
        }
    } else {
        if (remedialCustomTotalFeedback) {
            remedialCustomTotalFeedback.textContent = '';
        }
    }

    const qCount = parseInt(remedialQuestionCountInput?.value, 10);
    const qCountOk = Number.isInteger(qCount) && qCount >= constants.MIN_QUIZ_QUESTIONS && qCount <= constants.MAX_QUIZ_QUESTIONS;

    let timeOk = true;
    if (remedialTimeLimitToggle?.checked) {
        const timerMode = elements.remedialTimerModeSelect?.value || 'quiz';
        if (timerMode === 'question') {
            const qTime = parseInt(elements.remedialQuestionTimeInput?.value, 10);
            timeOk = Number.isInteger(qTime) && qTime >= 5;
        } else {
            const selPreset = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
            if (selPreset === 'custom') {
                const timeVal = parseInt(remedialCustomTimeLimitInput?.value, 10);
                timeOk = Number.isInteger(timeVal) && timeVal > 0;
            }
        }
    }

    let attOk = true;
    if (remedialAttemptLimitToggle?.checked) {
        const attVal = parseInt(remedialAttemptLimitInput?.value, 10);
        attOk = Number.isInteger(attVal) && attVal > 0;
    }

    let chanceOk = true;
    if (elements.remedialSecondChanceToggle?.checked) {
        const chanceVal = parseInt(elements.remedialMaxChancesInput?.value, 10);
        chanceOk = Number.isInteger(chanceVal) && chanceVal > 0;
    }

    // Choice-Swapping & Second-Chance settings (Automatically disabled when "Don't auto-validate" is checked)
    const isRemedialSummaryOnly = elements.remedialSummaryOnlyToggle ? elements.remedialSummaryOnlyToggle.checked : false;
    const rAllowChange = elements.remedialAllowChangeToggle || document.getElementById('remedial-allow-change-toggle');
    const rAllowContainer = elements.remedialAllowChangeContainer || document.getElementById('remedial-allow-change-container');
    const rSecondChance = elements.remedialSecondChanceToggle || document.getElementById('remedial-second-chance-toggle');
    const rSecondChanceContainer = elements.remedialSecondChanceContainer || document.getElementById('remedial-second-chance-container');
    const rSecondChanceOptions = elements.remedialSecondChanceOptions || document.getElementById('remedial-second-chance-options');

    if (isRemedialSummaryOnly) {
        if (rAllowChange) {
            rAllowChange.checked = false;
            rAllowChange.disabled = true;
        }
        if (rAllowContainer) {
            rAllowContainer.classList.add('opacity-50', 'pointer-events-none');
        }
        if (rSecondChance) {
            rSecondChance.checked = false;
            rSecondChance.disabled = true;
        }
        if (rSecondChanceContainer) {
            rSecondChanceContainer.classList.add('opacity-50', 'pointer-events-none');
        }
        if (rSecondChanceOptions) {
            rSecondChanceOptions.classList.add('hidden');
        }
    } else {
        if (rAllowChange) {
            rAllowChange.disabled = false;
        }
        if (rAllowContainer) {
            rAllowContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
        if (rSecondChance) {
            rSecondChance.disabled = false;
        }
        if (rSecondChanceContainer) {
            rSecondChanceContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    if (generateRemedialQuizBtn) {
        generateRemedialQuizBtn.disabled = !(custOk && qCountOk && timeOk && attOk && chanceOk);
    }
}