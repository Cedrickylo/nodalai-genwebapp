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
    restartQuizBtn,
    progressEl,
    scoreEl,
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
    resumeQuizBtn
} = elements;

export function startQuiz() {
    state.score = 0;
    state.userAnswers = [];
    state.currentShuffledIndexPos = 0;
    state.answeredOriginalIndices.clear();
    state.skippedOriginalIndices.clear();
    state.currentSkippedItemIndex = 0;
    state.inSkippedRound = false;
    state.currentSkippedArray = [];
    state.currentAttempts = 0;

    // Shuffle Gate Configuration
    const shouldShuffle = state.currentQuizConfig.randomizeQuestions !== false;
    const shuffled = Array.from(Array(state.questions.length).keys());
    if (shouldShuffle) {
        shuffled.sort(() => Math.random() - 0.5);
    }
    state.shuffledIndices = shuffled;

    saveInProgressQuiz({
        key: state.currentQuizKey,
        questions: state.questions,
        config: state.currentQuizConfig,
        fileName: state.currentFileName,
        shuffledIndexPos: 0,
        answeredIndices: [],
        skippedIndices: [],
        skippedIndexPos: 0,
        inSkippedRound: false,
        score: 0,
        answers: [],
        shuffledIndices: shuffled,
        timeRemaining: state.totalQuizTime,
        currentAttempts: 0
    });

    showView('quiz');
    updateAttemptDisplay();
    displayNextQuestion();
    
    if (state.isTimedQuiz && state.currentQuizConfig.timerMode !== 'question') {
        startQuizTimer(state.totalQuizTime);
    } else {
        stopQuizTimer();
    }
}

export function startQuizTimer(startTime) {
    timerDisplayEl.classList.remove('hidden', 'text-red-400');
    visualTimerContainer.classList.remove('hidden');
    visualTimerBar.style.width = '100%';
    visualTimerBar.classList.remove('bg-red-500');
    visualTimerBar.classList.add('bg-blue-500');
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
    timerDisplayEl.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    const perc = state.totalQuizTime > 0 ? Math.max(0, (state.timeRemaining / state.totalQuizTime) * 100) : 0;
    visualTimerBar.style.width = `${perc}%`;
    const isWarn = state.timeRemaining <= 60 && state.totalQuizTime > 60;
    timerDisplayEl.classList.toggle('text-red-400', isWarn);
    visualTimerBar.classList.toggle('bg-red-500', isWarn);
    visualTimerBar.classList.toggle('bg-blue-500', !isWarn);
}

export function stopQuizTimer() {
    if (state.quizTimerInterval) clearInterval(state.quizTimerInterval);
    state.quizTimerInterval = null;
    if (state.currentQuizConfig && state.currentQuizConfig.timerMode === 'question') return;
    timerDisplayEl.classList.add('hidden');
    timerDisplayEl.classList.remove('text-red-400');
    timerDisplayEl.textContent = '';
    visualTimerContainer.classList.add('hidden');
    visualTimerBar.style.width = '100%';
    visualTimerBar.classList.remove('bg-red-500');
    visualTimerBar.classList.add('bg-blue-500');
}

