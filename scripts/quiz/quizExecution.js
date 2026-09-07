import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    saveInProgressQuiz,
    clearInProgressQuiz
} from '../helpers.js';
import { showResults, displayExplanation } from './quizResults.js';

const {
    nextQuestionBtn,
    skipQuestionBtn,
    prevQuestionBtn,
    nextUnansweredBtn,
    unansweredModal,
    unansweredCountText,
    unansweredNumbersList,
    unansweredProceedSubmitBtn,
    unansweredReviewBtn,
    restartQuizBtn,
    progressEl,
    scoreEl,
    classicProgressContainer,
    modernMetaContainer,
    modernQuestionNumber,
    modernQuestionTypeBadge,
    modernScoreStats,
    modernStatCorrectCount,
    modernStatWrongCount,
    questionTextEl,
    answerAreaEl,
    explanationAreaEl,
    timerDisplayEl,
    visualTimerContainer,
    visualTimerBar,
    attemptDisplayEl,
    homeBtn,
    saveQuizBtn,
    exportQuizBtn,
    resumeQuizBtn,
    revealAnswerBtn
} = elements;

export function evaluateAnswer(qData, userAnswer) {
    if (userAnswer === null || userAnswer === undefined || userAnswer === '' || userAnswer === 'Time Out') {
        return false;
    }
    const qType = (qData.type || '').toString().trim().toLowerCase();
    if (qType === 'multiple-choice' || qType === 'true-or-false') {
        const selAns = (userAnswer || '').toString().trim().toLowerCase();
        return selAns === (qData.answer || '').toString().trim().toLowerCase();
    } else if (qType === 'identification') {
        return (userAnswer || '').toString().trim().toLowerCase() === (qData.answer || '').toString().trim().toLowerCase();
    } else if (qType === 'enumeration') {
        let rawAnswer = qData.answer || [];
        if (typeof rawAnswer === 'string') rawAnswer = rawAnswer.split(/[,|\n]/);
        else if (!Array.isArray(rawAnswer)) rawAnswer = [rawAnswer];
        const correctItems = rawAnswer.map(s => (s || '').toString().trim().toLowerCase()).sort();
        const userItems = (Array.isArray(userAnswer) ? userAnswer : [userAnswer]).map(s => (s || '').toString().trim().toLowerCase()).sort();
        return correctItems.length === userItems.length && correctItems.every((it, i) => it === userItems[i]);
    }
    return false;
}

export function isQuestionAnswered(origIdx) {
    const record = state.userAnswers.find(a => a.originalIndex === origIdx);
    if (!record) return false;
    const ans = record.userAnswer;
    if (ans === null || ans === undefined || ans === '' || ans === 'Time Out') return false;
    if (Array.isArray(ans) && ans.length === 0) return false;
    return true;
}

export function getUnansweredQuestionIndices() {
    const list = [];
    state.shuffledIndices.forEach((origIdx, posIndex) => {
        if (!isQuestionAnswered(origIdx)) {
            list.push({
                posIndex: posIndex,
                displayNumber: posIndex + 1,
                origIdx: origIdx
            });
        }
    });
    return list;
}

export function persistQuizProgress() {
    saveInProgressQuiz({
        key: state.currentQuizKey,
        questions: state.questions,
        config: state.currentQuizConfig,
        fileName: state.currentFileName,
        shuffledIndexPos: state.currentShuffledIndexPos,
        currentQuestionIndex: state.currentQuestionIndex,
        isReviewingUnanswered: state.isReviewingUnanswered,
        answeredIndices: Array.from(state.answeredOriginalIndices),
        skippedIndices: Array.from(state.skippedOriginalIndices),
        skippedIndexPos: state.currentSkippedItemIndex,
        inSkippedRound: state.inSkippedRound,
        score: state.score,
        answers: state.userAnswers,
        shuffledIndices: state.shuffledIndices,
        shuffledOptionsMap: state.shuffledOptionsMap,
        timeRemaining: state.timeRemaining,
        currentAttempts: state.currentAttempts
    });
}

export function updateScoreAndStatsDisplay() {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;

    if (isModern) {
        scoreEl?.classList.add('hidden');
        if (isSummaryOnly) {
            modernScoreStats?.classList.add('hidden');
        } else {
            modernScoreStats?.classList.remove('hidden');
            const correctCount = state.userAnswers.filter(a => a.isCorrect === true).length;
            const wrongCount = state.userAnswers.filter(a => a.isCorrect === false).length;
            if (modernStatCorrectCount) modernStatCorrectCount.textContent = correctCount;
            if (modernStatWrongCount) modernStatWrongCount.textContent = wrongCount;
        }
    } else {
        modernScoreStats?.classList.add('hidden');
        scoreEl?.classList.remove('hidden');
        if (isSummaryOnly) {
            if (scoreEl) scoreEl.textContent = 'Score: Hidden';
        } else {
            if (scoreEl) scoreEl.textContent = `Score: ${state.score}`;
        }
    }
}

