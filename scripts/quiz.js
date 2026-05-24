import { elements, state, constants } from './state.js';
import { generateQuestionsFromAI } from './aiService.js';
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
    clearHistory,
    customConfirm,
    loadGenerationCooldownState,
    getGenerationCooldownWarning,
    recordGenerationEvent,
    refreshCooldownPanel,
    syncHistoryWithCloud,
    openShareModal, 
    closeShareModal, 
    navigateToShareStep, 
    exportQuizAsJSON
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
    deleteCustomizeBtn,
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
    remedialAttemptLimitInput,
    startSubtitle,
    fileActionsDiv,
    editQuizNameInput,
    renameContainer
} = elements;

// New elements queried locally to prevent overwriting your main state.js
const selectedFilesContainer = document.getElementById('selected-files-container');
const selectedFilesList = document.getElementById('selected-files-list');
const addMoreFilesInput = document.getElementById('add-more-files-input');
const remedialQuizNameInput = document.getElementById('remedial-quiz-name');
const clearFilesBtn = document.getElementById('clear-files-btn');

// Handle clear files button click
if (clearFilesBtn) {
    clearFilesBtn.addEventListener('click', async () => {
        const confirmed = await customConfirm(
            'Are you sure you want to clear the selected files? This action cannot be undone.',
            'Clear Files',
            'Clear',
            'Cancel',
            true // true makes the button red (destructive)
        );

        if (confirmed) {
            resetApp();
        }
    });
}

const { MAX_GENERATION_ATTEMPTS, IN_PROGRESS_QUIZ_KEY } = constants;

// Render the selected files list with delete buttons
function renderSelectedFilesList() {
    if (!state.currentFiles || state.currentFiles.length === 0) {
        selectedFilesList.innerHTML = '';
        return;
    }
    selectedFilesList.innerHTML = state.currentFiles
        .map((f, idx) => `<li class="flex items-center gap-2 group"><button class="delete-file-btn text-red-400 hover:text-red-300 font-bold text-lg transition flex-shrink-0" data-file-index="${idx}" title="Delete this file">×</button><span class="truncate">• ${f.name}</span></li>`)
        .join('');
    
    // Attach delete handlers
    selectedFilesList.querySelectorAll('.delete-file-btn').forEach(btn => {
        btn.addEventListener('click', handleDeleteFile);
    });
    
    // Hide file-actions div when documents are selected
    fileActionsDiv.classList.add('hidden');
}

