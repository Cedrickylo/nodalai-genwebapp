import { elements, state, constants } from './state.js';
import {
    showToast,
    showView,
    saveInProgressQuiz,
    clearInProgressQuiz,
    saveQuizToDB,
    refreshHistory,
    formatTime,
    getCustomizeState,
    hasUnsavedChanges,
    setupCustomizeView,
    handleTimeToggle,
    handleTimePresetChange,
    handleAttemptToggle,
    validateAllInputs,
    handleDifficultyChange,
    handleCustomTypeChange,
    clearHistory
} from './helpers.js';

const {
    fileUploadInput,
    importQuizInput,
    fileNameDisplay,
    generateQuizBtn,
    statusMessage,
    loadingMessage,
    loadingTitle,
    questionCountInput,
    difficultyRadios,
    customOptionsDiv,
    customQuestionTypeSelect,
    customTypeGroup,
    customMixedCountsDiv,
    customCountInputs,
    customTotalFeedback,
    timeLimitToggle,
    timeLimitOptions,
    timePresetRadios,
    customTimeInputContainer,
    customTimeLimitInput,
    timerDisplayEl,
    visualTimerContainer,
    visualTimerBar,
    attemptLimitToggle,
    attemptLimitOptions,
    attemptLimitInput,
    attemptDisplayEl,
    summaryOnlyToggle,
    nextQuestionBtn,
    skipQuestionBtn,
    restartQuizBtn,
    exportQuizBtn,
    homeBtn,
    saveQuizBtn,
    progressEl,
    scoreEl,
    questionTextEl,
    answerAreaEl,
    explanationAreaEl,
    historyList,
    clearHistoryBtn,
    syncCloudBtn,
    resumeQuizBtn,
    resultsActions,
    cancelCustomizeBtn,
    createRemedialBtn,
    remedialOptionsView,
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

const { MAX_GENERATION_ATTEMPTS, IN_PROGRESS_QUIZ_KEY } = constants;

export async function handleFileSelect(event) {
    if (state.isCustomizingHistory) resetStartViewUI();
    const files = Array.from(event.target.files || []);
    if (!files.length) {
        resetApp();
        return;
    }

    statusMessage.textContent = `Analyzing ${files.length} document(s)...`;
    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    state.fileContent = '';
    state.fileHash = '';
    validateAllInputs();

    try {
        let combinedText = '';
        for (const file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            let txt = '';
            if (['txt','md','html','js','css','py','java','c','cpp','cs','php','rb','go','rs','swift','kt','xml','json'].includes(ext)) {
                txt = await file.text();
            } else if (ext === 'docx') {
                const ab = await file.arrayBuffer();
                const res = await mammoth.extractRawText({ arrayBuffer: ab });
                txt = res.value;
            } else if (ext === 'pdf') {
                const ab = await file.arrayBuffer();
                const pdf = await pdfjsLib.getDocument(ab).promise;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const tc = await page.getTextContent();
                    txt += tc.items.map(it => it.str).join(' ') + '\n';
                }
            } else {
                txt = await file.text();
            }
            combinedText += `\n[SOURCE: ${file.name}]\n${txt}\n`;
        }

        if (combinedText.trim().length < 10) {
            throw new Error('Not enough text extracted.');
        }

        state.fileContent = combinedText;
        state.currentFileName = files.length > 1 ? `${files.length} Documents Combined` : files[0].name;
        fileNameDisplay.textContent = state.currentFileName;
        state.fileHash = CryptoJS.SHA256(state.fileContent).toString();
        statusMessage.textContent = 'Documents ready!';
        statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';
        document.getElementById('customize-section').classList.remove('hidden');
        document.getElementById('customize-content').classList.remove('hidden');
        document.getElementById('customize-toggle-icon').classList.add('rotate-180');
    } catch (err) {
        console.error('File err:', err);
        statusMessage.textContent = `Err: ${err.message}`;
        statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        state.fileContent = '';
        state.currentFileName = '';
        fileNameDisplay.textContent = 'Select Documents';
    } finally {
        validateAllInputs();
    }
}