function updateHeaderMeta(qData, currentIdx, totalQ) {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    if (isModern) {
        classicProgressContainer?.classList.add('hidden');
        modernMetaContainer?.classList.remove('hidden');
        if (modernQuestionNumber) {
            modernQuestionNumber.textContent = `Question ${currentIdx + 1} of ${totalQ}`;
        }
        
        // Show question type badge ONLY when shuffle questions is turned OFF
        if (state.currentQuizConfig?.randomizeQuestions === false && modernQuestionTypeBadge) {
            modernQuestionTypeBadge.classList.remove('hidden');
            const type = (qData.type || '').toString().trim().toLowerCase();
            let typeLabel = 'Multiple Choice';
            if (type === 'true-or-false') typeLabel = 'True / False';
            else if (type === 'identification') typeLabel = 'Identification';
            else if (type === 'enumeration') typeLabel = 'Enumeration';
            modernQuestionTypeBadge.textContent = typeLabel;
        } else {
            modernQuestionTypeBadge?.classList.add('hidden');
        }
    } else {
        modernMetaContainer?.classList.add('hidden');
        classicProgressContainer?.classList.remove('hidden');
        if (progressEl) {
            if (state.inSkippedRound) {
                progressEl.innerHTML = `<span class="text-yellow-400 font-bold tracking-wide animate-pulse">Skipped Qs: ${state.currentSkippedItemIndex + 1} / ${state.currentSkippedArray.length}</span>`;
            } else {
                progressEl.textContent = `Q ${state.answeredOriginalIndices.size + state.skippedOriginalIndices.size + 1}/${totalQ}`;
            }
        }
    }
}