// Handle file deletion with confirmation
async function handleDeleteFile(event) {
    event.stopPropagation();
    const fileIndex = parseInt(event.target.getAttribute('data-file-index'), 10);
    const fileName = state.currentFiles[fileIndex]?.name || 'this file';
    
    const confirmed = await customConfirm(`Remove "${fileName}" from the list?`);
    if (!confirmed) return;
    
    // Remove the file from currentFiles
    state.currentFiles.splice(fileIndex, 1);
    
    // If no files left, reset the UI
    if (state.currentFiles.length === 0) {
        resetApp();
        return;
    }
    
    // Re-render the list
    renderSelectedFilesList();
    
    // Update file content by re-processing remaining files
    statusMessage.textContent = `Analyzing ${state.currentFiles.length} document(s)...`;
    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    state.fileContent = '';
    state.fileHash = '';
    validateAllInputs();
    
    // Re-process all files
    try {
        let combinedText = '';
        for (const file of state.currentFiles) {
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
        state.fileHash = CryptoJS.SHA256(state.fileContent).toString();
        statusMessage.textContent = 'Documents ready!';
        statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';
        
        // Update the file name if needed
        if (state.currentFiles.length === 1) {
            state.currentFileName = state.currentFiles[0].name;
            editQuizNameInput.value = state.currentFileName;
        }
        validateAllInputs();
    } catch (err) {
        console.error('File processing error:', err);
        statusMessage.textContent = `Error: ${err.message}`;
        statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        state.fileContent = '';
    }
}

export async function handleFileSelect(event) {
    if (state.isCustomizingHistory) resetStartViewUI();

    const isAddMore = event.target.id === 'add-more-files-input';
    const newFiles = Array.from(event.target.files || []);

    if (!newFiles.length && !isAddMore) {
        resetApp();
        return;
    }

    if (isAddMore) {
        state.currentFiles = [...(state.currentFiles || []), ...newFiles];
    } else {
        state.currentFiles = newFiles;
        editQuizNameInput.value = '';
    }

    if (!state.currentFiles || state.currentFiles.length === 0) return;

    // UI Updates for the accumulated files
    selectedFilesContainer.classList.remove('hidden');
    renderSelectedFilesList();
    fileNameDisplay.textContent = 'Clear & upload new files';
    
    // Auto-generate generic name based on file count if not explicitly set
    if (!editQuizNameInput.value || editQuizNameInput.value === 'Select Documents' || editQuizNameInput.value.includes('Documents Combined')) {
        state.currentFileName = state.currentFiles.length > 1 ? `${state.currentFiles.length} Documents Combined` : state.currentFiles[0].name;
        editQuizNameInput.value = state.currentFileName;
    }

    statusMessage.textContent = `Analyzing ${state.currentFiles.length} document(s)...`;
    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    state.fileContent = '';
    state.fileHash = '';
    validateAllInputs();

    try {
        let combinedText = '';
        for (const file of state.currentFiles) {
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
        state.fileHash = CryptoJS.SHA256(state.fileContent).toString();
        statusMessage.textContent = 'Documents ready!';
        statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';
        
        renameContainer.classList.remove('hidden');

        document.getElementById('customize-section').classList.remove('hidden');
        document.getElementById('customize-content').classList.remove('hidden');
        document.getElementById('customize-toggle-icon').classList.add('rotate-180');

        cancelCustomizeBtn.classList.remove('hidden');
        generateQuizBtn.disabled = false;
        resumeQuizBtn.classList.add('hidden'); // Hide resume while dropdown is open
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

export async function handleQuizGeneration(isRemedial = false, skipStart = false) {
    // 1. CUSTOMIZATION CHECK
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

    // 2. UI PARSING & MATH LOGIC
    const qCountInput = isRemedial ? remedialQuestionCountInput : questionCountInput;
    const diffSelector = isRemedial ? 'input[name="remedial_difficulty"]:checked' : 'input[name="difficulty"]:checked';
    const timeToggle = isRemedial ? remedialTimeLimitToggle : timeLimitToggle;
    const attemptToggle = isRemedial ? remedialAttemptLimitToggle : attemptLimitToggle;
    const summaryToggle = isRemedial ? document.getElementById('remedial-summary-only-toggle') : summaryOnlyToggle;
    const mainCustTypeSelect = isRemedial ? remedialCustomQuestionTypeSelect : customQuestionTypeSelect;

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

    await loadGenerationCooldownState();
    const cooldownWarning = getGenerationCooldownWarning();
    if (cooldownWarning) {
        showToast(cooldownWarning, 7000, 'error');
        if (!isRemedial) showView('start');
        return;
    }

    if (isRemedial) {
        state.currentFileName = remedialQuizNameInput.value.trim() || (state.currentFileName + ' - Remedial');
    } else if (!state.isCustomizingHistory) {
        state.currentFileName = editQuizNameInput.value.trim() || state.currentFileName;
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
        setTimeout(() => {
            handleHistoryClick({ target: { tagName: 'BUTTON', dataset: { key: state.currentQuizKey, action: 'load' } } });
        }, 1000);
        return;
    }

    showView('loading');
    startLoadingAnimation();

    // CLEAR THE INTERVAL TIMER IMMEDIATELY
    // Stops "Contacting AI..." ticker from wiping out your progress reports
    if (state.loadingInterval) {
        clearInterval(state.loadingInterval);
        state.loadingInterval = null;
    }

    // 4. CUSTOM JSON PARSER (Kept Intact)
    function extractJsonArrayString(text) {
        const normalized = (typeof text === 'string' ? text : '').replace(/```json/gi, '').replace(/```/g, '').trim();
        if (!normalized) return '';
        if (normalized[0] === '[') return normalized;

        const start = normalized.indexOf('[');
        if (start === -1) return normalized;

        let depth = 0, inString = false, escaped = false;
        for (let i = start; i < normalized.length; i++) {
            const char = normalized[i];
            if (escaped) { escaped = false; continue; }
            if (char === '\\') { escaped = true; continue; }
            if (char === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (char === '[') depth++;
            else if (char === ']') {
                depth--;
                if (depth === 0) return normalized.slice(start, i + 1).trim();
            }
        }
        return normalized;
    }

    // =====================================================================
    // 5. THE NEW BATCHING, EXACT PADDING & ADVANCED RECOVERY logic
    // =====================================================================
    let allQs = [];
    let qSet = new Set();
    const baseBatchSize = 5; 
    let batchCounter = 1;
    let apiCallCount = 0;
    const maxSafetyCalls = 30; 

    // Time estimation constants
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

            // Default progress rendering block
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

            // Define allowed types to ensure consistency
            const allowedTypes = ['multiple-choice', 'identification', 'enumeration'];

            const sysP = `You are a strict JSON-only quiz generator.
            1. Output ONLY a valid JSON array.
            2. For each question, the "type" MUST be exactly one of: ${JSON.stringify(allowedTypes)}.
            3. DO NOT include markdown, explanations outside the JSON, or conversational filler.
            4. Each object MUST contain: "type", "question", "options" (for multiple-choice only, null for others), "answer", and "explanation".
            5. For "identification" type, "answer" should be a simple string.
            6. For "enumeration" type, "answer" should be an array of strings.`;

            // Pass the specific breakdown to the AI so it knows what to generate
            const userQ = `Document: """${state.fileContent.substring(0, 8000)}"""
            Generate exactly ${neededForBatch} questions based on this document.
            Ensure the mix reflects: 
            - Multiple Choice: ${Math.round(neededForBatch * (mc/totalQ))}
            - Identification: ${Math.round(neededForBatch * (id/totalQ))}
            - Enumeration: ${Math.round(neededForBatch * (en/totalQ))}
            Output only the JSON array.`;

            apiCallCount++;
            let currentBatchSuccess = false;
            let singleBatchAttempts = 0;
            const maxAllowedRetries = 3; // Strict 3 retry cap limit configuration

            while (!currentBatchSuccess) {
                try {
                    // Force checking if this run is an active recovery retry loop sequence
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
                                        Server is still processing, please wait 30 seconds...
                                    </p>
                                    <div class="w-full bg-gray-800 rounded-full h-2 overflow-hidden border border-gray-700 mt-3">
                                        <div class="bg-yellow-500 h-2 rounded-full animation-pulse w-full"></div>
                                    </div>
                                </div>
                            `;
                        }
                        // Pause application run thread execution path for exactly 30 seconds
                        await new Promise(r => setTimeout(r, 30000));
                    }

                    const rawText = await generateQuestionsFromAI(sysP, userQ);
                    const cleanJson = extractJsonArrayString(rawText);
                    
                    const parsed = JSON.parse(cleanJson);
                    if (!Array.isArray(parsed)) throw new Error("Not an array");

                    parsed.forEach(q => {
                        if (q && q.question && q.answer && q.type && !qSet.has(q.question)) {
                            allQs.push(q);
                            qSet.add(q.question);
                        }
                    });
                    currentBatchSuccess = true;
                    batchCounter++;
                } catch (e) {
                    singleBatchAttempts++;
                    console.warn(`Batch ${batchCounter} error context on attempt ${singleBatchAttempts}:`, e.message);
                    
                    // If 3 retries are exceeded (meaning 4 total attempts failed), crash intentionally to cancel
                    if (singleBatchAttempts > maxAllowedRetries) {
                        throw new Error("SERVER_LIMIT_EXCEEDED");
                    }
                }
            }

            if (allQs.length < totalQ) {
                console.log("Cooling down token pool...");
                await new Promise(r => setTimeout(r, 15500)); 
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

        // 6. FINAL SAVE LOGIC
        state.questions = allQs;
        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
        
        if (typeof recordGenerationEvent === 'function') await recordGenerationEvent();
        if (typeof refreshCooldownPanel === 'function') await refreshCooldownPanel();
        
        refreshHistory();
        startQuiz();

    } catch (err) {
        // INTERCEPT FAILURE AND PRESENT CUSTOM PROMISE INTERFACE WINDOW
        if (err.message === "SERVER_LIMIT_EXCEEDED") {
            await customConfirm(
                "Quiz generation has been canceled because the AI server is completely overloaded and too many request limits were reached. Please wait a few minutes and try again later.",
                "Generation Canceled",
                "Understand",
                ""
            );
        } else {
            // General parsing framework recovery alert fallback logic
            await customConfirm(
                `Quiz generation failed due to a processing structure breakdown: ${err.message}`,
                "Process Failure",
                "Back to Menu",
                ""
            );
        }
        
        if (statusMessage) {
            statusMessage.textContent = `Err: Generation stopped due to rate limits.`;
        }
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

    const questionType = (qData.type || '').toString().trim().toLowerCase();
    if (!['multiple-choice', 'identification', 'enumeration'].includes(questionType)) {
        console.error("AI generated an invalid question type:", questionType);
        // Maybe default to identification or skip
    }

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
    const questionType = (qData.type || '').toString().trim().toLowerCase();
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
    } else if (questionType  === 'identification') {
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
    }
    else {
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

    // Pre-fill Remedial Title Name
    remedialQuizNameInput.value = (state.currentFileName || 'Quiz') + ' - Remedial';

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
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data?.questions?.length || !data.config || !data.questions.every(q => q?.question && q.answer && q.explanation)) {
                throw new Error('Invalid format.');
            }

            const importedId = data.quizId || CryptoJS.SHA256(JSON.stringify(data.questions) + JSON.stringify(data.config) + (data.fileName || file.name)).toString();
            
            if (state.quizHistory[importedId]) {
                const importAnyway = await customConfirm(
                    'A similar quiz already exists in your history. Do you want to import it anyway? (This will overwrite the existing one)',
                    'Duplicate Detected',
                    'Overwrite & Import',
                    'Cancel'
                );
                
                if (!importAnyway) {
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

async function generateShareableLink(quizKey) {
    const quiz = state.quizHistory[quizKey];
    if (!quiz) return;

    // Cache original loading template messages so we can restore them later
    const originalTitle = elements.loadingTitle ? elements.loadingTitle.textContent : 'Generating Quiz...';
    const originalMessage = elements.loadingMessage ? elements.loadingMessage.textContent : 'Contacting AI...';

    try {
        // =====================================================================
        // STEP 1: Hide the modal immediately so it doesn't block the loader screen
        // =====================================================================
        if (elements.shareModal) {
            elements.shareModal.classList.add('hidden');
        }

        // Trigger the loading view screen and display custom sharing context text
        showView('loading');
        if (elements.loadingTitle) elements.loadingTitle.textContent = 'Link Share Creation';
        if (elements.loadingMessage) elements.loadingMessage.textContent = 'Please wait, generating link...';

        // 2. Get expiry duration from the dropdown
        const days = parseInt(elements.shareExpirySelect.value);
        const expiryTimestamp = Date.now() + (days * 24 * 60 * 60 * 1000);
        
        // 3. Prepare payload with metadata
        const shareId = 'quiz-' + Math.random().toString(36).substring(2, 10) + '.json';
        const sharePayload = { 
            n: quiz.fileName, 
            c: quiz.config, 
            q: quiz.questions,
            expiryTimestamp: expiryTimestamp
        };
        
        // 4. Save to Puter filesystem
        await puter.fs.write(shareId, JSON.stringify(sharePayload));
        
        // 5. Generate public access URL
        const publicUrl = await puter.fs.getReadURL(shareId);
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(publicUrl)}`;
        
        // 6. Update local state and commit persistence matrices
        quiz.share = {
            isShared: true,
            shareId: shareId,
            shareUrl: shareUrl,
            expiryTimestamp: expiryTimestamp
        };
        // ADD THIS LINE: Updates individual quiz timestamp for sync tracking
        quiz.timestamp = Date.now();

        localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
        localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());
        
        // 7. Sync history changes with Puter cloud profiles
        await syncHistoryWithCloud();
        refreshHistory();
        
        // 8. Populate management fields for Step 2 UI view transition
        elements.shareLinkInput.value = shareUrl;
        elements.shareExpiryDisplay.textContent = `Expires in ${days} days`;
        elements.shareExpiryDisplay.className = 'text-xs text-blue-300 mt-1';
        
        // =====================================================================
        // STEP 2: Re-reveal the share modal now that the link text is ready!
        // =====================================================================
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
        navigateToShareStep('manage');
        showToast('Link generated!', 3000, 'success');
        
    } catch (err) {
        console.error('Generation Error:', err);
        showToast('Failed to generate link.', 4000, 'error');
        // Bring back the menu if an error occurs so the user isn't stuck
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
    } finally {
        // Clean up the text configurations so standard AI generations don't show the share notice
        if (elements.loadingTitle) elements.loadingTitle.textContent = originalTitle;
        if (elements.loadingMessage) elements.loadingMessage.textContent = originalMessage;
        
        // Return background view focus back to main dashboard layer
        showView('start');
    }
}

export async function handleHistoryClick(e) {
    // Find the closest button element, even if the user clicked the inner SVG icon or text span
    const btn = e.target.closest('button');
    if (!btn) return;

    const key = btn.dataset.key;
    const action = btn.dataset.action;
    const quizData = state.quizHistory[key];
    if (!quizData) return;

    if (action === 'load') {
        if (state.savedProgress?.key === key && (state.savedProgress.shuffledIndexPos < state.savedProgress.shuffledIndices?.length || state.savedProgress.inSkippedRound)) {
            const doResume = await customConfirm(
                'Do you want to resume where you left off, or start over from the beginning?',
                'Resume Quiz',
                'Resume',
                'Start Over'
            );
            if (doResume) {
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
    } else if (action === 'share') {
        // Store the key of the quiz we are currently interacting with
        state.currentShareQuizKey = key;
        
        // Open the share modal seamlessly
        openShareModal(key);
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
    
    // =====================================================================
    // ADD THIS LOGIC TO RESET FIELDS AND INPUTS ON CANCELLATION/RESET
    // =====================================================================
    questionCountInput.value = '10';
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
    // =====================================================================

    validateAllInputs();
    
    // =====================================================================
    // RESTORE LAYOUT CONTROLS AND DISPLAY STATE
    // =====================================================================
    document.getElementById('quiz-custom-summary-banner')?.remove();

    const countGroup = document.getElementById('question-count-group') || questionCountInput.closest('.mb-4, .space-y-4, div');
    const diffGroup = document.getElementById('difficulty-group') || 
                      document.querySelector('.difficulty-section') || 
                      difficultyRadios[0]?.closest('.mb-6, .mb-4, .space-y-4, div');

    if (countGroup) countGroup.classList.remove('hidden');
    if (diffGroup) diffGroup.classList.remove('hidden');
    
    // Reset structural interaction restrictions back to standard execution configurations
    questionCountInput.readOnly = false;
    questionCountInput.classList.remove('locked-input');
    
    difficultyRadios.forEach(radio => {
        radio.disabled = false;
        radio.closest('div')?.querySelector('label')?.classList.remove('locked-label');
    });
    
    customQuestionTypeSelect.disabled = false;
    customQuestionTypeSelect.classList.remove('locked-input');
}

export function attachQuizEventListeners() {
    resumeQuizBtn.addEventListener('click', () => { if (state.savedProgress) resumeQuiz(state.savedProgress); });
    fileUploadInput.addEventListener('change', handleFileSelect);
    addMoreFilesInput.addEventListener('change', handleFileSelect); // Bind Add More button logic
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
    elements.generateShareLinkBtn.onclick = () => generateShareableLink(state.currentShareQuizKey);

    // 2. Copy Link Button
    elements.copyShareLinkBtn.onclick = () => {
        elements.shareLinkInput.select();
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 2000, 'success');
    };

    // 3. Disable Share Button
    elements.disableShareBtn.onclick = async () => {
        const quiz = state.quizHistory[state.currentShareQuizKey];
        if (quiz && quiz.share && quiz.share.shareId) {
            try {
                // Delete from Puter FS
                await puter.fs.delete(quiz.share.shareId);
                
                // Reset metadata
                quiz.share = { isShared: false };

                quiz.timestamp = Date.now();

                // =====================================================================
                // FIX: Save state & update timestamp so cloud removes the file link copy
                // =====================================================================
                localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
                localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());
                // =====================================================================

                await syncHistoryWithCloud();
                
                refreshHistory();
                closeShareModal();
                showToast('Sharing disabled.', 3000, 'info');
            } catch (err) {
                console.error('Disable Error:', err);
                showToast('Failed to disable sharing.', 3000, 'error');
            }
        }
    };

    // 4. Modal Navigation & Closing
    elements.closeShareModalBtn.onclick = closeShareModal;
    elements.shareMenuLinkBtn.onclick = () => navigateToShareStep('config');
    elements.shareMenuExportBtn.onclick = () => {
        exportQuizAsJSON(state.currentShareQuizKey);
        closeShareModal();
    };
    elements.shareBackBtn.onclick = () => navigateToShareStep('menu');
    
    
    homeBtn.addEventListener('click', async () => { 
        if (await customConfirm('Save progress and return to the home screen?', 'Return Home', 'Save & Exit', 'Cancel')) {
            saveAndGoHome(); 
        }
    });
    
    saveQuizBtn.addEventListener('click', saveCurrentQuiz);
    historyList.addEventListener('click', handleHistoryClick);
    clearHistoryBtn.addEventListener('click', clearHistory);
    syncCloudBtn.addEventListener('click', () => syncHistoryWithCloud(true));
    timeLimitToggle.addEventListener('change', handleTimeToggle);
    timePresetRadios.forEach(r => r.addEventListener('change', handleTimePresetChange));
    customTimeLimitInput.addEventListener('input', validateAllInputs);
    attemptLimitToggle.addEventListener('change', handleAttemptToggle);
    attemptLimitInput.addEventListener('input', validateAllInputs);
    
    elements.cancelCustomizeBtn.addEventListener('click', async () => {
        if (hasUnsavedChanges() && state.isCustomizingHistory) {
            const wantsToSave = await customConfirm(
                'You have unsaved changes! Do you want to save them before exiting?\n\n• OK = Save changes\n• Cancel = Discard changes',
                'Unsaved Changes',
                'Save Changes',
                'Discard',
                false
            );
            
            if (wantsToSave) {
                handleQuizGeneration(false, true);
                return;
            }
        }
        resetApp(true);
    });
    deleteCustomizeBtn.addEventListener('click', async () => {
        if (!state.isCustomizingHistory || !state.customizingQuizData) return;

        const confirmed = await customConfirm(
            'Delete this quiz from history? This action cannot be undone.',
            'Delete Quiz',
            'Delete',
            'Cancel',
            true
        );
        if (!confirmed) return;

        delete state.quizHistory[state.customizingQuizData.key];
        localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
        refreshHistory();
        showToast('Quiz deleted.', 3000, 'success');
        resetApp(true);
    });

    document.getElementById('customize-toggle-btn').addEventListener('click', () => {
        const content = document.getElementById('customize-content');
        content.classList.toggle('hidden');
        document.getElementById('customize-toggle-icon').classList.toggle('rotate-180');

        if (!content.classList.contains('hidden')) {
            resumeQuizBtn.classList.add('hidden');
        } else {
            prepareResumeButton();
        }
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
        if (saved && document.getElementById('customize-content').classList.contains('hidden')) {
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

export async function loadSharedQuiz(publicUrl) {
    try {
        elements.statusMessage.textContent = 'Verifying shared quiz...';
        
        // 1. Fetch the data from the Puter public URL
        const response = await fetch(publicUrl);
        if (!response.ok) throw new Error("Link is invalid or has been removed.");
        
        const data = await response.json();
        
        // 2. Expiration Validation Logic
        if (data.expiryTimestamp && Date.now() > data.expiryTimestamp) {
            // Link has expired!
            // Clean up the file from Puter to save space
            try {
                // The publicUrl usually contains the file path; we need the filename
                // This assumes standard Puter URL structure
                await puter.fs.unlink(publicUrl.split('/').pop().split('?')[0]);
            } catch (err) {
                console.warn("Cleanup of expired file failed (already deleted?)");
            }
            throw new Error("This shared link has expired.");
        }
        
        // 3. Load the quiz if valid
        state.questions = data.q;
        state.currentQuizConfig = data.c;
        state.currentFileName = data.n;
        
        // Setup view and toast
        setupCustomizeView(state.currentQuizConfig, state.currentFileName);
        showView('start');
        showToast('Shared quiz loaded successfully!');
        elements.statusMessage.textContent = '';
        
    } catch (e) {
        console.error('Shared Link Error:', e);
        showToast(e.message || 'Error loading shared quiz.', 'error');
        elements.statusMessage.textContent = '';
    }
}