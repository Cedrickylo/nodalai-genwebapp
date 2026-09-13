import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    saveQuizToDB,
    refreshHistory,
    openAiPromptModal,
    openAiChoiceModal,
    closeAiChoiceModal,
    clearSubState,
    formatTime
} from '../helpers.js';

const {
    questionCountInput,
    customTimeLimitInput,
    timeLimitToggle,
    attemptLimitToggle,
    attemptLimitInput,
    summaryOnlyToggle,
    editQuizNameInput
} = elements;

export async function handleQuizGeneration(isRemedial = false, skipStart = false) {
    if (!state.isCustomizingHistory || isRemedial) {
        const { isNetlifyDeployment, showNetlifyFeatureDisabledModal } = await import('./quizMigration.js');
        if (isNetlifyDeployment()) {
            showNetlifyFeatureDisabledModal('generation');
            return;
        }
    }

    // 1. CUSTOMIZATION CHECK FOR EXISTING QUIZ IN HISTORY
    if (state.isCustomizingHistory && state.customizingQuizData && !isRemedial) {
        const quizKey = state.customizingQuizData.key;
        const inProgress = state.savedProgress;
        const hasInProgressForThisQuiz = inProgress && (inProgress.key === quizKey);
        if (hasInProgressForThisQuiz) {
            const { customConfirm, clearInProgressQuiz } = await import('../helpers.js');
            const msg = !skipStart
                ? 'This quiz has a saved session in progress. Do you want to clear the in-progress quiz and start over?'
                : 'This quiz has a saved session in progress. Do you want to terminate the current in-progress quiz?';
            const title = !skipStart ? 'Clear In-Progress Quiz?' : 'Terminate In-Progress Quiz?';
            const btnText = !skipStart ? 'Clear & Start Over' : 'Terminate & Save';
            const confirmed = await customConfirm(msg, title, btnText, 'Cancel', true);
            if (!confirmed) {
                return;
            }
            clearInProgressQuiz();
        }

        const newName = (editQuizNameInput?.value?.trim() || state.customizingQuizData.fileName || 'Custom Quiz').slice(0, 35);
        state.questions = state.customizingQuizData.questions;
        state.currentFileName = newName;
        state.currentQuizConfig = { ...state.customizingQuizData.config };
        delete state.currentQuizConfig.manualReveal;

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
        if (elements.secondChanceToggle) state.currentQuizConfig.enableSecondChance = state.currentQuizConfig.showAnswersInSummaryOnly ? false : elements.secondChanceToggle.checked;
        if (elements.maxChancesInput) state.currentQuizConfig.maxChances = parseInt(elements.maxChancesInput.value, 10) || 1;
        if (elements.shuffleQuestionsToggle) state.currentQuizConfig.randomizeQuestions = elements.shuffleQuestionsToggle.checked;
        if (elements.shuffleChoicesToggle) state.currentQuizConfig.randomizeChoices = elements.shuffleChoicesToggle.checked;
        
        const allowChangeToggleEl = document.getElementById('allow-change-toggle');
        state.currentQuizConfig.allowChangeSelection = state.currentQuizConfig.showAnswersInSummaryOnly ? false : (allowChangeToggleEl ? allowChangeToggleEl.checked : false);
        const selectedUiMode = document.querySelector('input[name="ui_mode"]:checked')?.value || 'modern';
        state.currentQuizConfig.uiMode = selectedUiMode;

        state.currentQuizKey = state.customizingQuizData.key;
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: newName, config: state.currentQuizConfig });

        const { resetStartViewUI } = await import('./quizUtils.js');
        const { startQuiz } = await import('./quizExecution.js');
        const { clearSubState } = await import('../helpers.js');
        clearSubState('#edit');
        resetStartViewUI();

        if (typeof puter !== 'undefined' && window.puter?.auth?.isSignedIn() && navigator.onLine) {
            const { syncHistoryWithCloud } = await import('../helpers.js');
            syncHistoryWithCloud(false).catch(e => console.warn('Edit sync error:', e));
        }

        if (!skipStart) {
            state.currentFileName = newName;
            startQuiz();
        } else {
            showToast('Changes saved successfully!', 3000, 'success');
            refreshHistory();
            if (state.editOriginView === 'history-fullscreen') {
                const { showAllHistoryFullScreen } = await import('./quizHistory.js');
                window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
                showAllHistoryFullScreen();
            } else {
                window.history.replaceState({ view: 'start' }, '', '#home');
                showView('start', false);
            }
        }
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
    let mc = 0, tf = 0, id = 0, en = 0, custType = mainCustTypeSelect?.value || 'mixed', custTypeShort = 'Mix';
    const totalQ = parseInt(qCountInput?.value, 10) || 10;

    if (!Number.isInteger(totalQ) || totalQ < constants.MIN_QUIZ_QUESTIONS || totalQ > constants.MAX_QUIZ_QUESTIONS) {
        showToast(`Number of questions must be between ${constants.MIN_QUIZ_QUESTIONS} and ${constants.MAX_QUIZ_QUESTIONS}.`, 5000, 'warning');
        if (!isRemedial) showView('start');
        return;
    }

    if (custType === 'mixed') {
        mc = parseInt(document.getElementById(isRemedial ? 'remedial-mc-count' : 'mc-count')?.value, 10) || 0;
        tf = parseInt(document.getElementById(isRemedial ? 'remedial-tf-count' : 'tf-count')?.value, 10) || 0;
        id = parseInt(document.getElementById(isRemedial ? 'remedial-id-count' : 'id-count')?.value, 10) || 0;
        en = parseInt(document.getElementById(isRemedial ? 'remedial-en-count' : 'en-count')?.value, 10) || 0;
        custTypeShort = 'Mix';
        if (mc + tf + id + en !== totalQ) {
            showToast(`Counts (${mc + tf + id + en}) do not match total (${totalQ}).`, 3000, 'error');
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
    const timerMode = isRemedial
        ? (elements.remedialTimerModeSelect?.value || 'quiz')
        : (elements.timerModeSelect ? elements.timerModeSelect.value : 'quiz');
    const questionTime = isRemedial
        ? (parseInt(elements.remedialQuestionTimeInput?.value, 10) || 30)
        : (elements.questionTimeInput ? parseInt(elements.questionTimeInput.value, 10) || 30 : 30);
    const rawSecondChance = isRemedial
        ? (elements.remedialSecondChanceToggle?.checked || false)
        : (elements.secondChanceToggle ? elements.secondChanceToggle.checked : false);
    const enableSecondChance = showAnswersInSummaryOnly ? false : rawSecondChance;
    const maxChances = isRemedial
        ? (parseInt(elements.remedialMaxChancesInput?.value, 10) || 1)
        : (elements.maxChancesInput ? parseInt(elements.maxChancesInput.value, 10) || 1 : 1);
    const randomizeQuestions = isRemedial
        ? (elements.remedialShuffleQuestionsToggle?.checked ?? true)
        : (elements.shuffleQuestionsToggle ? elements.shuffleQuestionsToggle.checked : true);
    const randomizeChoices = isRemedial
        ? (elements.remedialShuffleChoicesToggle?.checked ?? true)
        : (elements.shuffleChoicesToggle ? elements.shuffleChoicesToggle.checked : true);
    const rawAllowChange = isRemedial
        ? (elements.remedialAllowChangeToggle?.checked || false)
        : (document.getElementById('allow-change-toggle')?.checked || false);
    const allowChangeSelection = showAnswersInSummaryOnly ? false : rawAllowChange;
    const uiMode = isRemedial
        ? (document.querySelector('input[name="remedial_ui_mode"]:checked')?.value || 'modern')
        : (document.querySelector('input[name="ui_mode"]:checked')?.value || 'modern');

    if (timerMode === 'question') state.isTimedQuiz = true;

    state.currentQuizConfig = {
        count: totalQ,
        difficulty: selDiff,
        mc: mc,
        tf: tf,
        id: id, 
        en: en, 
        customType: custType, 
        customTypeShort: custTypeShort,
        uiMode: uiMode,
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
        randomizeQuestions,
        randomizeChoices,
        allowChangeSelection
    };

    let quizName = 'Custom Quiz';
    if (isRemedial) {
        quizName = (elements.remedialQuizNameInput?.value.trim() || ((state.currentFileName || 'Quiz') + ' - Remedial')).slice(0, 35);
    } else {
        quizName = (elements.editQuizNameInput?.value.trim() || state.currentFileName || 'Custom Quiz').slice(0, 35);
    }
    state.currentFileName = quizName;

    // 3. OPEN AI CHOICE MODAL
    openAiChoiceModal(state.currentQuizConfig, quizName);
}

/**
 * Executes automated quiz generation using Google Gemini 3.5 Flash-Lite via Vercel Serverless Function.
 * Includes accurate time estimation, organic progress curve, 3-minute cancel button, and 10-minute auto-cancel.
 */
export async function startNodalAiGeneration(config, fileName) {
    // Dismiss the AI Choice modal immediately without popping browser history
    clearSubState('#ai-choice');
    if (elements.aiChoiceModal) {
        elements.aiChoiceModal.classList.add('hidden');
    }

    const { isNetlifyDeployment, showNetlifyFeatureDisabledModal } = await import('./quizMigration.js');
    if (isNetlifyDeployment()) {
        showNetlifyFeatureDisabledModal('generation');
        return;
    }

    // Offline Guard: Live AI generation requires an active internet connection
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        const { customConfirm } = await import('../helpers.js');
        const userChosePrompt = await customConfirm(
            'You are currently offline. Nodal AI requires an active internet connection to contact Google Gemini.\n\nWould you like to view and copy the tailored system prompt to use when back online?',
            'Internet Connection Required',
            'Copy Prompt to Other AI',
            'Stay Here',
            false
        );
        if (userChosePrompt) {
            cancelNodalAiGenerationAndCopyPrompt(config, fileName, true);
        }
        return;
    }

    // Cooldown Guard: Enforce 2 per 3 min and 10 per 3 hr rate limits
    const { getGenerationCooldownWarning } = await import('../helpers.js');
    const cooldownWarning = getGenerationCooldownWarning();
    if (cooldownWarning) {
        showToast(cooldownWarning, 5000, 'warning');
        return;
    }

    const { buildQuizSystemPrompt } = await import('../helpers.js');
    const systemPrompt = buildQuizSystemPrompt(config, fileName, state.fileContent);

    // Compute accurate time estimation:
    // Gemini 3.5 Flash-Lite: ~3s base latency + 0.45s per question + prompt read overhead
    const count = config.count || 10;
    const fileLen = (typeof state.fileContent === 'string') ? state.fileContent.length : 0;
    const estimatedSec = Math.max(5, Math.round(3 + (count * 0.45) + Math.min(6, (fileLen / 25000) * 1.5)));
    state.aiGenerationEstimatedSec = estimatedSec;

    // Reset abort controller
    if (state.aiGenerationAbortController) {
        try { state.aiGenerationAbortController.abort(); } catch (e) {}
    }
    state.aiGenerationAbortController = new AbortController();

    // Switch to loading view and atomically replace history so the loading screen stays visible
    showView('loading', false);
    window.history.replaceState({ view: 'loading' }, '', '#loading');

    if (elements.loadingTitle) {
        elements.loadingTitle.textContent = 'Generating Quiz with Nodal AI...';
    }
    if (elements.loadingMessage) {
        elements.loadingMessage.textContent = 'Connecting to Gemini 3.5 Flash-Lite...';
    }

    // Populate badges in loading screen
    if (elements.loadingSummaryBadges) {
        const mcCount = config.mc !== undefined ? config.mc : 0;
        const tfCount = config.tf !== undefined ? config.tf : 0;
        const idCount = config.id || 0;
        const enCount = config.en || 0;
        const timeBadge = config.isTimed ? formatTime(config.totalTime) : 'Untimed';
        const typeBadge = config.difficulty === 'custom' 
            ? `Custom (${config.customTypeShort || 'MIX'})`
            : `${(config.difficulty || 'Easy').charAt(0).toUpperCase() + (config.difficulty || 'Easy').slice(1)}`;
        
        elements.loadingSummaryBadges.innerHTML = `
            <span class="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg font-semibold">${config.count || 10} Questions</span>
            <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg font-medium">${typeBadge}</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${mcCount} MC • ${tfCount} T/F • ${idCount} ID • ${enCount} EN</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${timeBadge}</span>
            <span class="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg truncate max-w-[200px]" title="${fileName || 'Quiz'}">${fileName || 'Quiz'}</span>
        `;
    }

    // Reset Progress & Time UI
    if (elements.loadingProgressBar) elements.loadingProgressBar.style.width = '0%';
    if (elements.loadingProgressPercent) elements.loadingProgressPercent.textContent = '0%';
    if (elements.loadingProgressStageText) elements.loadingProgressStageText.textContent = 'Preparing request for Gemini...';
    if (elements.loadingTimeElapsed) elements.loadingTimeElapsed.textContent = 'Elapsed: 00:00';
    if (elements.loadingTimeEstimated) elements.loadingTimeEstimated.textContent = `Estimated: ~${estimatedSec}s`;
    if (elements.loadingDelayContainer) elements.loadingDelayContainer.classList.add('hidden');

    state.aiGenerationStartTime = Date.now();
    if (state.aiGenerationInterval) clearInterval(state.aiGenerationInterval);

    const THREE_MINUTES_SEC = 180;
    const TEN_MINUTES_SEC = 600;

    // High-frequency animation ticker (updates every 100ms for smooth progress bar)
    state.aiGenerationInterval = setInterval(() => {
        const elapsedSec = (Date.now() - state.aiGenerationStartTime) / 1000;
        const mins = Math.floor(elapsedSec / 60);
        const secs = Math.floor(elapsedSec % 60);
        const formattedElapsed = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (elements.loadingTimeElapsed) {
            elements.loadingTimeElapsed.textContent = `Elapsed: ${formattedElapsed}`;
        }

        // Accurate Organic Progress Bar Easing Curve:
        // From 0 to estimatedSec: rises smoothly from 0% to ~85%
        // Beyond estimatedSec: asymptotically approaches 96%
        let percent = 0;
        if (elapsedSec < estimatedSec) {
            const ratio = elapsedSec / estimatedSec;
            percent = 85 * (1 - Math.pow(1 - ratio, 2.5));
        } else {
            const extraSec = elapsedSec - estimatedSec;
            percent = 85 + (11 * (1 - Math.exp(-extraSec / 45)));
        }
        percent = Math.min(96, Math.max(0, percent));

        if (elements.loadingProgressBar) {
            elements.loadingProgressBar.style.width = `${percent.toFixed(1)}%`;
        }
        if (elements.loadingProgressPercent) {
            elements.loadingProgressPercent.textContent = `${Math.round(percent)}%`;
        }

        // Dynamic stage messaging
        if (elements.loadingProgressStageText) {
            if (elapsedSec < 2) {
                elements.loadingProgressStageText.textContent = 'Connecting to Gemini 3.5 Flash-Lite...';
            } else if (elapsedSec < estimatedSec * 0.5) {
                elements.loadingProgressStageText.textContent = 'Analyzing material & formulating questions...';
            } else if (elapsedSec < estimatedSec) {
                elements.loadingProgressStageText.textContent = 'Structuring choices, answers & explanations...';
            } else if (elapsedSec < THREE_MINUTES_SEC) {
                elements.loadingProgressStageText.textContent = 'Finalizing quiz format with Gemini...';
            } else {
                elements.loadingProgressStageText.textContent = 'Still processing... Gemini may be under high traffic.';
            }
        }

        // 3-Minute Milestone: Reveal delayed action button to cancel and copy prompt
        if (elapsedSec >= THREE_MINUTES_SEC && elements.loadingDelayContainer && elements.loadingDelayContainer.classList.contains('hidden')) {
            elements.loadingDelayContainer.classList.remove('hidden');
        }

        // 10-Minute Timeout Auto-Cancel Safeguard
        if (elapsedSec >= TEN_MINUTES_SEC) {
            clearInterval(state.aiGenerationInterval);
            state.aiGenerationInterval = null;
            if (state.aiGenerationAbortController) {
                state.aiGenerationAbortController.abort();
            }
            showToast('Generation timed out after 10 minutes. Switched to manual prompt copy.', 6000, 'warning');
            cancelNodalAiGenerationAndCopyPrompt(config, fileName, true);
        }
    }, 100);

    try {
        const { requestQuizFromVercel, cleanAndParseQuizJson } = await import('../aiService.js');
        const targetCount = config.count || 10;

        let parsedQuiz = null;
        let currentPrompt = systemPrompt;
        let jsonAttempt = 0;
        const maxJsonAttempts = 2; // Up to 2 retries (total 3 attempts)

        // --- STAGE 1: REQUEST & PARSE WITH AUTOMATED RETRY FOR INVALID JSON ---
        while (jsonAttempt <= maxJsonAttempts) {
            try {
                const rawResponseText = await requestQuizFromVercel(currentPrompt, '', state.aiGenerationAbortController.signal);
                parsedQuiz = cleanAndParseQuizJson(rawResponseText, fileName, config);
                break; // Successfully parsed!
            } catch (err) {
                // If user aborted or model is deprecated, do not retry
                if (err.name === 'AbortError' || err.isDeprecated) {
                    throw err;
                }

                jsonAttempt++;
                if (jsonAttempt > maxJsonAttempts) {
                    throw err; // Retries exhausted, bubble up to main error handler
                }

                console.warn(`Attempt ${jsonAttempt} failed to return valid JSON. Retrying generation...`, err);
                if (elements.loadingProgressStageText) {
                    elements.loadingProgressStageText.textContent = `AI returned an invalid format. Asking AI to regenerate valid quiz format (Attempt ${jsonAttempt + 1} of ${maxJsonAttempts + 1})...`;
                }
                showToast('AI response was malformed. Asking AI to regenerate valid quiz format...', 4000, 'warning');

                // Strengthen prompt with explicit instruction for retry
                currentPrompt = systemPrompt + "\n\nCRITICAL RETRY INSTRUCTION: Your previous response was invalid JSON and failed parsing. You MUST respond with ONLY a single raw valid JSON object matching the schema. Do NOT include markdown code blocks, backticks, comments, or any preambles.";
            }
        }

        if (!parsedQuiz || !Array.isArray(parsedQuiz.questions) || parsedQuiz.questions.length === 0) {
            throw new Error('AI response did not contain any valid quiz questions.');
        }

        // --- STAGE 2: HANDLE EXTRA QUESTIONS (TRIM TO STRICT USER INPUT) ---
        if (parsedQuiz.questions.length > targetCount) {
            console.log(`Trimming extra questions: AI returned ${parsedQuiz.questions.length}, trimming to requested ${targetCount}`);
            if (elements.loadingProgressStageText) {
                elements.loadingProgressStageText.textContent = `Adjusting questions to match exact requested count (${targetCount})...`;
            }
            parsedQuiz.questions = parsedQuiz.questions.slice(0, targetCount);
        }

        // --- STAGE 3: HANDLE MISSING QUESTIONS (ASK AI TO GENERATE REMAINING) ---
        let missingAttempt = 0;
        const maxMissingAttempts = 2;

        while (parsedQuiz.questions.length < targetCount && missingAttempt < maxMissingAttempts) {
            missingAttempt++;
            const missingCount = targetCount - parsedQuiz.questions.length;
            console.log(`Quiz has ${parsedQuiz.questions.length}/${targetCount} questions. Requesting ${missingCount} missing questions...`);

            if (elements.loadingTitle) {
                elements.loadingTitle.textContent = 'Generating Missing Questions...';
            }
            if (elements.loadingProgressStageText) {
                elements.loadingProgressStageText.textContent = `AI generated ${parsedQuiz.questions.length} of ${targetCount} questions. Asking AI for ${missingCount} more unique questions (Attempt ${missingAttempt})...`;
            }
            showToast(`AI generated ${parsedQuiz.questions.length}/${targetCount} questions. Asking AI for ${missingCount} more unique questions...`, 5000, 'info');

            // Build non-duplication prompt containing the full list of existing questions
            const existingQuestionsList = parsedQuiz.questions.map((q, idx) => `${idx + 1}. ${q.question}`).join('\n');
            const missingPrompt = `System Prompt: Additional Quiz Questions Generator

Role & Task:
You previously generated ${parsedQuiz.questions.length} questions for a quiz, but the user requested ${targetCount} questions.
You must now generate EXACTLY ${missingCount} MORE unique questions to complete the quiz based on the source text reviewer below.

CRITICAL NON-DUPLICATION REQUIREMENT:
The following questions have ALREADY been generated. DO NOT duplicate, rephrase, or create questions similar to any of these:
${existingQuestionsList}

Difficulty Level: ${config.difficulty || 'Easy'}
Items Needed: EXACTLY ${missingCount} unique questions.

Follow the exact same JSON schema:
{
  "questions": [
    ...
  ]
}
Output ONLY 100% valid JSON.

----------------------------------------
Source Text / Reviewer:
${state.fileContent || ''}`;

            try {
                const rawMissingResponse = await requestQuizFromVercel(missingPrompt, '', state.aiGenerationAbortController.signal);
                const parsedMissing = cleanAndParseQuizJson(rawMissingResponse, fileName, config);

                if (parsedMissing.questions && parsedMissing.questions.length > 0) {
                    const existingNormTexts = new Set(parsedQuiz.questions.map(q => (q.question || '').trim().toLowerCase()));
                    const newUnique = parsedMissing.questions.filter(q => {
                        const norm = (q.question || '').trim().toLowerCase();
                        return norm.length > 0 && !existingNormTexts.has(norm);
                    });

                    if (newUnique.length > 0) {
                        parsedQuiz.questions.push(...newUnique);
                        console.log(`Recovered ${newUnique.length} unique questions. Total now: ${parsedQuiz.questions.length}/${targetCount}`);
                    } else {
                        console.warn('AI returned duplicate questions during missing questions recovery.');
                    }
                }
            } catch (missingErr) {
                console.warn('Missing questions recovery attempt failed:', missingErr);
                if (missingErr.name === 'AbortError' || missingErr.isDeprecated) throw missingErr;
            }
        }

        // Final trim if recovery generated more than targetCount
        if (parsedQuiz.questions.length > targetCount) {
            parsedQuiz.questions = parsedQuiz.questions.slice(0, targetCount);
        }

        // Smoothly snap progress to 100%
        clearInterval(state.aiGenerationInterval);
        state.aiGenerationInterval = null;

        if (elements.loadingProgressBar) elements.loadingProgressBar.style.width = '100%';
        if (elements.loadingProgressPercent) elements.loadingProgressPercent.textContent = '100%';
        if (elements.loadingProgressStageText) elements.loadingProgressStageText.textContent = 'Quiz ready! Launching...';

        // Update application state
        state.questions = parsedQuiz.questions;
        state.currentQuizConfig = { ...config, ...parsedQuiz.config, count: state.questions.length };
        state.currentFileName = parsedQuiz.fileName || fileName;

        // Save generated quiz to database
        const newKey = 'quiz_' + Date.now();
        state.currentQuizKey = newKey;
        saveQuizToDB(newKey, {
            questions: state.questions,
            fileName: state.currentFileName,
            config: state.currentQuizConfig
        });

        refreshHistory();

        // RECORD COOLDOWN EVENT STRICTLY UPON SUCCESSFUL GENERATION
        const { recordGenerationEvent } = await import('../helpers.js');
        await recordGenerationEvent();

        // Smooth transition into quiz
        setTimeout(async () => {
            const { startQuiz } = await import('./quizExecution.js');
            startQuiz();
        }, 350);

    } catch (error) {
        clearInterval(state.aiGenerationInterval);
        state.aiGenerationInterval = null;

        // If user cancelled, stop cleanly
        if (error.name === 'AbortError') {
            return;
        }

        console.error('Nodal AI Generation Error:', error);

        const isDeprecation = error.isDeprecated || 
            /deprecated|no longer available|shut down|retired|models\/.*is not found/i.test(error.message || '');

        const { customConfirm } = await import('../helpers.js');

        const dialogTitle = isDeprecation 
            ? 'AI Provider Deprecated / Unavailable' 
            : 'AI Generation Failed';

        const dialogMessage = isDeprecation
            ? `The built-in AI quiz generation engine is currently unavailable because the configured AI model has been retired by Google.\n\nPlease contact the developer to update the website's AI model configuration.\n\nIn the meantime, you can continue generating your quiz immediately by copying the prompt to use with ChatGPT or Claude:`
            : `Generation failed: ${error.message || 'Server error'}\n\nWould you like to copy the prompt to use with ChatGPT or Claude instead?`;

        const userChoseCopy = await customConfirm(
            dialogMessage,
            dialogTitle,
            'Copy Prompt to Other AI',
            'Return Home',
            true
        );

        if (userChoseCopy) {
            cancelNodalAiGenerationAndCopyPrompt(config, fileName, true);
        } else {
            showView('start', false);
            window.history.replaceState({ view: 'start' }, '', '#home');
        }
    }
}