export function updateUnansweredReviewBtn() {
    if (!nextUnansweredBtn) return;
    if (!state.isReviewingUnanswered) {
        nextUnansweredBtn.classList.add('hidden');
        return;
    }

    const unanswered = getUnansweredQuestionIndices();
    nextUnansweredBtn.classList.remove('hidden');

    if (unanswered.length > 0) {
        nextUnansweredBtn.className = 'flex-grow bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center gap-2';
        nextUnansweredBtn.innerHTML = `<span>Next Unanswered (${unanswered.length} left)</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>`;
    } else {
        // All unanswered questions are now answered! Dynamically convert to Submit Quiz button
        nextUnansweredBtn.className = 'flex-grow bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg flex items-center justify-center gap-2 animate-pulse';
        nextUnansweredBtn.innerHTML = `<span>Submit Quiz ✓</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
    }
}

export function handleNextUnansweredOrSubmit() {
    const unanswered = getUnansweredQuestionIndices();
    if (unanswered.length === 0) {
        showResults();
        return;
    }

    // Find next unanswered question after the current question index
    const nextAfterCurrent = unanswered.find(item => item.posIndex > state.currentQuestionIndex);
    if (nextAfterCurrent) {
        state.currentQuestionIndex = nextAfterCurrent.posIndex;
    } else {
        // Wrap around to first remaining unanswered
        state.currentQuestionIndex = unanswered[0].posIndex;
    }
    displayCurrentQuestion();
    updateUnansweredReviewBtn();
}

export function checkAndHandleSubmit() {
    const unanswered = getUnansweredQuestionIndices();
    if (unanswered.length === 0) {
        showResults();
        return;
    }

    // Show unanswered modal with missing question numbers
    if (unansweredCountText) {
        unansweredCountText.textContent = `You have ${unanswered.length} unanswered question${unanswered.length > 1 ? 's' : ''}.`;
    }
    if (unansweredNumbersList) {
        unansweredNumbersList.innerHTML = '';
        unanswered.forEach(item => {
            const badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'px-3 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 rounded-lg text-xs font-semibold transition cursor-pointer';
            badge.textContent = `Question ${item.displayNumber}`;
            badge.onclick = () => {
                unansweredModal?.classList.add('hidden');
                state.isReviewingUnanswered = true;
                state.currentQuestionIndex = item.posIndex;
                displayCurrentQuestion();
                updateUnansweredReviewBtn();
            };
            unansweredNumbersList.appendChild(badge);
        });
    }

    if (unansweredProceedSubmitBtn) {
        unansweredProceedSubmitBtn.onclick = () => {
            unansweredModal?.classList.add('hidden');
            showResults();
        };
    }

    if (unansweredReviewBtn) {
        unansweredReviewBtn.onclick = () => {
            unansweredModal?.classList.add('hidden');
            state.isReviewingUnanswered = true;
            const remaining = getUnansweredQuestionIndices();
            if (remaining.length > 0) {
                state.currentQuestionIndex = remaining[0].posIndex;
            }
            displayCurrentQuestion();
            updateUnansweredReviewBtn();
        };
    }

    unansweredModal?.classList.remove('hidden');
}

export function startQuiz() {
    state.score = 0;
    state.userAnswers = [];
    state.currentShuffledIndexPos = 0;
    state.currentQuestionIndex = 0;
    state.isReviewingUnanswered = false;
    state.answeredOriginalIndices.clear();
    state.skippedOriginalIndices.clear();
    state.currentSkippedItemIndex = 0;
    state.inSkippedRound = false;
    state.currentSkippedArray = [];
    state.currentAttempts = 0;
    state.shuffledOptionsMap = {};

    nextUnansweredBtn?.classList.add('hidden');
    unansweredModal?.classList.add('hidden');

    // Shuffle Gate Configuration
    const shouldShuffle = state.currentQuizConfig.randomizeQuestions !== false;
    const shuffled = Array.from(Array(state.questions.length).keys());
    if (shouldShuffle) {
        shuffled.sort(() => Math.random() - 0.5);
    }
    state.shuffledIndices = shuffled;

    persistQuizProgress();

    showView('quiz');
    updateAttemptDisplay();
    
    const isModern = (state.currentQuizConfig?.uiMode || 'modern') !== 'classic';
    if (isModern) {
        displayCurrentQuestion();
    } else {
        prevQuestionBtn?.classList.add('hidden');
        nextUnansweredBtn?.classList.add('hidden');
        modernMetaContainer?.classList.add('hidden');
        modernScoreStats?.classList.add('hidden');
        classicProgressContainer?.classList.remove('hidden');
        scoreEl?.classList.remove('hidden');
        skipQuestionBtn?.classList.remove('hidden');
        displayNextQuestion();
    }
    
    if (state.isTimedQuiz && state.currentQuizConfig.timerMode !== 'question') {
        startQuizTimer(state.totalQuizTime);
    } else {
        stopQuizTimer();
    }
}

export function startQuizTimer(startTime) {
    timerDisplayEl?.classList.remove('hidden', 'text-red-400');
    visualTimerContainer?.classList.remove('hidden');
    if (visualTimerBar) {
        visualTimerBar.style.width = '100%';
        visualTimerBar.classList.remove('bg-red-500');
        visualTimerBar.classList.add('bg-blue-500');
    }
    state.timeRemaining = startTime;
    updateTimerDisplay();
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = setInterval(() => {
        state.timeRemaining--;
        updateTimerDisplay();
        if (state.timeRemaining <= 0) {
            handleTimeUp();
        }
    }, 1000);
}

export function updateTimerDisplay() {
    const mins = Math.floor(state.timeRemaining / 60);
    const secs = state.timeRemaining % 60;
    if (timerDisplayEl) {
        timerDisplayEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    const perc = state.totalQuizTime > 0 ? Math.max(0, (state.timeRemaining / state.totalQuizTime) * 100) : 0;
    if (visualTimerBar) {
        visualTimerBar.style.width = `${perc}%`;
    }
    const isWarn = state.timeRemaining <= 60 && state.totalQuizTime > 60;
    timerDisplayEl?.classList.toggle('text-red-400', isWarn);
    visualTimerBar?.classList.toggle('bg-red-500', isWarn);
    visualTimerBar?.classList.toggle('bg-blue-500', !isWarn);
}

export function stopQuizTimer() {
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = null;
    if (state.currentQuizConfig && state.currentQuizConfig.timerMode === 'question') return;
    if (timerDisplayEl) {
        timerDisplayEl.classList.add('hidden');
        timerDisplayEl.classList.remove('text-red-400');
        timerDisplayEl.textContent = '';
    }
    visualTimerContainer?.classList.add('hidden');
    if (visualTimerBar) {
        visualTimerBar.style.width = '100%';
        visualTimerBar.classList.remove('bg-red-500');
        visualTimerBar.classList.add('bg-blue-500');
    }
}

export function startQuestionTimer(startTime) {
    timerDisplayEl?.classList.remove('hidden', 'text-red-400');
    visualTimerContainer?.classList.remove('hidden');
    if (visualTimerBar) {
        visualTimerBar.style.width = '100%';
        visualTimerBar.classList.remove('bg-red-500');
        visualTimerBar.classList.add('bg-blue-500');
    }
    state.currentQuestionTimeRemaining = startTime;
    if (timerDisplayEl) {
        timerDisplayEl.textContent = `0:${state.currentQuestionTimeRemaining < 10 ? '0' : ''}${state.currentQuestionTimeRemaining}`;
    }
    
    if (state.questionTimerInterval) clearInterval(state.questionTimerInterval);
    state.questionTimerInterval = setInterval(() => {
        state.currentQuestionTimeRemaining--;
        const secs = state.currentQuestionTimeRemaining;
        if (timerDisplayEl) {
            timerDisplayEl.textContent = `0:${secs < 10 ? '0' : ''}${secs}`;
        }
        const perc = startTime > 0 ? Math.max(0, (secs / startTime) * 100) : 0;
        if (visualTimerBar) {
            visualTimerBar.style.width = `${perc}%`;
        }
        const isWarn = secs <= 5;
        timerDisplayEl?.classList.toggle('text-red-400', isWarn);
        visualTimerBar?.classList.toggle('bg-red-500', isWarn);
        visualTimerBar?.classList.toggle('bg-blue-500', !isWarn);

        if (state.currentQuestionTimeRemaining <= 0) {
            clearInterval(state.questionTimerInterval);
            state.questionTimerInterval = null;
            showToast("Question Time's Up!", 3000, 'error');
            checkAnswer("Time Out");
        }
    }, 1000);
}

export function updateAttemptDisplay() {
    if (!attemptDisplayEl) return;
    if (state.isAttemptLimited) {
        attemptDisplayEl.classList.remove('hidden');
        attemptDisplayEl.textContent = `Attempts: ${state.currentAttempts}/${state.maxAttempts}`;
    } else {
        attemptDisplayEl.classList.add('hidden');
    }
}

export function handleTimeUp() {
    stopQuizTimer();
    showToast("Time's Up!", 3000, 'error');
    answerAreaEl?.classList.add('disabled-options');
    nextQuestionBtn?.classList.add('hidden');
    skipQuestionBtn?.classList.add('hidden');
    prevQuestionBtn?.classList.add('hidden');
    nextUnansweredBtn?.classList.add('hidden');
    setTimeout(() => { showResults(); }, 1500);
}

// ---------------------------------------------------------------------
// QUESTION OPTIONS HELPER (Cached per question for stable ordering)
// ---------------------------------------------------------------------
export function getOrGenerateQuestionOptions(qData, origIdx) {
    if (!state.shuffledOptionsMap) {
        state.shuffledOptionsMap = {};
    }
    if (state.shuffledOptionsMap[origIdx]) {
        return state.shuffledOptionsMap[origIdx];
    }

    const questionType = (qData.type || '').toString().trim().toLowerCase();
    const isTrueFalse = questionType === 'true-or-false' || (
        Array.isArray(qData.options) &&
        qData.options.length === 2 &&
        qData.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase()))
    );

    let opts = [];
    if (isTrueFalse) {
        opts = ["True", "False"];
    } else {
        const shuffleChoices = state.currentQuizConfig?.randomizeChoices !== false;
        if (Array.isArray(qData.options)) {
            opts = [...qData.options];
            if (shuffleChoices) {
                // Fisher-Yates shuffle for uniform randomization
                for (let i = opts.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [opts[i], opts[j]] = [opts[j], opts[i]];
                }
            }
        }
    }

    state.shuffledOptionsMap[origIdx] = opts;
    return opts;
}

// ---------------------------------------------------------------------
// MODERN INTERACTION MODE QUESTION RENDERER
// ---------------------------------------------------------------------
export function displayCurrentQuestion() {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;
    const totalQ = state.shuffledIndices.length;

    if (state.currentQuestionIndex < 0) state.currentQuestionIndex = 0;
    if (state.currentQuestionIndex >= totalQ) state.currentQuestionIndex = totalQ - 1;

    const currOrigIdx = state.shuffledIndices[state.currentQuestionIndex];
    const qData = state.questions[currOrigIdx];
    if (!qData) {
        console.error('Question data missing at index', state.currentQuestionIndex);
        showResults();
        return;
    }

    // Reset layout containers
    explanationAreaEl?.classList.add('hidden');
    if (explanationAreaEl) explanationAreaEl.innerHTML = '';
    if (answerAreaEl) {
        answerAreaEl.innerHTML = '';
        answerAreaEl.className = 'space-y-4';
        answerAreaEl.classList.remove('disabled-options');
    }

    state.currentQuestionChancesLeft = state.currentQuizConfig.enableSecondChance ? (state.currentQuizConfig.maxChances || 1) : 0;
    state.selectedAnswerTemp = null;

    if (state.currentQuizConfig.timerMode === 'question') {
        startQuestionTimer(state.currentQuizConfig.questionTime || 30);
    } else if (state.questionTimerInterval) {
        clearInterval(state.questionTimerInterval);
        state.questionTimerInterval = null;
    }

    updateHeaderMeta(qData, state.currentQuestionIndex, totalQ);
    updateScoreAndStatsDisplay();

    if (questionTextEl) questionTextEl.textContent = qData.question;
    const questionType = (qData.type || '').toString().trim().toLowerCase();

    // Check if this question already has a recorded answer
    const savedRecord = state.userAnswers.find(a => a.originalIndex === currOrigIdx);
    const savedAnswer = savedRecord ? savedRecord.userAnswer : null;
    const isAlreadyAnswered = savedAnswer !== null && savedAnswer !== undefined && savedAnswer !== '' && savedAnswer !== 'Time Out';

    // Navigation Buttons configuration
    if (isSummaryOnly) {
        // Summary-Only Mode:
        // 1. Previous button enabled (disabled only on first question)
        if (prevQuestionBtn) {
            prevQuestionBtn.classList.remove('hidden');
            prevQuestionBtn.disabled = (state.currentQuestionIndex === 0);
            prevQuestionBtn.classList.toggle('opacity-40', state.currentQuestionIndex === 0);
            prevQuestionBtn.classList.toggle('cursor-not-allowed', state.currentQuestionIndex === 0);
        }

        // 2. Skip button is hidden (navigation replaces skip)
        skipQuestionBtn?.classList.add('hidden');

        // 3. Next button is always enabled in summary-only
        if (nextQuestionBtn) {
            nextQuestionBtn.classList.remove('hidden');
            nextQuestionBtn.disabled = false;
            nextQuestionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            if (state.currentQuestionIndex === totalQ - 1) {
                nextQuestionBtn.textContent = 'Submit Quiz';
            } else {
                nextQuestionBtn.textContent = 'Next Question';
            }
        }

        // 4. Update review unanswered button if currently reviewing
        updateUnansweredReviewBtn();

    } else {
        // Immediate Feedback Mode:
        // 1. Previous button is strictly DISABLED (prevent retroactive changes after seeing answers)
        if (prevQuestionBtn) {
            prevQuestionBtn.classList.remove('hidden');
            prevQuestionBtn.disabled = true;
            prevQuestionBtn.classList.add('opacity-40', 'cursor-not-allowed');
        }

        // 2. Skip button is available in immediate feedback mode
        skipQuestionBtn?.classList.remove('hidden');

        // 3. Next button: CANNOT advance without selecting an answer!
        if (nextQuestionBtn) {
            nextQuestionBtn.classList.remove('hidden');
            const isLastQ = state.currentQuestionIndex === totalQ - 1;
            nextQuestionBtn.textContent = isLastQ ? 'View Results' : 'Next Question';

            if (!isAlreadyAnswered) {
                // Must not allow user to go to next question when no choice is selected
                nextQuestionBtn.disabled = true;
                nextQuestionBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                nextQuestionBtn.disabled = false;
                nextQuestionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        nextUnansweredBtn?.classList.add('hidden');
    }

    // Render Answer Options based on question type
    if (questionType === 'multiple-choice' || questionType === 'true-or-false') {
        const isTrueFalse = questionType === 'true-or-false' || (Array.isArray(qData.options) && qData.options.length === 2 && qData.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())));
        const opts = getOrGenerateQuestionOptions(qData, currOrigIdx);

        const optsCont = document.createElement('div');
        optsCont.className = isTrueFalse ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4';

        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            const isSelected = savedAnswer && opt.toString().trim().toLowerCase() === savedAnswer.toString().trim().toLowerCase();
            
            btn.className = `option-btn w-full ${isTrueFalse ? 'text-center text-lg font-bold py-5' : 'text-left p-4'} rounded-lg border-2 transition-colors ${
                isSelected 
                    ? 'bg-blue-600 border-blue-400 text-white font-bold' 
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
            }`;

            btn.onclick = () => {
                if (answerAreaEl?.classList.contains('disabled-options')) return;

                if (isSummaryOnly) {
                    // In Summary-Only Mode: freely pick or swap choice, save immediately
                    optsCont.querySelectorAll('.option-btn').forEach(b => {
                        b.classList.remove('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');
                        b.classList.add('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                    });
                    btn.classList.remove('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                    btn.classList.add('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');

                    saveModernAnswer(opt);
                } else {
                    // In Immediate Feedback Mode:
                    if (state.currentQuizConfig.allowChangeSelection) {
                        state.selectedAnswerTemp = opt;
                        optsCont.querySelectorAll('.option-btn').forEach(b => {
                            b.classList.remove('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');
                            b.classList.add('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                        });
                        btn.classList.remove('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                        btn.classList.add('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');

                        // Unlocks Next button to confirm selection
                        if (nextQuestionBtn) {
                            nextQuestionBtn.disabled = false;
                            nextQuestionBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                            nextQuestionBtn.textContent = 'Confirm Answer';
                        }
                    } else {
                        checkAnswer(opt);
                    }
                }
            };

            optsCont.appendChild(btn);
        });

        answerAreaEl?.appendChild(optsCont);

    } else if (questionType === 'identification') {
        const initialVal = savedAnswer || '';
        answerAreaEl.innerHTML = `<input type="text" id="id-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" value="${initialVal}" placeholder="Type your answer...">` +
            (!isSummaryOnly && !state.currentQuizConfig.allowChangeSelection ? `<button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>` : '');
        
        const idIn = document.getElementById('id-ans');
        const sBtn = document.getElementById('submit-btn');

        if (isSummaryOnly) {
            idIn.addEventListener('input', () => {
                const val = idIn.value.trim();
                if (val.length > 0) {
                    saveModernAnswer(val);
                } else {
                    clearModernAnswer();
                }
            });
        } else {
            if (state.currentQuizConfig.allowChangeSelection) {
                idIn.addEventListener('input', () => {
                    const val = idIn.value.trim();
                    state.selectedAnswerTemp = val;
                    if (nextQuestionBtn) {
                        const hasVal = val.length > 0;
                        nextQuestionBtn.disabled = !hasVal;
                        nextQuestionBtn.classList.toggle('opacity-50', !hasVal);
                        nextQuestionBtn.classList.toggle('cursor-not-allowed', !hasVal);
                        nextQuestionBtn.textContent = 'Confirm Answer';
                    }
                });
            } else {
                if (sBtn) sBtn.onclick = () => { if (idIn.value.trim()) checkAnswer(idIn.value.trim()); };
                idIn.addEventListener('keypress', (e) => { if (e.key === 'Enter' && idIn.value.trim()) checkAnswer(idIn.value.trim()); });
            }
        }
        idIn.focus();

    } else if (questionType === 'enumeration') {
        const initialVal = Array.isArray(savedAnswer) ? savedAnswer.join('\n') : (savedAnswer || '');
        answerAreaEl.innerHTML = `<textarea id="en-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4" placeholder="List items, one per line...">${initialVal}</textarea>` +
            (!isSummaryOnly && !state.currentQuizConfig.allowChangeSelection ? `<button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>` : '');
        
        const enIn = document.getElementById('en-ans');
        const sBtn = document.getElementById('submit-btn');

        if (isSummaryOnly) {
            enIn.addEventListener('input', () => {
                const items = enIn.value.split('\n').map(s => s.trim()).filter(Boolean);
                if (items.length > 0) {
                    saveModernAnswer(items);
                } else {
                    clearModernAnswer();
                }
            });
        } else {
            if (state.currentQuizConfig.allowChangeSelection) {
                enIn.addEventListener('input', () => {
                    const items = enIn.value.split('\n').map(s => s.trim()).filter(Boolean);
                    state.selectedAnswerTemp = items;
                    if (nextQuestionBtn) {
                        const hasItems = items.length > 0;
                        nextQuestionBtn.disabled = !hasItems;
                        nextQuestionBtn.classList.toggle('opacity-50', !hasItems);
                        nextQuestionBtn.classList.toggle('cursor-not-allowed', !hasItems);
                        nextQuestionBtn.textContent = 'Confirm Answer';
                    }
                });
            } else {
                if (sBtn) sBtn.onclick = () => {
                    const items = enIn.value.split('\n').map(s => s.trim()).filter(Boolean);
                    if (items.length > 0) checkAnswer(items);
                };
                enIn.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                        e.preventDefault();
                        const items = enIn.value.split('\n').map(s => s.trim()).filter(Boolean);
                        if (items.length > 0) checkAnswer(items);
                    }
                });
            }
        }
        enIn.focus();
    }
}

function saveModernAnswer(userAnswer) {
    const currOrigIdx = state.shuffledIndices[state.currentQuestionIndex];
    const qData = state.questions[currOrigIdx];
    const isCorrect = evaluateAnswer(qData, userAnswer);

    const existingIndex = state.userAnswers.findIndex(a => a.originalIndex === currOrigIdx);
    const answerRecord = {
        question: qData.question,
        userAnswer: userAnswer,
        correctAnswer: qData.answer,
        isCorrect: isCorrect,
        originalIndex: currOrigIdx
    };

    if (existingIndex >= 0) {
        state.userAnswers[existingIndex] = answerRecord;
    } else {
        state.userAnswers.push(answerRecord);
    }
    state.answeredOriginalIndices.add(currOrigIdx);

    state.score = state.userAnswers.filter(a => a.isCorrect === true).length;

    if (state.isReviewingUnanswered) {
        updateUnansweredReviewBtn();
    }

    persistQuizProgress();
}

function clearModernAnswer() {
    const currOrigIdx = state.shuffledIndices[state.currentQuestionIndex];
    const existingIndex = state.userAnswers.findIndex(a => a.originalIndex === currOrigIdx);
    if (existingIndex >= 0) {
        state.userAnswers.splice(existingIndex, 1);
    }
    state.answeredOriginalIndices.delete(currOrigIdx);
    state.score = state.userAnswers.filter(a => a.isCorrect === true).length;

    if (state.isReviewingUnanswered) {
        updateUnansweredReviewBtn();
    }

    persistQuizProgress();
}

// ---------------------------------------------------------------------
// NAVIGATION (PREVIOUS & NEXT)
// ---------------------------------------------------------------------
export function displayPreviousQuestion() {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;

    // Previous is only operational in Modern mode when summary-only is enabled
    if (!isModern || !isSummaryOnly) return;

    if (state.currentQuestionIndex > 0) {
        state.currentQuestionIndex--;
        displayCurrentQuestion();
        persistQuizProgress();
    }
}

export function displayNextQuestion() {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;
    const totalQ = state.shuffledIndices.length;

    if (isModern) {
        if (isSummaryOnly) {
            // Modern Summary-Only Mode:
            if (state.currentQuestionIndex < totalQ - 1) {
                state.currentQuestionIndex++;
                displayCurrentQuestion();
                persistQuizProgress();
            } else {
                // On the final question, submit action triggers unanswered verification
                checkAndHandleSubmit();
            }
            return;
        } else {
            // Modern Immediate Feedback Mode:
            // If allowChangeSelection is on and user selected an answer awaiting confirmation:
            if (state.currentQuizConfig.allowChangeSelection && state.selectedAnswerTemp !== null) {
                const chosen = state.selectedAnswerTemp;
                state.selectedAnswerTemp = null;
                checkAnswer(chosen);
                return; // Let user inspect explanation and feedback before clicking Next again
            }

            // Move to next question or show results
            if (state.currentQuestionIndex < totalQ - 1) {
                state.currentQuestionIndex++;
                displayCurrentQuestion();
                persistQuizProgress();
            } else {
                showResults();
            }
            return;
        }
    }

    // -----------------------------------------------------------------
    // CLASSIC SEQUENTIAL MODE IMPLEMENTATION
    // -----------------------------------------------------------------
    if (state.currentQuizConfig && state.currentQuizConfig.allowChangeSelection && state.selectedAnswerTemp !== null) {
        const chosenAnswer = state.selectedAnswerTemp;
        state.selectedAnswerTemp = null;

        if (state.currentQuizConfig.showAnswersInSummaryOnly) {
            checkAnswer(chosenAnswer);
        } else {
            checkAnswer(chosenAnswer);
            return;
        }
    }

    nextQuestionBtn?.classList.add('hidden');
    skipQuestionBtn?.classList.add('hidden');
    prevQuestionBtn?.classList.add('hidden');
    nextUnansweredBtn?.classList.add('hidden');
    explanationAreaEl?.classList.add('hidden');
    if (explanationAreaEl) explanationAreaEl.innerHTML = '';
    if (answerAreaEl) {
        answerAreaEl.innerHTML = '';
        answerAreaEl.className = 'space-y-4';
        answerAreaEl.classList.remove('disabled-options');
    }

    state.currentQuestionChancesLeft = state.currentQuizConfig.enableSecondChance ? (state.currentQuizConfig.maxChances || 1) : 0;
    state.selectedAnswerTemp = null;

    if (state.currentQuizConfig.timerMode === 'question') {
        startQuestionTimer(state.currentQuizConfig.questionTime || 30);
    } else if (state.questionTimerInterval) {
        clearInterval(state.questionTimerInterval);
        state.questionTimerInterval = null;
    }

    let nextIdx = -1;
    let found = false;

    if (!state.inSkippedRound) {
        while (state.currentShuffledIndexPos < state.shuffledIndices.length) {
            const origIdx = state.shuffledIndices[state.currentShuffledIndexPos];
            if (!state.answeredOriginalIndices.has(origIdx) && !state.skippedOriginalIndices.has(origIdx)) {
                nextIdx = origIdx;
                found = true;
                break;
            }
            state.currentShuffledIndexPos++;
        }
        if (!found) {
            if (state.skippedOriginalIndices.size > 0) {
                state.inSkippedRound = true;
                state.currentSkippedItemIndex = 0;
                state.currentSkippedArray = Array.from(state.skippedOriginalIndices);
            } else {
                showResults();
                return;
            }
        }
    }

    if (state.inSkippedRound) {
        if (state.currentSkippedArray.length === 0 && state.skippedOriginalIndices.size > 0) {
            state.currentSkippedArray = Array.from(state.skippedOriginalIndices);
        }
        if (state.currentSkippedItemIndex < state.currentSkippedArray.length) {
            nextIdx = state.currentSkippedArray[state.currentSkippedItemIndex];
            if (state.answeredOriginalIndices.has(nextIdx)) {
                state.currentSkippedItemIndex++;
                displayNextQuestion();
                return;
            }
            found = true;
        } else {
            showResults();
            return;
        }
    }

    if (!found || nextIdx === -1) {
        console.error('Failed to find next question index.');
        showResults();
        return;
    }

    const qData = state.questions[nextIdx];
    updateHeaderMeta(qData, state.answeredOriginalIndices.size, state.questions.length);
    updateScoreAndStatsDisplay();

    if (questionTextEl) questionTextEl.textContent = qData.question;
    const questionType = (qData.type || '').toString().trim().toLowerCase();

    if (!state.inSkippedRound) {
        skipQuestionBtn?.classList.remove('hidden');
    }

    if (qData.type === 'multiple-choice' || qData.type === 'true-or-false') {
        const isTrueFalse = qData.type === 'true-or-false' || (Array.isArray(qData.options) && qData.options.length === 2 && qData.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())));
        const opts = getOrGenerateQuestionOptions(qData, nextIdx);
        const optsCont = document.createElement('div');
        optsCont.className = isTrueFalse ? 'grid grid-cols-2 gap-4' : 'grid grid-cols-1 md:grid-cols-2 gap-4';
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.className = `option-btn w-full ${isTrueFalse ? 'text-center text-lg font-bold py-5' : 'text-left p-4'} bg-gray-700 rounded-lg border-2 border-gray-600 text-gray-300 hover:bg-gray-600 transition-colors`;
            
            btn.onclick = () => {
                if (answerAreaEl?.classList.contains('disabled-options')) return;
                
                if (state.currentQuizConfig && state.currentQuizConfig.allowChangeSelection) {
                    state.selectedAnswerTemp = opt;
                    optsCont.querySelectorAll('.option-btn').forEach(b => {
                        b.classList.remove('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');
                        b.classList.add('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                    });
                    btn.classList.remove('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                    btn.classList.add('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');
                    
                    skipQuestionBtn?.classList.add('hidden');
                    nextQuestionBtn?.classList.remove('hidden');
                } else {
                    checkAnswer(opt);
                }
            };
            optsCont.appendChild(btn);
        });
        answerAreaEl?.appendChild(optsCont);
    } else if (questionType === 'identification') {
        answerAreaEl.innerHTML = `<input type="text" id="id-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const idIn = document.getElementById('id-ans');
        const sBtn = document.getElementById('submit-btn');

        if (state.currentQuizConfig && state.currentQuizConfig.allowChangeSelection) {
            sBtn?.classList.add('hidden');
            nextQuestionBtn?.classList.remove('hidden');
            idIn.addEventListener('input', () => { state.selectedAnswerTemp = idIn.value; });
        } else {
            if (sBtn) sBtn.onclick = () => { checkAnswer(idIn.value); };
            idIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(e.target.value); });
        }
        idIn.focus();
    } else if (questionType === 'enumeration') {
        answerAreaEl.innerHTML = `<textarea id="en-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4" placeholder="List items, one per line..."></textarea><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const enIn = document.getElementById('en-ans');
        const sBtn = document.getElementById('submit-btn');

        if (state.currentQuizConfig && state.currentQuizConfig.allowChangeSelection) {
            sBtn?.classList.add('hidden');
            nextQuestionBtn?.classList.remove('hidden');
            enIn.addEventListener('input', () => { state.selectedAnswerTemp = enIn.value.split('\n').map(s => s.trim()).filter(Boolean); });
        } else {
            if (sBtn) sBtn.onclick = () => { checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); };
            enIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); } });
        }
        enIn.focus();
    }
}

export function skipQuestion() {
    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    if (isModern) {
        // Modern Mode: Skip marks question as unanswered and advances to next
        if (state.currentQuestionIndex < state.shuffledIndices.length - 1) {
            state.currentQuestionIndex++;
            displayCurrentQuestion();
            persistQuizProgress();
        } else {
            showResults();
        }
        return;
    }

    if (state.inSkippedRound) return;
    const origIdxToSkip = state.shuffledIndices[state.currentShuffledIndexPos];
    state.skippedOriginalIndices.add(origIdxToSkip);
    state.answeredOriginalIndices.delete(origIdxToSkip);
    state.currentShuffledIndexPos++;
    persistQuizProgress();
    displayNextQuestion();
}

export function revealAnswer() {
    if (!state.selectedAnswerTemp && state.selectedAnswerTemp !== "") {
        showToast("Please provide or pick an answer first!", 2000, "warning");
        return;
    }
    revealAnswerBtn?.classList.add('hidden');
    checkAnswer(state.selectedAnswerTemp);
}

export function checkAnswer(userAnswer) {
    if (answerAreaEl?.classList.contains('disabled-options')) return;

    const isModern = state.currentQuizConfig?.uiMode !== 'classic';
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;

    let currOrigIdx = isModern 
        ? state.shuffledIndices[state.currentQuestionIndex]
        : (state.inSkippedRound 
            ? state.currentSkippedArray[state.currentSkippedItemIndex] 
            : state.shuffledIndices[state.currentShuffledIndexPos]);
        
    const qData = state.questions[currOrigIdx];
    const isCorrect = evaluateAnswer(qData, userAnswer);

    const isManualReveal = state.currentQuizConfig && state.currentQuizConfig.manualReveal;

    // Second chance check
    if (!isCorrect && state.currentQuizConfig.enableSecondChance && state.currentQuestionChancesLeft > 0 && !isManualReveal && userAnswer !== "Time Out") {
        state.currentQuestionChancesLeft--;
        // FIXED: Sound effects muted when showAnswersInSummaryOnly is enabled
        if (!isSummaryOnly && state.incorrectSound) {
            try { state.incorrectSound.triggerAttackRelease('A2', '8n', Tone.now()); } catch (e) {}
        }
        showToast(`Incorrect response! Attempts remaining: ${state.currentQuestionChancesLeft + 1}`, 3000, 'warning');

        if (qData.type === 'multiple-choice' || qData.type === 'true-or-false') {
            document.querySelectorAll('.option-btn').forEach(btn => {
                if (btn.textContent.trim().toLowerCase() === (userAnswer || '').toString().trim().toLowerCase()) {
                    btn.classList.add('incorrect');
                    btn.style.pointerEvents = 'none';
                }
            });
        } else {
            const txtInput = document.getElementById('id-ans') || document.getElementById('en-ans');
            if (txtInput) {
                txtInput.classList.add('incorrect');
                setTimeout(() => txtInput.classList.remove('incorrect'), 1500);
            }
        }
        return; 
    }

    if (state.questionTimerInterval) {
        clearInterval(state.questionTimerInterval);
        state.questionTimerInterval = null;
    }

    answerAreaEl?.classList.add('disabled-options');
    skipQuestionBtn?.classList.add('hidden');

    if (isManualReveal) {
        if (qData.type === 'multiple-choice' || qData.type === 'true-or-false') {
            document.querySelectorAll('.option-btn').forEach(btn => {
                if (btn.textContent.trim().toLowerCase() === (userAnswer || '').toString().trim().toLowerCase()) {
                    btn.classList.remove('bg-gray-700', 'border-gray-600', 'text-gray-300', 'hover:bg-gray-600');
                    btn.classList.add('bg-blue-600', 'border-blue-400', 'text-white', 'font-bold');
                }
            });
        } else {
            const txtInput = document.getElementById('id-ans') || document.getElementById('en-ans');
            if (txtInput) {
                txtInput.classList.remove('bg-gray-700', 'border-gray-600');
                txtInput.classList.add('border-blue-500', 'bg-blue-600/20', 'text-blue-400', 'font-semibold');
            }
        }
    } else {
        if (!isSummaryOnly) {
            if (qData.type === 'multiple-choice' || qData.type === 'true-or-false') {
                const selAns = (userAnswer || '').toString().trim().toLowerCase();
                document.querySelectorAll('.option-btn').forEach(btn => {
                    const btnTxt = btn.textContent.trim().toLowerCase();
                    if (btnTxt === (qData.answer || '').toString().trim().toLowerCase()) btn.classList.add('correct');
                    else if (btnTxt === selAns) btn.classList.add('incorrect');
                });
            } else {
                const txtInput = document.getElementById('id-ans') || document.getElementById('en-ans');
                if (txtInput) txtInput.classList.add(isCorrect ? 'correct' : 'incorrect');
            }

            // FIXED: Only trigger audio feedback if showAnswersInSummaryOnly is NOT enabled
            if (isCorrect) {
                if (state.correctSound) {
                    try { state.correctSound.triggerAttackRelease('C4', '8n', Tone.now()); } catch (e) {}
                }
            } else {
                if (state.incorrectSound) {
                    try { state.incorrectSound.triggerAttackRelease('A2', '8n', Tone.now()); } catch (e) {}
                }
            }
        }
    }

    // Record user answer
    const existingIndex = state.userAnswers.findIndex(a => a.originalIndex === currOrigIdx);
    const answerRecord = { question: qData.question, userAnswer, correctAnswer: qData.answer, isCorrect, originalIndex: currOrigIdx };
    if (existingIndex >= 0) {
        state.userAnswers[existingIndex] = answerRecord;
    } else {
        state.userAnswers.push(answerRecord);
    }
    state.answeredOriginalIndices.add(currOrigIdx);

    if (isCorrect) {
        state.score = state.userAnswers.filter(a => a.isCorrect === true).length;
    } else {
        if (state.isAttemptLimited && !isManualReveal && !isSummaryOnly) {
            state.currentAttempts++;
            updateAttemptDisplay();
            if (state.currentAttempts >= state.maxAttempts) {
                showToast(`Attempts Exceeded! (${state.maxAttempts})`, 3000, 'error');
                if (state.quizTimerInterval) stopQuizTimer();
                setTimeout(() => { showResults(); }, 1500);
                return;
            }
        }
    }

    if (!isModern) {
        if (state.inSkippedRound) {
            state.skippedOriginalIndices.delete(currOrigIdx);
            state.currentSkippedItemIndex++;
        } else {
            state.skippedOriginalIndices.delete(currOrigIdx);
            state.currentShuffledIndexPos++;
        }
    }

    updateScoreAndStatsDisplay();

    // In immediate feedback mode, display explanation and unlock Next button
    if (!isSummaryOnly) {
        displayExplanation(qData, isCorrect);
        if (nextQuestionBtn) {
            nextQuestionBtn.disabled = false;
            nextQuestionBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'hidden');
            const isLastQ = isModern 
                ? (state.currentQuestionIndex === state.shuffledIndices.length - 1)
                : (state.currentShuffledIndexPos >= state.shuffledIndices.length && state.skippedOriginalIndices.size === 0);
            nextQuestionBtn.textContent = isLastQ ? 'View Results' : 'Next Question';
        }
    } else {
        if (isModern) {
            if (state.isReviewingUnanswered) {
                updateUnansweredReviewBtn();
            }
        } else {
            if (!state.currentQuizConfig?.allowChangeSelection) {
                setTimeout(() => {
                    displayNextQuestion();
                }, 300);
            } else {
                displayNextQuestion();
            }
        }
    }

    persistQuizProgress();
}