export function resetApp(clearProg = true) {
    if (clearProg) clearInProgressQuiz();
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

export async function handleQuizGeneration(isRemedial = false, skipStart = false) {
    if (state.isCustomizingHistory && state.customizingQuizData && !isRemedial) {
        const newName = editQuizNameInput.value.trim() || state.customizingQuizData.fileName;
        state.questions = state.customizingQuizData.questions;
        state.currentFileName = newName;
        state.currentQuizConfig = { ...state.customizingQuizData.config };

        state.isTimedQuiz = timeLimitToggle.checked;
        if (state.isTimedQuiz) {
            const selectedPreset = document.querySelector('input[name="time_preset"]:checked').value;
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

        const newQuizId = CryptoJS.SHA256(JSON.stringify(state.questions) + JSON.stringify(state.currentQuizConfig) + newName).toString();
        if (newQuizId !== state.customizingQuizData.key && state.quizHistory[state.customizingQuizData.key]) {
            delete state.quizHistory[state.customizingQuizData.key];
        }
        state.currentQuizKey = newQuizId;
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: newName, config: state.currentQuizConfig });

        resetStartViewUI();
        if (!skipStart) {
            startQuiz();
        } else {
            showToast('Changes saved successfully!');
            refreshHistory();
        }
        return;
    }

    const qCountInput = isRemedial ? remedialQuestionCountInput : questionCountInput;
    const diffSelector = isRemedial ? 'input[name="remedial_difficulty"]:checked' : 'input[name="difficulty"]:checked';
    const timeToggle = isRemedial ? remedialTimeLimitToggle : timeLimitToggle;
    const attemptToggle = isRemedial ? remedialAttemptLimitToggle : attemptLimitToggle;
    const summaryToggle = isRemedial ? document.getElementById('remedial-summary-only-toggle') : summaryOnlyToggle;
    const mainCustTypeSelect = isRemedial ? remedialCustomQuestionTypeSelect : customQuestionTypeSelect;

    const selDiff = document.querySelector(diffSelector).value;
    let mc = 0, id = 0, en = 0, custType = null, custTypeShort = null;
    const totalQ = parseInt(qCountInput.value, 10);

    if (selDiff === 'custom') {
        custType = mainCustTypeSelect.value;
        if (custType === 'mixed') {
            mc = parseInt(document.getElementById(isRemedial ? 'remedial-mc-count' : 'mc-count').value, 10) || 0;
            id = parseInt(document.getElementById(isRemedial ? 'remedial-id-count' : 'id-count').value, 10) || 0;
            en = parseInt(document.getElementById(isRemedial ? 'remedial-en-count' : 'en-count').value, 10) || 0;
            custTypeShort = 'Mix';
            if (mc + id + en !== totalQ) {
                showToast(`Custom counts (${mc + id + en}) do not match total (${totalQ}).`, 3000, 'error');
                return;
            }
        } else if (custType === 'multiple-choice') {
            mc = totalQ; custTypeShort = 'MC';
        } else if (custType === 'identification') {
            id = totalQ; custTypeShort = 'ID';
        } else if (custType === 'enumeration') {
            en = totalQ; custTypeShort = 'EN';
        }
    } else if (selDiff === 'easy') {
        mc = Math.max(1, Math.round(totalQ * 0.85));
        id = totalQ - mc;
    } else if (selDiff === 'medium') {
        mc = Math.round(totalQ * 0.5);
        id = Math.round(totalQ * 0.25);
        en = totalQ - mc - id;
    } else if (selDiff === 'hard') {
        mc = Math.max(0, Math.min(1, Math.round(totalQ * 0.15)));
        id = Math.round((totalQ - mc) * 0.5);
        en = totalQ - mc - id;
    }

    let calcTime = 0;
    state.isTimedQuiz = timeToggle.checked;
    if (state.isTimedQuiz) {
        const selPreset = document.querySelector(isRemedial ? 'input[name="remedial_time_preset"]:checked' : 'input[name="time_preset"]:checked').value;
        if (selPreset === 'custom') {
            calcTime = (parseInt(isRemedial ? remedialCustomTimeLimitInput.value : customTimeLimitInput.value, 10) || 0) * 60;
        } else {
            calcTime = (parseInt(selPreset, 10) || 0) * 60;
        }
        if (calcTime <= 0) {
            showToast(isRemedial ? 'Invalid remedial time.' : 'Invalid time.', 3000, 'error');
            return;
        }
    }

    state.totalQuizTime = calcTime;
    state.isAttemptLimited = attemptToggle.checked;
    state.maxAttempts = state.isAttemptLimited ? (parseInt(isRemedial ? remedialAttemptLimitInput.value : attemptLimitInput.value, 10) || 1) : 0;
    if (state.isAttemptLimited && state.maxAttempts <= 0) {
        showToast(isRemedial ? 'Invalid remedial attempts.' : 'Invalid attempts.', 3000, 'error');
        return;
    }

    const showAnswersInSummaryOnly = summaryToggle.checked;
    state.currentQuizConfig = {
        count: totalQ,
        difficulty: selDiff,
        mc,
        id,
        en,
        customType: custType,
        customTypeShort: custTypeShort,
        isTimed: state.isTimedQuiz,
        totalTime: state.totalQuizTime,
        isAttemptLimited: state.isAttemptLimited,
        maxAttempts: state.maxAttempts,
        showAnswersInSummaryOnly,
        isRemedial: isRemedial
    };

    const settingsHash = CryptoJS.SHA256(JSON.stringify(state.currentQuizConfig)).toString();
    state.currentQuizKey = `${state.fileHash}-${settingsHash}`;
    const db = state.quizHistory;
    if (db[state.currentQuizKey] && !isRemedial) {
        statusMessage.textContent = 'Quiz found! Loading...';
        setTimeout(() => {
            handleHistoryClick({ target: { tagName: 'BUTTON', dataset: { key: state.currentQuizKey, action: 'load' } } });
        }, 1000);
        return;
    }

    showView('loading');
    startLoadingAnimation();

    let allQs = [];
    let qSet = new Set();
    let attempts = 0;
    const needed = totalQ;

    try {
        while (allQs.length < needed && attempts < MAX_GENERATION_ATTEMPTS) {
            attempts++;
            const sysP = `You are a strict Quiz generator. Return ONLY a valid JSON array of objects. Each object MUST have: "type" (must be "multiple-choice", "identification", or "enumeration"), "question", "options" (array, only if type is multiple-choice), "answer", and "explanation". Do not include any conversational text.`;
            const userQ = `Document: """${state.fileContent.substring(0, 15000)}"""\n\nGenerate ${needed - allQs.length} questions of type ${custType || selDiff}. JSON output only.`;

            const res = await puter.ai.chat(sysP + "\n\n" + userQ);
            let rawText = '';
            if (res) {
                if (typeof res === 'string') {
                    rawText = res;
                } else if (typeof res === 'object') {
                    if (res.message && res.message.content && Array.isArray(res.message.content) && res.message.content[0] && typeof res.message.content[0].text === 'string') {
                        rawText = res.message.content[0].text;
                    } else if (typeof res.content === 'string') {
                        rawText = res.content;
                    } else if (typeof res.text === 'string') {
                        rawText = res.text;
                    } else if (res.message && typeof res.message.content === 'string') {
                        rawText = res.message.content;
                    } else if (res.choices && res.choices[0] && typeof res.choices[0].text === 'string') {
                        rawText = res.choices[0].text;
                    } else if (res.choices && res.choices[0] && res.choices[0].message && typeof res.choices[0].message.content === 'string') {
                        rawText = res.choices[0].message.content;
                    } else {
                        rawText = JSON.stringify(res);
                    }
                }
            }

            const cleanJson = (typeof rawText === 'string' ? rawText : '').replace(/```json/gi, '').replace(/```/g, '').trim();
            console.log(`Attempt ${attempts} Cleaned JSON:`, cleanJson.substring(0, 300));

            try {
                const parsed = JSON.parse(cleanJson);
                if (!Array.isArray(parsed)) {
                    console.warn(`Attempt ${attempts}: Response is not an array:`, parsed);
                    continue;
                }
                parsed.forEach(q => {
                    if (q && q.question && q.answer && q.type && !qSet.has(q.question)) {
                        allQs.push(q);
                        qSet.add(q.question);
                    }
                });
            } catch (e) {
                console.error(`Attempt ${attempts} JSON Parse Error:`, e.message);
                console.error(`Failed JSON string:`, cleanJson.substring(0, 500));
            }
        }

        if (allQs.length === 0) {
            throw new Error('AI failed to return valid JSON format. Check browser console for details.');
        }

        state.questions = allQs.slice(0, needed);
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
        refreshHistory();
        startQuiz();
    } catch (err) {
        statusMessage.textContent = `Err: ${err.message}`;
        showView('start');
    } finally {
        stopLoadingAnimation();
    }
}

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
    progressEl.textContent = `Q ${state.answeredOriginalIndices.size + state.skippedOriginalIndices.size + 1}/${state.questions.length}`;
    scoreEl.textContent = `Score: ${state.score}`;
    questionTextEl.textContent = qData.question;

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
    } else if (qData.type === 'identification') {
        answerAreaEl.innerHTML = `<input type="text" id="id-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const idIn = document.getElementById('id-ans');
        document.getElementById('submit-btn').onclick = () => { checkAnswer(idIn.value); };
        idIn.addEventListener('keypress', (e) => { if (e.key === 'Enter') checkAnswer(e.target.value); });
        idIn.focus();
    } else if (qData.type === 'enumeration') {
        answerAreaEl.innerHTML = `<textarea id="en-ans" class="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500" rows="4" placeholder="List items, one per line..."></textarea><button id="submit-btn" class="w-full mt-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Submit</button>`;
        const enIn = document.getElementById('en-ans');
        document.getElementById('submit-btn').onclick = () => { checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); };
        enIn.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); checkAnswer(enIn.value.split('\n').map(s => s.trim()).filter(Boolean)); } });
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
                setTimeout(() => showResults(), 1500);
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
    displayExplanation(qData, isCorrect);
}