export function startQuestionTimer(startTime) {
    timerDisplayEl.classList.remove('hidden', 'text-red-400');
    visualTimerContainer.classList.remove('hidden');
    visualTimerBar.style.width = '100%';
    visualTimerBar.classList.remove('bg-red-500');
    visualTimerBar.classList.add('bg-blue-500');
    state.currentQuestionTimeRemaining = startTime;
    timerDisplayEl.textContent = `0:${state.currentQuestionTimeRemaining < 10 ? '0' : ''}${state.currentQuestionTimeRemaining}`;
    
    if (state.questionTimerInterval) clearInterval(state.questionTimerInterval);
    state.questionTimerInterval = setInterval(() => {
        state.currentQuestionTimeRemaining--;
        const secs = state.currentQuestionTimeRemaining;
        timerDisplayEl.textContent = `0:${secs < 10 ? '0' : ''}${secs}`;
        const perc = startTime > 0 ? Math.max(0, (secs / startTime) * 100) : 0;
        visualTimerBar.style.width = `${perc}%`;
        const isWarn = secs <= 5;
        timerDisplayEl.classList.toggle('text-red-400', isWarn);
        visualTimerBar.classList.toggle('bg-red-500', isWarn);
        visualTimerBar.classList.toggle('bg-blue-500', !isWarn);

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
    answerAreaEl.classList.add('disabled-options');
    nextQuestionBtn.classList.add('hidden');
    skipQuestionBtn.classList.add('hidden');
    setTimeout(() => { showResults(); }, 1500);
}

export function displayNextQuestion() {
    // DOUBLE ACTION STEP INTERCEPTION: If answer-swapping is active, commit selection right now
    if (state.currentQuizConfig && state.currentQuizConfig.manualReveal && state.currentQuizConfig.allowChangeSelection && state.selectedAnswerTemp !== null) {
        let currOrigIdx = state.inSkippedRound 
            ? state.currentSkippedArray[state.currentSkippedItemIndex] 
            : state.shuffledIndices[state.currentShuffledIndexPos];
            
        const qData = state.questions[currOrigIdx];
        const userAnswer = state.selectedAnswerTemp;
        state.selectedAnswerTemp = null; // Flush active temp focus channel
        
        let isCorrect = false;
        if (qData.type === 'multiple-choice') {
            const selAns = (userAnswer || '').toString().trim().toLowerCase();
            isCorrect = selAns === (qData.answer || '').toString().trim().toLowerCase();
        } else if (qData.type === 'identification') {
            isCorrect = (userAnswer || '').toString().trim().toLowerCase() === (qData.answer || '').toString().trim().toLowerCase();
        } else if (qData.type === 'enumeration') {
            let rawAnswer = qData.answer || [];
            if (typeof rawAnswer === 'string') rawAnswer = rawAnswer.split(/[,|\n]/);
            else if (!Array.isArray(rawAnswer)) rawAnswer = [rawAnswer];
            const correctItems = rawAnswer.map(s => (s || '').toString().trim().toLowerCase()).sort();
            const userItems = (userAnswer || []).map(s => (s || '').toString().trim().toLowerCase()).sort();
            isCorrect = correctItems.length === userItems.length && correctItems.every((it, i) => it === userItems[i]);
        }

        if (isCorrect) {
            state.score++;
        }

        state.userAnswers.push({ question: qData.question, userAnswer, correctAnswer: qData.answer, isCorrect, originalIndex: currOrigIdx });
        state.answeredOriginalIndices.add(currOrigIdx);
        
        if (state.inSkippedRound) {
            state.skippedOriginalIndices.delete(currOrigIdx);
            state.currentSkippedItemIndex++;
        } else {
            state.skippedOriginalIndices.delete(currOrigIdx);
            state.currentShuffledIndexPos++;
        }

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

    nextQuestionBtn.classList.add('hidden');
    skipQuestionBtn.classList.add('hidden');
    explanationAreaEl.classList.add('hidden');
    explanationAreaEl.innerHTML = '';
    answerAreaEl.innerHTML = '';
    answerAreaEl.className = 'space-y-4';
    answerAreaEl.classList.remove('disabled-options');

    state.currentQuestionChancesLeft = state.currentQuizConfig.enableSecondChance ? (state.currentQuizConfig.maxChances || 1) : 0;
    state.selectedAnswerTemp = null;

    if (state.currentQuizConfig.timerMode === 'question') {
        startQuestionTimer(state.currentQuizConfig.questionTime || 30);
    } else {
        if (state.questionTimerInterval) {
            clearInterval(state.questionTimerInterval);
            state.questionTimerInterval = null;
        }
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
    
    if (state.inSkippedRound) {
        progressEl.innerHTML = `<span class="text-yellow-400 font-bold tracking-wide animate-pulse">Skipped Qs: ${state.currentSkippedItemIndex + 1} / ${state.currentSkippedArray.length}</span>`;
    } else {
        progressEl.textContent = `Q ${state.answeredOriginalIndices.size + state.skippedOriginalIndices.size + 1}/${state.questions.length}`;
    }
    
    if (state.currentQuizConfig.showAnswersInSummaryOnly) {
        scoreEl.textContent = `Score: Hidden`;
    } else {
        scoreEl.textContent = `Score: ${state.score}`;
    }
    
    questionTextEl.textContent = qData.question;
    const questionType = (qData.type || '').toString().trim().toLowerCase();

    if (!state.inSkippedRound) {
        skipQuestionBtn.classList.remove('hidden');
    }

    if (qData.type === 'multiple-choice') {
        const shuffleChoices = state.currentQuizConfig.randomizeChoices !== false;
        const opts = qData.options ? (shuffleChoices ? [...qData.options].sort(() => Math.random() - 0.5) : [...qData.options]) : [];
        const optsCont = document.createElement('div');
        optsCont.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.className = 'option-btn w-full text-left p-4 bg-gray-700 rounded-lg border-2 border-gray-600 hover:bg-gray-600 transition-colors';
            
            btn.onclick = () => {
                if (answerAreaEl.classList.contains('disabled-options')) return;
                
                // NON-LOCKING CHOICE HIGHLIGHT INTERCEPTION
                if (state.currentQuizConfig.manualReveal && state.currentQuizConfig.allowChangeSelection) {
                    state.selectedAnswerTemp = opt;
                    optsCont.querySelectorAll('.option-btn').forEach(b => {
                        b.classList.remove('border-blue-500', 'bg-blue-600/20');
                    });
                    btn.classList.add('border-blue-500', 'bg-blue-600/20');
                    skipQuestionBtn.classList.add('hidden');
                    nextQuestionBtn.classList.remove('hidden');
                } else {
                    checkAnswer(opt);
                }
            };
            optsCont.appendChild(btn);
        });
        answerAreaEl.appendChild(optsCont);
    } else if (questionType === 'identification') {
        answerAreaEl.innerHTML = `<input type="text" id="id-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const idIn = document.getElementById('id-ans');
        const sBtn = document.getElementById('submit-btn');

        if (state.currentQuizConfig.manualReveal && state.currentQuizConfig.allowChangeSelection) {
            sBtn.classList.add('hidden');
            nextQuestionBtn.classList.remove('hidden');
            idIn.addEventListener('input', () => { state.selectedAnswerTemp = idIn.value; });
        } else {
            sBtn.onclick = () => { checkAnswer(idIn.value); };
            idIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(e.target.value); });
        }
        idIn.focus();
    } else if (questionType === 'enumeration') {
        answerAreaEl.innerHTML = `<textarea id="en-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4" placeholder="List items, one per line..."></textarea><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const enIn = document.getElementById('en-ans');
        const sBtn = document.getElementById('submit-btn');

        if (state.currentQuizConfig.manualReveal && state.currentQuizConfig.allowChangeSelection) {
            sBtn.classList.add('hidden');
            nextQuestionBtn.classList.remove('hidden');
            enIn.addEventListener('input', () => { state.selectedAnswerTemp = enIn.value.split('\n').map(s => s.trim()).filter(Boolean); });
        } else {
            sBtn.onclick = () => { checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); };
            enIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); } });
        }
        enIn.focus();
    }
}

