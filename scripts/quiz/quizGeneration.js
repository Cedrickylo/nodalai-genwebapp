import { elements, state, constants } from '../state.js';
import { generateQuestionsFromAI } from '../aiService.js';
import {
    showToast,
    showView,
    saveQuizToDB,
    customConfirm,
    loadGenerationCooldownState,
    getGenerationCooldownWarning,
    recordGenerationEvent,
    refreshCooldownPanel,
    refreshHistory
} from '../helpers.js';

const {
    statusMessage,
    loadingMessage,
    loadingTitle,
    questionCountInput,
    difficultyRadios,
    customQuestionTypeSelect,
    customTimeInputContainer,
    customTimeLimitInput,
    timeLimitToggle,
    timePresetRadios,
    customTimeLimitInput: customTimeLimitInputAlias,
    attemptLimitToggle,
    attemptLimitInput,
    summaryOnlyToggle
} = elements;

export async function handleQuizGeneration(isRemedial = false, skipStart = false) {

    // 1. CUSTOMIZATION CHECK
    if (state.isCustomizingHistory && state.customizingQuizData && !isRemedial) {
        const { editQuizNameInput } = elements;
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

        const { resetStartViewUI } = await import('./quizUtils.js');
        const { startQuiz } = await import('./quizExecution.js');
        resetStartViewUI();
        if (!skipStart) {
            startQuiz();
        } else {
            showToast('Changes saved successfully!');
            refreshHistory();
        }
        return;
    }

    // ADDED: Require login before generation
    if (!puter.auth.isSignedIn()) {
        const wantsToLogin = await customConfirm(
            'You need a Puter account to generate quizzes using AI. Would you like to log in or sign up now?',
            'Login Required',
            'Log In / Sign Up',
            'Cancel'
        );
        if (wantsToLogin) {
            try {
                await puter.auth.signIn();
                const { updateAuthUI, syncHistoryWithCloud } = await import('../helpers.js');
                await updateAuthUI();
                syncHistoryWithCloud();
                showToast('Logged in successfully. Click "Generate Quiz" again to continue.');
            } catch (e) {
                console.error("Login failed during generation prompt", e);
            }
        }
        return; // Halt generation process until they log in
    }

    // 2. UI PARSING & MATH LOGIC
    const qCountInput = isRemedial ? elements.remedialQuestionCountInput : questionCountInput;
    const diffSelector = isRemedial ? 'input[name="remedial_difficulty"]:checked' : 'input[name="difficulty"]:checked';
    const timeToggle = isRemedial ? elements.remedialTimeLimitToggle : timeLimitToggle;
    const attemptToggle = isRemedial ? elements.remedialAttemptLimitToggle : attemptLimitToggle;
    const summaryToggle = isRemedial ? document.getElementById('remedial-summary-only-toggle') : summaryOnlyToggle;
    const mainCustTypeSelect = isRemedial ? elements.remedialCustomQuestionTypeSelect : customQuestionTypeSelect;

    const selDiff = document.querySelector(diffSelector).value;
    let mc = 0, id = 0, en = 0, custType = null, custTypeShort = null;
    const totalQ = parseInt(qCountInput.value, 10);

    if (!Number.isInteger(totalQ) || totalQ < constants.MIN_QUIZ_QUESTIONS || totalQ > constants.MAX_QUIZ_QUESTIONS) {
        showToast(`Number of questions must be between ${constants.MIN_QUIZ_QUESTIONS} and ${constants.MAX_QUIZ_QUESTIONS}.`, 5000, 'warning');
        if (!isRemedial) showView('start');
        return;
    }

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
    state.isAttemptLimited = attemptToggle.checked;
    state.maxAttempts = state.isAttemptLimited ? (parseInt(isRemedial ? elements.remedialAttemptLimitInput.value : attemptLimitInput.value, 10) || 1) : 0;
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

    await loadGenerationCooldownState();
    const cooldownWarning = getGenerationCooldownWarning();
    if (cooldownWarning) {
        showToast(cooldownWarning, 7000, 'error');
        if (!isRemedial) showView('start');
        return;
    }

    if (isRemedial) {
        state.currentFileName = elements.remedialQuizNameInput.value.trim() || (state.currentFileName + ' - Remedial');
    } else if (!state.isCustomizingHistory) {
        state.currentFileName = elements.editQuizNameInput.value.trim() || state.currentFileName;
    }

    // 3. DUPLICATE CHECK
    const settingsHash = CryptoJS.SHA256(JSON.stringify(state.currentQuizConfig)).toString();
    state.currentQuizKey = `${state.fileHash}-${settingsHash}`;
    const db = state.quizHistory;
    
    if (db[state.currentQuizKey] && !isRemedial) {
        const wantsToLoad = await customConfirm(
            'A quiz with the same file and settings already exists. Load the existing quiz instead of regenerating it?',
            'Quiz Exists',
            'Load Existing',
            'Cancel'
        );
        
        if (!wantsToLoad) {
            statusMessage.textContent = 'Generation canceled; keep your current settings.';
            statusMessage.className = 'text-center text-yellow-400 mt-4 text-sm h-5';
            return;
        }
        statusMessage.textContent = 'Quiz found! Loading...';
        setTimeout(async() => {
            const { handleHistoryClick } = await import('./quizHistory.js');
            handleHistoryClick({ target: { tagName: 'BUTTON', dataset: { key: state.currentQuizKey, action: 'load' } } });
        }, 1000);
        return;
    }

    showView('loading');
    const { startLoadingAnimation, stopLoadingAnimation } = await import('./quizUtils.js');
    startLoadingAnimation();

    // CLEAR THE INTERVAL TIMER IMMEDIATELY
    if (state.loadingInterval) {
        clearInterval(state.loadingInterval);
        state.loadingInterval = null;
    }

    // Extract JSON from text
    function extractJsonArrayString(text) {
        if (!text || typeof text !== 'string') return '';
        let normalized = text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const start = normalized.indexOf('[');
        const end = normalized.lastIndexOf(']');
        if (start === -1 || end === -1 || end <= start) return '';
        return normalized.substring(start, end + 1).trim();
    }

    let allQs = [];
    let qSet = new Set();
    const baseBatchSize = 15; 
    let batchCounter = 1;
    let apiCallCount = 0;
    const maxSafetyCalls = 30; 

    const avgEstApiTimePerBatch = 3.5; 
    const coolDownTimePerBatch = 15.5; 

    try {
        while (allQs.length < totalQ && apiCallCount < maxSafetyCalls) {
            let neededForBatch = Math.min(baseBatchSize, totalQ - allQs.length);
            
            if (allQs.length > 0 && neededForBatch < baseBatchSize) {
                neededForBatch = Math.min(baseBatchSize, neededForBatch + 2);
            }

            const currentBatchIndex = batchCounter - 1;
            const totalEstimatedBatches = Math.max(batchCounter, Math.ceil(totalQ / baseBatchSize));
            const remainingBatches = Math.max(1, totalEstimatedBatches - currentBatchIndex);
            
            const estSecondsLeft = Math.ceil(
                (remainingBatches * avgEstApiTimePerBatch) + 
                (Math.max(0, remainingBatches - 1) * coolDownTimePerBatch)
            );

            const estMinutes = Math.floor(estSecondsLeft / 60);
            const estSeconds = estSecondsLeft % 60;
            let timeRemainingText = estMinutes > 0 
                ? `${estMinutes} minute${estMinutes > 1 ? 's' : ''} and ${estSeconds} second${estSeconds !== 1 ? 's' : ''} remaining`
                : `${estSeconds} second${estSeconds !== 1 ? 's' : ''} remaining`;

            const progressPercentage = Math.min(98, Math.round((allQs.length / totalQ) * 100));

            if (elements.loadingMessage) {
                elements.loadingMessage.innerHTML = `
                    <div class="w-full max-w-md mx-auto text-left bg-gray-900/60 p-5 rounded-xl border border-gray-700/50 shadow-xl mt-4">
                        <div class="flex justify-between items-center mb-1">
                            <span class="text-sm font-semibold text-gray-200">
                                Progress: ${allQs.length} / ${totalQ} questions
                            </span>
                            <span class="text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                                Batch ${batchCounter}
                            </span>
                        </div>
                        <div class="w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700 my-2">
                            <div class="bg-gradient-to-r from-blue-500 to-indigo-600 h-3 rounded-full transition-all duration-700 ease-out" 
                                 style="width: ${progressPercentage}%">
                            </div>
                        </div>
                        <div class="flex justify-between items-center mt-3 text-xs">
                            <div class="flex items-center text-gray-400">
                                <svg class="animate-spin h-3 w-3 mr-1.5 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"></circle>
                                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Est. time: <span class="text-blue-400 font-medium ml-1">${timeRemainingText}</span>
                            </div>
                            <span class="font-bold text-gray-300">${progressPercentage}%</span>
                        </div>
                    </div>
                `;
            }

            const allowedTypes = ['multiple-choice', 'identification', 'enumeration'];

            const sysP = `You are an expert quiz generator. Output ONLY a valid JSON array. Each object must have: "type", "question", "options", "answer", "explanation".
CRITICAL RULES:
1. Every question must cover completely distinct concepts from the text.
2. DO NOT repeat concepts, rephrase existing questions, or create near-duplicates.
3. Strictly check the "EXCLUDED_QUESTIONS" list provided by the user. Do not generate anything covering those identical topics or answers.
Do not include any conversational filler or markdown wrappers outside the raw JSON array.`;

            const excludedQuestionsList = Array.from(qSet)
                .map((qText, index) => `${index + 1}. ${qText}`)
                .join('\n');

            const userQ = `Generate exactly ${neededForBatch} unique questions based on this document: ${state.fileContent.substring(0, 20000)}. 
            
Identification questions should have specific and concise answers. Output ONLY raw JSON. 

Mix requirement for this batch: 
- Multiple-choice: ${Math.round(neededForBatch * (mc/totalQ))}
- Identification: ${Math.round(neededForBatch * (id/totalQ))}
- Enumeration: ${Math.round(neededForBatch * (en/totalQ))}

CRITICAL - EXCLUDED_QUESTIONS (Do not generate questions on these topics/phrases):
${excludedQuestionsList || "None. This is the first batch."}

Remember to output ONLY the raw JSON array string.`;
            
            apiCallCount++;
            let currentBatchSuccess = false;
            let singleBatchAttempts = 0;
            const maxAllowedRetries = 3;

            while (!currentBatchSuccess) {
                try {
                    if (singleBatchAttempts > 0) {
                        if (elements.loadingMessage) {
                            elements.loadingMessage.innerHTML = `
                                <div class="w-full max-w-md mx-auto text-left bg-gray-900/60 p-5 rounded-xl border border-yellow-500/40 shadow-xl mt-4">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-sm font-bold text-yellow-400 flex items-center">
                                            ⚠️ Rate Ceiling Detected
                                        </span>
                                        <span class="text-xs font-bold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                                            Retry ${singleBatchAttempts} / ${maxAllowedRetries}
                                        </span>
                                    </div>
                                    <p class="text-xs text-gray-300 mt-2 font-medium leading-relaxed">
                                        Server is still processing, please wait 60 seconds...
                                    </p>
                                    <div class="w-full bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700 mt-3">
                                        <div class="bg-yellow-500 h-2 rounded-full animation-pulse w-full"></div>
                                    </div>
                                </div>
                            `;
                        }
                        await new Promise(r => setTimeout(r, 60000));
                    }

                    let rawText;
                    try {
                        rawText = await generateQuestionsFromAI(sysP, userQ);
                    } catch (apiErr) {
                        singleBatchAttempts++;
                        console.warn(`Batch ${batchCounter} API error on attempt ${singleBatchAttempts}:`, apiErr.message || apiErr);
                        if (singleBatchAttempts > maxAllowedRetries) {
                            throw new Error("SERVER_LIMIT_EXCEEDED");
                        }
                        continue;
                    }

                    const cleanJson = extractJsonArrayString(rawText);
                    if (!cleanJson) {
                        console.warn(`Batch ${batchCounter} parse error: no JSON found in AI response.`);
                        if (elements.loadingMessage) {
                            elements.loadingMessage.innerHTML = `
                                <div class="w-full max-w-md mx-auto text-left bg-gray-900/60 p-5 rounded-xl border border-red-500/40 shadow-xl mt-4">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-sm font-bold text-red-400 flex items-center">
                                            ⚠️ Response Parse Error
                                        </span>
                                        <span class="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                            Parsing Failed
                                        </span>
                                    </div>
                                    <p class="text-xs text-gray-300 mt-2 font-medium leading-relaxed">
                                        The AI returned content that couldn't be interpreted as JSON. Trying again without counting this as a rate-limit retry.
                                    </p>
                                </div>
                            `;
                        }
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }

                    let parsed;
                    try {
                        parsed = JSON.parse(cleanJson);
                    } catch (parseErr) {
                        console.warn(`Batch ${batchCounter} JSON.parse error:`, parseErr.message);
                        if (elements.loadingMessage) {
                            elements.loadingMessage.innerHTML = `
                                <div class="w-full max-w-md mx-auto text-left bg-gray-900/60 p-5 rounded-xl border border-red-500/40 shadow-xl mt-4">
                                    <div class="flex justify-between items-center mb-1">
                                        <span class="text-sm font-bold text-red-400 flex items-center">
                                            ⚠️ Response Parse Error
                                        </span>
                                        <span class="text-xs font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                                            JSON Parsing Failed
                                        </span>
                                    </div>
                                    <p class="text-xs text-gray-300 mt-2 font-medium leading-relaxed">
                                        The AI produced malformed JSON. This will not be counted as a rate-limit attempt.
                                    </p>
                                </div>
                            `;
                        }
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }

                    if (!Array.isArray(parsed)) {
                        console.warn(`Batch ${batchCounter} parse result was not an array.`);
                        if (elements.loadingMessage) {
                            elements.loadingMessage.innerHTML = `<div class="w-full max-w-md mx-auto text-left bg-gray-900/60 p-5 rounded-xl border border-red-500/40 shadow-xl mt-4"><p class="text-xs text-gray-300 mt-2">AI returned a non-array payload. Retrying without counting as a rate-limit attempt.</p></div>`;
                        }
                        await new Promise(r => setTimeout(r, 1500));
                        continue;
                    }

                    let addedInThisBatch = 0;

                    parsed.forEach(q => {
                        const qText = (q.question || '').trim().toLowerCase();
                        
                        if (q && q.question && q.answer && q.type && !qSet.has(qText)) {
                            allQs.push(q);
                            qSet.add(qText);
                            addedInThisBatch++;
                        } else {
                            console.warn("Duplicate or invalid question ignored:", q && q.question);
                        }
                    });

                    currentBatchSuccess = true;
                    batchCounter++;

                } catch (e) {
                    if (e && e.message === "SERVER_LIMIT_EXCEEDED") throw e;
                    console.warn(`Batch ${batchCounter} unexpected error:`, e && e.message ? e.message : e);
                    singleBatchAttempts++;
                    if (singleBatchAttempts > maxAllowedRetries) {
                        throw new Error("SERVER_LIMIT_EXCEEDED");
                    }
                    await new Promise(r => setTimeout(r, 1500));
                }
            }

            if (allQs.length < totalQ) {
                console.log("Cooling down token pool...");
                await new Promise(r => setTimeout(r, 20500)); 
            }
        }

        if (allQs.length === 0) {
            throw new Error('AI failed to parse any question arrays.');
        }

        if (elements.loadingMessage) {
            elements.loadingMessage.innerHTML = `
                <div class="w-full max-w-md mx-auto text-center bg-gray-900/60 p-5 rounded-xl border border-gray-700/50 shadow-xl mt-4">
                    <div class="text-sm font-semibold text-emerald-400 mb-2">✓ Target Reached Successfully!</div>
                    <div class="w-full bg-gray-800 rounded-full h-3 overflow-hidden border border-gray-700">
                        <div class="bg-emerald-500 h-3 rounded-full w-full"></div>
                    </div>
                </div>
            `;
        }

        if (allQs.length > totalQ) {
            allQs = allQs.slice(0, totalQ);
        }

        state.questions = allQs;
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
        
        if (typeof recordGenerationEvent === 'function') await recordGenerationEvent();
        if (typeof refreshCooldownPanel === 'function') await refreshCooldownPanel();
        
        refreshHistory();
        const { startQuiz } = await import('./quizExecution.js');
        startQuiz();

    } catch (err) {
        if (err && err.message === "SERVER_LIMIT_EXCEEDED") {
            await customConfirm(
                "Quiz generation has been canceled because the AI server is completely overloaded and too many request limits were reached. Please wait a few minutes and try again later.",
                "Generation Canceled",
                "Understand",
                ""
            );
            if (statusMessage) {
                statusMessage.textContent = `Err: Generation stopped due to rate limits.`;
                statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
            }
        } else {
            const msg = err && err.message ? err.message : 'Unknown error during generation.';
            await customConfirm(
                `Quiz generation failed: ${msg}`,
                "Process Failure",
                "Back to Menu",
                ""
            );
            if (statusMessage) {
                statusMessage.textContent = `Err: ${msg}`;
                statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
            }
        }
        showView('start');
    } finally {
        stopLoadingAnimation();
    }
}