export function displayExplanation(qData, isCorrect) {
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
    nextQuestionBtn.classList.remove('hidden');
    skipQuestionBtn.classList.add('hidden');
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

export function showResults() {
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
    const sortedAns = [...state.userAnswers].sort((a, b) => a.originalIndex - b.originalIndex);
    state.incorrectQuestionsForRemedial = [];

    sortedAns.forEach((ans, dispIdx) => {
        const item = document.createElement('div');
        item.className = `summary-item bg-gray-700/50 p-4 rounded-lg ${ans.isCorrect ? 'summary-correct' : 'summary-incorrect'}`;
        const userAnsTxt = Array.isArray(ans.userAnswer) ? ans.userAnswer.join(', ') : (ans.userAnswer || '');
        const corrAnsTxt = Array.isArray(ans.correctAnswer) ? ans.correctAnswer.join(', ') : ans.correctAnswer;
        item.innerHTML = `<p class="font-semibold text-gray-300">Q${dispIdx + 1}: ${ans.question}</p><p class="text-sm mt-2">You: <span class="font-mono text-gray-400">${userAnsTxt || '<em>Skipped/Timeout/Attempts</em>'}</span></p>${!ans.isCorrect ? `<p class="text-sm">Correct: <span class="font-mono text-green-400">${corrAnsTxt || 'N/A'}</span></p>` : ''}`;
        summaryCont.appendChild(item);
        if (!ans.isCorrect) {
            state.incorrectQuestionsForRemedial.push(state.questions[ans.originalIndex]);
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

export function exportQuiz() {
    if (state.questions.length === 0) return;
    exportQuizFromHistory({ questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig }, state.currentQuizKey);
}

export function exportQuizFromHistory(data, key) {
    try {
        const exportPayload = {
            quizId: key || CryptoJS.SHA256(JSON.stringify(data.questions) + JSON.stringify(data.config) + data.fileName).toString(),
            fileName: data.fileName,
            config: data.config,
            questions: data.questions
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const name = (data.fileName || 'quiz').replace(/\.[^/.]+$/, '');
        link.download = `quiz-${name}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Exported!');
    } catch (e) {
        console.error('Export fail:', e);
        showToast('Export failed.', 3000, 'error');
    }
}

export function handleQuizImport(event) {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.json')) {
        showToast('Requires .json', 3000, 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data?.questions?.length || !data.config || !data.questions.every(q => q?.question && q.answer && q.explanation)) {
                throw new Error('Invalid format.');
            }

            const importedId = data.quizId || CryptoJS.SHA256(JSON.stringify(data.questions) + JSON.stringify(data.config) + (data.fileName || file.name)).toString();
            if (state.quizHistory[importedId]) {
                if (!confirm('A similar quiz already exists in your history. Do you want to import it anyway? (This will overwrite the existing one)')) {
                    importQuizInput.value = '';
                    statusMessage.textContent = 'Import cancelled.';
                    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
                    return;
                }
            }

            state.questions = data.questions;
            state.currentQuizConfig = data.config;
            state.currentFileName = data.fileName || file.name;
            state.currentQuizKey = importedId;
            state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
            state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
            state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
            state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;

            saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
            refreshHistory();
            statusMessage.textContent = `Imported "${state.currentFileName}". Opening customize screen...`;
            statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';

            setTimeout(() => {
                state.customizingQuizData = { ...state.quizHistory[state.currentQuizKey], key: state.currentQuizKey };
                setupCustomizeView(state.currentQuizConfig, state.currentFileName);
                showView('start');
                statusMessage.textContent = '';
            }, 1000);
        } catch (err) {
            console.error('Import Err:', err);
            statusMessage.textContent = `Import Err: ${err.message}`;
            statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        } finally {
            importQuizInput.value = '';
        }
    };
    reader.onerror = () => {
        statusMessage.textContent = 'Read file error.';
        statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        importQuizInput.value = '';
    };
    reader.readAsText(file);
}

export function resumeQuiz(savedData) {
    state.questions = savedData.questions;
    state.currentQuizConfig = savedData.config;
    state.currentQuizKey = savedData.key;
    state.currentFileName = savedData.fileName;
    state.score = savedData.score;
    state.userAnswers = savedData.answers;
    state.shuffledIndices = savedData.shuffledIndices;
    state.isTimedQuiz = savedData.config.isTimed || false;
    state.totalQuizTime = savedData.config.totalTime || 0;
    state.isAttemptLimited = savedData.config.isAttemptLimited || false;
    state.maxAttempts = savedData.config.maxAttempts || 3;
    state.currentAttempts = savedData.currentAttempts || 0;
    state.currentShuffledIndexPos = savedData.shuffledIndexPos || 0;
    state.answeredOriginalIndices = new Set(savedData.answeredIndices || []);
    state.skippedOriginalIndices = new Set(savedData.skippedIndices || []);
    state.currentSkippedItemIndex = savedData.skippedIndexPos || 0;
    state.inSkippedRound = savedData.inSkippedRound || false;
    state.currentSkippedArray = state.inSkippedRound ? Array.from(state.skippedOriginalIndices) : [];
    showView('quiz');
    updateAttemptDisplay();
    displayNextQuestion();
    if (state.isTimedQuiz) {
        const resumeTime = savedData.timeRemaining !== undefined ? savedData.timeRemaining : state.totalQuizTime;
        startQuizTimer(resumeTime);
    } else {
        stopQuizTimer();
    }
}

export function handleHistoryClick(e) {
    if (e.target.tagName === 'BUTTON') {
        const key = e.target.dataset.key;
        const action = e.target.dataset.action;
        const quizData = state.quizHistory[key];
        if (!quizData) return;

        if (action === 'load') {
            if (state.savedProgress?.key === key && (state.savedProgress.shuffledIndexPos < state.savedProgress.shuffledIndices?.length || state.savedProgress.inSkippedRound)) {
                if (confirm('Resume unfinished? (Cancel=start over)')) {
                    resumeQuiz(state.savedProgress);
                    return;
                }
            }
            clearInProgressQuiz();
            state.questions = quizData.questions;
            state.currentQuizConfig = quizData.config;
            state.currentQuizKey = key;
            state.currentFileName = quizData.fileName;
            state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
            state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
            state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
            state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;
            statusMessage.textContent = `Loaded "${state.currentFileName}".`;
            statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';
            startQuiz();
        } else if (action === 'export') {
            exportQuizFromHistory(quizData, key);
        } else if (action === 'customize') {
            state.customizingQuizData = { ...quizData, key };
            setupCustomizeView(quizData.config, quizData.fileName);
            showView('start');
        }
    }
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

function resetStartViewUI() {
    state.isCustomizingHistory = false;
    state.customizingQuizData = null;
    state.initialCustomizeState = {};
    document.getElementById('rename-container').classList.add('hidden');
    document.getElementById('customize-section').classList.add('hidden');
    document.getElementById('customize-content').classList.add('hidden');
    document.getElementById('customize-toggle-icon').classList.remove('rotate-180');
    startSubtitle.textContent = 'Customize quiz, upload documents, or load history.';
    generateQuizBtn.textContent = 'Generate Quiz';
    cancelCustomizeBtn.classList.add('hidden');
    fileActionsDiv.classList.remove('hidden');
    questionCountInput.readOnly = false;
    questionCountInput.classList.remove('locked-input');
    questionCountInput.closest('div')?.querySelector('label')?.classList.remove('locked-label');
    difficultyRadios.forEach(radio => {
        radio.disabled = false;
        radio.closest('div')?.querySelector('label')?.classList.remove('locked-label');
    });
    customQuestionTypeSelect.disabled = false;
    customQuestionTypeSelect.classList.remove('locked-input');
    document.getElementById('custom-type-group')?.querySelector('label')?.classList.remove('locked-label');
    customCountInputs.forEach(input => {
        input.readOnly = false;
        input.classList.remove('locked-input');
        input.closest('div')?.querySelector('label')?.classList.remove('locked-label');
    });
    const selectedDifficulty = document.querySelector('input[name="difficulty"]:checked').value;
    customOptionsDiv.classList.toggle('hidden', selectedDifficulty !== 'custom');
    if (selectedDifficulty === 'custom') handleCustomTypeChange();
    validateAllInputs();
}

export function attachQuizEventListeners() {
    resumeQuizBtn.addEventListener('click', () => { if (state.savedProgress) resumeQuiz(state.savedProgress); });
    fileUploadInput.addEventListener('change', handleFileSelect);
    importQuizInput.addEventListener('change', handleQuizImport);
    generateQuizBtn.addEventListener('click', () => handleQuizGeneration(false, false));
    difficultyRadios.forEach(r => r.addEventListener('change', handleDifficultyChange));
    questionCountInput.addEventListener('input', validateAllInputs);
    customQuestionTypeSelect.addEventListener('change', handleCustomTypeChange);
    customCountInputs.forEach(i => i.addEventListener('input', validateAllInputs));
    nextQuestionBtn.addEventListener('click', displayNextQuestion);
    skipQuestionBtn.addEventListener('click', skipQuestion);
    restartQuizBtn.addEventListener('click', () => resetApp(true));
    exportQuizBtn.addEventListener('click', exportQuiz);
    homeBtn.addEventListener('click', () => { if (confirm('Save progress and return home?')) saveAndGoHome(); });
    saveQuizBtn.addEventListener('click', saveCurrentQuiz);
    historyList.addEventListener('click', handleHistoryClick);
    clearHistoryBtn.addEventListener('click', clearHistory);
    syncCloudBtn.addEventListener('click', () => syncHistoryWithCloud(true));
    timeLimitToggle.addEventListener('change', handleTimeToggle);
    timePresetRadios.forEach(r => r.addEventListener('change', handleTimePresetChange));
    customTimeLimitInput.addEventListener('input', validateAllInputs);
    attemptLimitToggle.addEventListener('change', handleAttemptToggle);
    attemptLimitInput.addEventListener('input', validateAllInputs);
    cancelCustomizeBtn.addEventListener('click', () => {
        if (hasUnsavedChanges()) {
            if (confirm('You have unsaved changes! Do you want to save them before exiting?\n\nOK = Save changes\nCancel = Discard changes')) {
                handleQuizGeneration(false, true);
                return;
            }
        }
        resetApp(true);
    });
    document.getElementById('customize-toggle-btn').addEventListener('click', () => {
        document.getElementById('customize-content').classList.toggle('hidden');
        document.getElementById('customize-toggle-icon').classList.toggle('rotate-180');
    });
    createRemedialBtn.addEventListener('click', setupRemedialView);
    cancelRemedialBtn.addEventListener('click', () => {
        remedialOptionsView.classList.add('hidden');
        resultsActions.classList.remove('hidden');
        createRemedialBtn.classList.remove('hidden');
    });
    generateRemedialQuizBtn.addEventListener('click', () => handleQuizGeneration(true, false));
    remedialDifficultyRadios.forEach(r => r.addEventListener('change', handleRemedialDifficultyChange));
    remedialCustomQuestionTypeSelect.addEventListener('change', handleRemedialCustomTypeChange);
    remedialCustomCountInputs.forEach(i => i.addEventListener('input', validateRemedialInputs));
    remedialQuestionCountInput.addEventListener('input', validateRemedialInputs);
    remedialTimeLimitToggle.addEventListener('change', () => {
        remedialTimeLimitOptions.classList.toggle('hidden', !remedialTimeLimitToggle.checked);
        if (remedialTimeLimitToggle.checked) {
            const sel = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
            remedialCustomTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
        } else {
            remedialCustomTimeInputContainer.classList.add('hidden');
        }
        validateRemedialInputs();
    });
    remedialAttemptLimitToggle.addEventListener('change', () => {
        remedialAttemptLimitOptions.classList.toggle('hidden', !remedialAttemptLimitToggle.checked);
        validateRemedialInputs();
    });
    remedialTimePresetRadios.forEach(r => r.addEventListener('change', () => {
        const sel = document.querySelector('input[name="remedial_time_preset"]:checked')?.value;
        remedialCustomTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
        validateRemedialInputs();
    }));
    remedialCustomTimeLimitInput.addEventListener('input', validateRemedialInputs);
    remedialAttemptLimitInput.addEventListener('input', validateRemedialInputs);
}

export function prepareResumeButton() {
    try {
        const saved = localStorage.getItem(IN_PROGRESS_QUIZ_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data?.questions?.length && (data.shuffledIndexPos < data.shuffledIndices?.length || data.inSkippedRound)) {
                state.savedProgress = data;
                resumeQuizBtn.classList.remove('hidden');
                resumeQuizBtn.textContent = `Resume: ${data.fileName || 'Quiz'} (${data.answeredIndices?.length || 0}/${data.questions.length})`;
            } else {
                clearInProgressQuiz();
            }
        }
    } catch (e) {
        console.error('Could not read progress', e);
        clearInProgressQuiz();
    }
}