export function skipQuestion() {
    if (state.inSkippedRound) return;
    const origIdxToSkip = state.shuffledIndices[state.currentShuffledIndexPos];
    state.skippedOriginalIndices.add(origIdxToSkip);
    state.answeredOriginalIndices.delete(origIdxToSkip);
    state.currentShuffledIndexPos++;
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
    displayNextQuestion();
}

export function revealAnswer() {
    if (!state.selectedAnswerTemp && state.selectedAnswerTemp !== "") {
        showToast("Please provide or pick an answer first!", 2000, "warning");
        return;
    }
    if (elements.revealAnswerBtn) elements.revealAnswerBtn.classList.add('hidden');
    checkAnswer(state.selectedAnswerTemp);
}

export function checkAnswer(userAnswer) {
    if (answerAreaEl.classList.contains('disabled-options')) return;

    let currOrigIdx = state.inSkippedRound 
        ? state.currentSkippedArray[state.currentSkippedItemIndex] 
        : state.shuffledIndices[state.currentShuffledIndexPos];
        
    const qData = state.questions[currOrigIdx];
    let isCorrect = false;

    if (qData.type === 'multiple-choice') {
        const selAns = (userAnswer || '').toString().trim().toLowerCase();
        isCorrect = selAns === (qData.answer || '').toString().trim().toLowerCase();
    } else if (qData.type === 'identification') {
        isCorrect = (userAnswer || '').toString().trim().toLowerCase() === (qData.answer || '').toString().trim().toLowerCase();
    } else if (qData.type === 'enumeration') {
        let rawAnswer = qData.answer || [];
        if (typeof rawAnswer === 'string') rawAnswer = rawAnswer.split(/[,|\n]/);
        else if (!Array.isArray(rawAnswer)) rawAnswer = [rawAnswer];
        const correctItems = rawAnswer.map(s => (s || '').toString().trim().toLowerCase()).sort();
        const userItems = (userAnswer || []).map(s => (s || '').toString().trim().toLowerCase()).sort();
        isCorrect = correctItems.length === userItems.length && correctItems.every((it, i) => it === userItems[i]);
    }

    const isManualReveal = state.currentQuizConfig && state.currentQuizConfig.manualReveal;

    if (!isCorrect && state.currentQuizConfig.enableSecondChance && state.currentQuestionChancesLeft > 0 && !isManualReveal && userAnswer !== "Time Out") {
        state.currentQuestionChancesLeft--;
        if (state.incorrectSound) {
            try { state.incorrectSound.triggerAttackRelease('A2', '8n', Tone.now()); } catch (e) {}
        }
        showToast(`Incorrect response! Attempts remaining: ${state.currentQuestionChancesLeft + 1}`, 3000, 'warning');

        if (qData.type === 'multiple-choice') {
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

    answerAreaEl.classList.add('disabled-options');
    skipQuestionBtn.classList.add('hidden');

    if (isManualReveal) {
        if (qData.type === 'multiple-choice') {
            document.querySelectorAll('.option-btn').forEach(btn => {
                if (btn.textContent.trim().toLowerCase() === (userAnswer || '').toString().trim().toLowerCase()) {
                    btn.classList.add('border-blue-500', 'bg-blue-600/20');
                }
            });
        } else {
            const txtInput = document.getElementById('id-ans') || document.getElementById('en-ans');
            if (txtInput) txtInput.classList.add('border-blue-500', 'bg-blue-600/10');
        }
    } else {
        if (qData.type === 'multiple-choice') {
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

    if (isCorrect) {
        state.score++;
    } else {
        if (state.isAttemptLimited && !isManualReveal) {
            state.currentAttempts++;
            updateAttemptDisplay();
            if (state.currentAttempts >= state.maxAttempts) {
                showToast(`Attempts Exceeded! (${state.maxAttempts})`, 3000, 'error');
                if (state.quizTimerInterval) stopQuizTimer();
                state.answeredOriginalIndices.add(currOrigIdx);
                state.userAnswers.push({ question: qData.question, userAnswer, correctAnswer: qData.answer, isCorrect: false, originalIndex: currOrigIdx });
                setTimeout(() => { showResults(); }, 1500);
                return;
            }
        }
    }

    state.userAnswers.push({ question: qData.question, userAnswer, correctAnswer: qData.answer, isCorrect, originalIndex: currOrigIdx });
    state.answeredOriginalIndices.add(currOrigIdx);
    
    if (state.inSkippedRound) {
        state.skippedOriginalIndices.delete(currOrigIdx);
        state.currentSkippedItemIndex++;
    } else {
        state.skippedOriginalIndices.delete(currOrigIdx);
        state.currentShuffledIndexPos++;
    }

    if (state.currentQuizConfig.showAnswersInSummaryOnly) {
        scoreEl.textContent = `Score: Hidden`;
    } else {
        scoreEl.textContent = `Score: ${state.score}`;
    }

    displayExplanation(qData, isCorrect);
}