export function cancelNodalAiGeneration() {
    if (state.aiGenerationInterval) {
        clearInterval(state.aiGenerationInterval);
        state.aiGenerationInterval = null;
    }
    if (state.aiGenerationAbortController) {
        try { state.aiGenerationAbortController.abort(); } catch (e) {}
        state.aiGenerationAbortController = null;
    }
    if (state.currentQuizConfig?.isRemedial) {
        showView('results', false);
        window.history.replaceState({ view: 'results' }, '', '#results');
        import('./quizResults.js').then(m => m.openRemedialSetupModal(false, false));
        return;
    }
    showView('start', false);
    window.history.replaceState({ view: 'start' }, '', '#home');
}

export function cancelNodalAiGenerationAndCopyPrompt(config = state.currentQuizConfig, fileName = state.currentFileName, showNotice = false) {
    if (state.aiGenerationInterval) {
        clearInterval(state.aiGenerationInterval);
        state.aiGenerationInterval = null;
    }
    if (state.aiGenerationAbortController) {
        try { state.aiGenerationAbortController.abort(); } catch (e) {}
        state.aiGenerationAbortController = null;
    }
    if (config?.isRemedial) {
        showView('results', false);
        window.history.replaceState({ view: 'results' }, '', '#results');
    } else {
        showView('start', false);
        window.history.replaceState({ view: 'start' }, '', '#home');
    }
    openAiPromptModal(config, fileName, showNotice);
}
