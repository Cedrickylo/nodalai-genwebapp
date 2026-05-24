import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    saveInProgressQuiz,
    clearInProgressQuiz
} from '../helpers.js';
//  FIX: Added browser-compatible ES Module import here
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
    const shuffled = Array.from(Array(state.questions.length).keys()).sort(() => Math.random() - 0.5);
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
    if (state.isTimedQuiz) {
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
    timerDisplayEl.classList.add('hidden');
    timerDisplayEl.classList.remove('text-red-400');
    timerDisplayEl.textContent = '';
    visualTimerContainer.classList.add('hidden');
    visualTimerBar.style.width = '100%';
    visualTimerBar.classList.remove('bg-red-500');
    visualTimerBar.classList.add('bg-blue-500');
}

export function updateAttemptDisplay() {
    if (!attemptDisplayEl) return;
    if (state.isAttemptLimited) {
        attemptDisplayEl.classList.remove('hidden');
        attemptDisplayEl.textContent = `Attempts: ${state.currentAttempts}/${state.maxAttempts}`;
    } else {
        attemptDisplayEl.classList.add('hidden');
        attemptDisplayEl.textContent = '';
    }
}

export function handleTimeUp() {
    stopQuizTimer();
    showToast("Time's Up!", 3000, 'error');
    answerAreaEl.classList.add('disabled-options');
    nextQuestionBtn.classList.add('hidden');
    skipQuestionBtn.classList.add('hidden');
    setTimeout(() => {
        //  FIX: Removed inline require
        showResults();
    }, 1500);
}

export function displayNextQuestion() {
    nextQuestionBtn.classList.add('hidden');
    skipQuestionBtn.classList.add('hidden');
    explanationAreaEl.classList.add('hidden');
    explanationAreaEl.innerHTML = '';
    answerAreaEl.innerHTML = '';
    answerAreaEl.className = 'space-y-4';
    answerAreaEl.classList.remove('disabled-options');

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
                //  FIX: Removed inline require
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
            //  FIX: Removed inline require
            showResults();
            return;
        }
    }

    if (!found || nextIdx === -1) {
        console.error('Failed to find next question index.');
        //  FIX: Removed inline require
        showResults();
        return;
    }

    const qData = state.questions[nextIdx];
    progressEl.textContent = `Q ${state.answeredOriginalIndices.size + state.skippedOriginalIndices.size + 1}/${state.questions.length}`;
    scoreEl.textContent = `Score: ${state.score}`;
    questionTextEl.textContent = qData.question;

    const questionType = (qData.type || '').toString().trim().toLowerCase();
    if (!['multiple-choice', 'identification', 'enumeration'].includes(questionType)) {
        console.error("AI generated an invalid question type:", questionType);
    }

    if (!state.inSkippedRound) {
        skipQuestionBtn.classList.remove('hidden');
    }

    if (qData.type === 'multiple-choice') {
        const opts = qData.options ? [...qData.options].sort(() => Math.random() - 0.5) : [];
        const optsCont = document.createElement('div');
        optsCont.className = 'grid grid-cols-1 md:grid-cols-2 gap-4';
        opts.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt;
            btn.className = 'option-btn w-full text-left p-4 bg-gray-700 rounded-lg border-2 border-gray-600 hover:bg-gray-600 transition-colors';
            btn.onclick = () => checkAnswer(opt);
            optsCont.appendChild(btn);
        });
        answerAreaEl.appendChild(optsCont);
    } else if (questionType === 'identification') {
        answerAreaEl.innerHTML = `<input type="text" id="id-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const idIn = document.getElementById('id-ans');
        document.getElementById('submit-btn').onclick = () => { checkAnswer(idIn.value); };
        idIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(e.target.value); });
        idIn.focus();
    } else if (questionType === 'enumeration') {
        answerAreaEl.innerHTML = `<textarea id="en-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4" placeholder="List items, one per line..."></textarea><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const enIn = document.getElementById('en-ans');
        document.getElementById('submit-btn').onclick = () => { checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); };
        enIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); } });
        enIn.focus();
    } else {
        answerAreaEl.innerHTML = `
            <div class="text-red-400 bg-red-900/20 border border-red-500 rounded-lg p-4">
                Unknown question type: ${qData.type}
            </div>
        `;
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

export function checkAnswer(userAnswer) {
    if (answerAreaEl.classList.contains('disabled-options')) return;
    answerAreaEl.classList.add('disabled-options');
    let currOrigIdx;
    if (state.inSkippedRound) {
        currOrigIdx = state.currentSkippedArray[state.currentSkippedItemIndex];
    } else {
        currOrigIdx = state.shuffledIndices[state.currentShuffledIndexPos];
    }
    const qData = state.questions[currOrigIdx];
    let isCorrect = false;

    if (qData.type === 'multiple-choice') {
        const selAns = (userAnswer || '').toString().trim().toLowerCase();
        isCorrect = selAns === (qData.answer || '').toString().trim().toLowerCase();
        document.querySelectorAll('.option-btn').forEach(btn => {
            const btnTxt = btn.textContent.trim().toLowerCase();
            if (btnTxt === (qData.answer || '').toString().trim().toLowerCase()) btn.classList.add('correct');
            else if (btnTxt === selAns) btn.classList.add('incorrect');
        });
    } else if (qData.type === 'identification') {
        isCorrect = (userAnswer || '').toString().trim().toLowerCase() === (qData.answer || '').toString().trim().toLowerCase();
        const idIn = document.getElementById('id-ans');
        if (idIn) idIn.classList.add(isCorrect ? 'correct' : 'incorrect');
    } else if (qData.type === 'enumeration') {
        const correctItems = (qData.answer || []).map(s => (s || '').toString().trim().toLowerCase()).sort();
        const userItems = (userAnswer || []).map(s => (s || '').toString().trim().toLowerCase()).sort();
        isCorrect = correctItems.length === userItems.length && correctItems.every((it, i) => it === userItems[i]);
        const enIn = document.getElementById('en-ans');
        if (enIn) enIn.classList.add(isCorrect ? 'correct' : 'incorrect');
    }

    if (!isCorrect) {
        if (state.isAttemptLimited) {
            state.currentAttempts++;
            updateAttemptDisplay();
            if (state.currentAttempts >= state.maxAttempts) {
                showToast(`Attempts Exceeded! (${state.maxAttempts})`, 3000, 'error');
                if (state.quizTimerInterval) stopQuizTimer();
                state.answeredOriginalIndices.add(currOrigIdx);
                state.userAnswers.push({ question: qData.question, userAnswer, correctAnswer: qData.answer, isCorrect: false, originalIndex: currOrigIdx });
                saveInProgressQuiz({
                    key: state.currentQuizKey,
                    questions: state.questions,
                    config: state.currentQuizConfig,
                    fileName: state.currentFileName,
                    shuffledIndexPos: state.currentShuffledIndexPos + 1,
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
                setTimeout(() => {
                    //  FIX: Removed inline require
                    showResults();
                }, 1500);
                return;
            }
        }
    } else {
        state.score++;
        if (state.correctSound) {
            try { state.correctSound.triggerAttackRelease('C4', '8n', Tone.now()); } catch (e) {}
        }
    }

    if (!isCorrect) {
        if (state.incorrectSound) {
            try { state.incorrectSound.triggerAttackRelease('A2', '8n', Tone.now()); } catch (e) {}
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
    scoreEl.textContent = `Score: ${state.score}`;
    
    //  FIX: Removed inline require and called the imported function directly
    displayExplanation(qData, isCorrect);
}