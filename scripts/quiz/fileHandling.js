import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    setupCustomizeView,
    customConfirm,
    validateAllInputs,
    loadGenerationCooldownState,
    getGenerationCooldownWarning,
    setHistoryVisibility,
    pushSubState,
    clearSubState,
    showLoadingOverlay,
    hideLoadingOverlay
} from '../helpers.js';

const {
    fileUploadInput,
    addMoreFilesInput,
    fileNameDisplay,
    statusMessage,
    fileActionsDiv,
    editQuizNameInput,
    renameContainer,
    selectedFilesContainer,
    selectedFilesList,
    clearFilesBtn,
    importQuizInput
} = elements;

// New elements queried locally to prevent overwriting your main state.js
const selectedFilesContainerLocal = document.getElementById('selected-files-container');
const selectedFilesListLocal = document.getElementById('selected-files-list');
const addMoreFilesInputLocal = document.getElementById('add-more-files-input');
const clearFilesBtnLocal = document.getElementById('clear-files-btn');

// Handle clear files button click
if (clearFilesBtnLocal) {
    clearFilesBtnLocal.addEventListener('click', async () => {
        const confirmed = await customConfirm(
            'Are you sure you want to clear the selected files? This action cannot be undone.',
            'Clear Files',
            'Clear',
            'Cancel',
            true // true makes the button red (destructive)
        );

        if (confirmed) {
            resetAppFiles();
        }
    });
}

// Render the selected files list with delete buttons
export function renderSelectedFilesList() {
    if (!state.currentFiles || state.currentFiles.length === 0) {
        selectedFilesListLocal.innerHTML = '';
        return;
    }
    selectedFilesListLocal.innerHTML = state.currentFiles
        .map((f, idx) => `<li class="flex items-center gap-2 group"><button class="delete-file-btn text-red-400 hover:text-red-300 font-bold text-lg transition flex-shrink-0" data-file-index="${idx}" title="Delete this file">×</button><span class="truncate">• ${f.name}</span></li>`)
        .join('');
    
    // Attach delete handlers
    selectedFilesListLocal.querySelectorAll('.delete-file-btn').forEach(btn => {
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
        resetAppFiles();
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
    // FIX: Look up statusMessage directly from live layout context to avoid undefined errors
    const statusMsg = document.getElementById('status-message');
    const fileNameDisplay = document.getElementById('file-name');
    
    if (statusMsg) {
        statusMsg.textContent = 'Analyzing and processing documents...';
        statusMsg.className = 'text-center text-blue-400 mt-4 text-sm h-5 animate-pulse';
    }

    const files = event.target.files;
    if (!files || files.length === 0) {
        if (statusMsg) statusMsg.textContent = '';
        return;
    }

    try {
        state.currentFiles = Array.from(files);
        let combinedText = '';
        let names = [];

        for (const file of files) {
            names.push(file.name);
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
        state.currentFileName = files.length === 1 ? files[0].name : (files[0]?.name || 'Combined Quiz');

        if (fileNameDisplay) {
            fileNameDisplay.textContent = files.length === 1 ? files[0].name : `${files.length} Documents Selected`;
        }

        if (selectedFilesContainerLocal) selectedFilesContainerLocal.classList.remove('hidden');
        if (renameContainer) renameContainer.classList.remove('hidden');
        const customizeSection = document.getElementById('customize-section');
        const customizeContent = document.getElementById('customize-content');
        if (customizeSection) customizeSection.classList.remove('hidden');
        if (customizeContent) customizeContent.classList.remove('hidden');
        elements.cancelCustomizeBtn?.classList.remove('hidden');
        setHistoryVisibility(false);

        // Ensure quiz configuration selectors are visible and clean for new generation
        document.getElementById('quiz-custom-summary-banner')?.remove();
        document.getElementById('quiz-type-group')?.classList.remove('hidden');
        document.getElementById('ui-mode-group')?.classList.remove('hidden');
        document.getElementById('question-count-group')?.classList.remove('hidden');
        document.getElementById('difficulty-group')?.classList.remove('hidden');

        renderSelectedFilesList();

        if (editQuizNameInput && state.currentFileName) {
            editQuizNameInput.value = state.currentFileName;
        }

        if (statusMsg) {
            statusMsg.textContent = 'Documents processed successfully!';
            statusMsg.className = 'text-center text-green-400 mt-4 text-sm h-5';
        }
        
        // Ensure generate button unlocks context properly
        const generateBtn = document.getElementById('generate-quiz-btn');
        if (generateBtn) generateBtn.disabled = false;

        validateAllInputs();
        pushSubState('#customize');

    } catch (err) {
        console.error("Document analysis break:", err);
        if (statusMsg) {
            statusMsg.textContent = `Error: ${err.message || 'Failed to read document scope'}`;
            statusMsg.className = 'text-center text-red-400 mt-4 text-sm h-5';
        }
    }
}

function resetAppFiles() {
    clearSubState('#customize');
    state.fileContent = '';
    state.fileHash = '';
    state.currentFileName = '';
    state.currentFiles = [];
    fileUploadInput.value = '';
    addMoreFilesInputLocal.value = '';
    fileNameDisplay.textContent = 'Select Documents';
    statusMessage.textContent = '';
    statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    renameContainer.classList.add('hidden');
    selectedFilesContainerLocal.classList.add('hidden');
    selectedFilesListLocal.innerHTML = '';
    fileActionsDiv.classList.remove('hidden');
    elements.cancelCustomizeBtn?.classList.add('hidden');
    setHistoryVisibility(true);
    document.getElementById('customize-section')?.classList.add('hidden');
    document.getElementById('customize-content')?.classList.add('hidden');
    validateAllInputs();
    window.history.replaceState({ view: 'start' }, '', '#home');
}

export function handleQuizImport(event) {
    const file = event.target.files[0];
    if (!file || !file.name.endsWith('.json')) {
        showToast('Requires .json', 3000, 'error');
        return;
    }

    showLoadingOverlay('Importing Quiz...', `Reading "${file.name}"...`);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data?.questions?.length || !data.config || !data.questions.every(q => q?.question && (q.answer !== undefined && q.answer !== null && q.answer !== ''))) {
                throw new Error('Invalid quiz JSON structure.');
            }

            // Normalize questions and boolean answers
            const normalizedQuestions = data.questions.map(q => {
                let answer = q.answer;
                if (typeof answer === 'boolean') {
                    answer = answer ? 'True' : 'False';
                } else if (typeof answer === 'string') {
                    answer = answer.trim();
                }

                let type = q.type || 'multiple-choice';
                let options = Array.isArray(q.options) ? [...q.options] : [];

                if (type === 'true-or-false' || (options.length === 2 && options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())))) {
                    type = 'multiple-choice';
                    options = ['True', 'False'];
                }

                return {
                    ...q,
                    type,
                    options,
                    answer,
                    explanation: q.explanation || ''
                };
            });

            // Normalize config time and counts
            const config = { ...data.config };
            if (config.isTimed && config.totalTime) {
                if (config.totalTime <= 120) {
                    config.totalTime = config.totalTime * 60;
                }
            }

            if (config.tf === undefined) {
                const tfQuestionsCount = normalizedQuestions.filter(q => 
                    q.type === 'true-or-false' || 
                    (Array.isArray(q.options) && q.options.length === 2 && q.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())))
                ).length;
                config.tf = tfQuestionsCount;
                if (config.mc !== undefined && config.mc >= config.tf && config.tf > 0) {
                    config.mc = config.mc - config.tf;
                }
            }

            const importedId = data.quizId || CryptoJS.SHA256(JSON.stringify(normalizedQuestions) + JSON.stringify(config) + (data.fileName || file.name)).toString();
            
            if (state.quizHistory[importedId]) {
                hideLoadingOverlay();
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
                showLoadingOverlay('Importing Quiz...', `Saving "${file.name}"...`);
            }

            state.questions = normalizedQuestions;
            if (!config.uiMode) {
                config.uiMode = document.querySelector('input[name="ui_mode"]:checked')?.value || 'modern';
            }
            state.currentQuizConfig = config;
            state.currentFileName = data.fileName || file.name;
            state.currentQuizKey = importedId;
            state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
            state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
            state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
            state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;

            const { saveQuizToDB, refreshHistory, closeAiPromptModal, syncHistoryWithCloud } = await import('../helpers.js');
            if (typeof closeAiPromptModal === 'function') closeAiPromptModal(true);

            saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });
            if (typeof puter !== 'undefined' && window.puter && puter.auth && puter.auth.isSignedIn() && navigator.onLine) {
                try {
                    await syncHistoryWithCloud(false);
                } catch (syncErr) {
                    console.warn("Import sync warning:", syncErr);
                }
            }
            refreshHistory();

            state.customizingQuizData = { ...state.quizHistory[state.currentQuizKey], key: state.currentQuizKey };
            setupCustomizeView(state.currentQuizConfig, state.currentFileName);
            showView('start', false);
            pushSubState('#edit');
            hideLoadingOverlay();
            showToast(`Imported "${state.currentFileName}" successfully!`, 3000, 'success');
            statusMessage.textContent = '';
        } catch (err) {
            console.error('Import Err:', err);
            hideLoadingOverlay();
            showView('start', false);
            statusMessage.textContent = `Import Err: ${err.message}`;
            statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
            showToast(`Import failed: ${err.message}`, 4000, 'error');
        } finally {
            importQuizInput.value = '';
        }
    };
    reader.onerror = () => {
        hideLoadingOverlay();
        showView('start', false);
        statusMessage.textContent = 'Read file error.';
        statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        showToast('Failed to read quiz file.', 3000, 'error');
        importQuizInput.value = '';
    };
    reader.readAsText(file);
}

export async function resumeQuiz(savedData) {
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
    
    state.currentQuestionIndex = savedData.currentQuestionIndex !== undefined ? savedData.currentQuestionIndex : (savedData.shuffledIndexPos || 0);
    state.isReviewingUnanswered = savedData.isReviewingUnanswered || false;
    
    showView('quiz');
    const { updateAttemptDisplay, displayNextQuestion, displayCurrentQuestion, startQuizTimer, stopQuizTimer } = await import('./quizExecution.js');
    updateAttemptDisplay();
    if (state.currentQuizConfig?.uiMode !== 'classic') {
        displayCurrentQuestion();
    } else {
        displayNextQuestion();
    }
    if (state.isTimedQuiz) {
        const resumeTime = savedData.timeRemaining !== undefined ? savedData.timeRemaining : state.totalQuizTime;
        startQuizTimer(resumeTime);
    } else {
        stopQuizTimer();
    }
}

export async function loadSharedQuiz(publicUrl) {
    try {
        const shareId = publicUrl.split('/').pop().split('?')[0];

        // 1. Early local check: Check if user already has this quiz saved in history
        const { findExistingQuizForSharedLink, openSharedQuizModal } = await import('../helpers.js');
        const earlyExisting = findExistingQuizForSharedLink(shareId, publicUrl);

        if (!navigator.onLine) {
            if (earlyExisting) {
                // Offline, but the user has already saved this quiz in their account!
                state.pendingSharedQuiz = {
                    questions: earlyExisting.quiz.questions,
                    config: earlyExisting.quiz.config,
                    fileName: earlyExisting.quiz.fileName || 'Shared Quiz',
                    shareId: shareId,
                    shareUrl: publicUrl,
                    existingKey: earlyExisting.key,
                    existingQuiz: earlyExisting.quiz,
                    isAlreadySaved: true
                };
                openSharedQuizModal();
                return;
            } else {
                throw new Error("You are offline. Cannot load new shared quizzes.");
            }
        }

        showLoadingOverlay('Opening Shared Quiz...', 'Retrieving quiz data from cloud...');
        
        // 2. Fetch the data from the Puter public URL
        let data = null;
        try {
            const response = await fetch(publicUrl);
            if (!response.ok) throw new Error("Link is invalid or has been removed.");
            data = await response.json();
        } catch (fetchErr) {
            // If fetch failed, but the user already has this quiz locally in their account:
            if (earlyExisting) {
                hideLoadingOverlay();
                state.pendingSharedQuiz = {
                    questions: earlyExisting.quiz.questions,
                    config: earlyExisting.quiz.config,
                    fileName: earlyExisting.quiz.fileName || 'Shared Quiz',
                    shareId: shareId,
                    shareUrl: publicUrl,
                    existingKey: earlyExisting.key,
                    existingQuiz: earlyExisting.quiz,
                    isAlreadySaved: true
                };
                openSharedQuizModal();
                return;
            }
            throw fetchErr;
        }
        
        // 3. Expiration Validation Logic
        if (data.expiryTimestamp && Date.now() > data.expiryTimestamp) {
            try {
                await puter.fs.unlink(publicUrl.split('/').pop().split('?')[0]);
            } catch (err) {
                console.warn("Cleanup of expired file failed (already deleted?)");
            }

            // If link expired, check if user already has it saved in their account
            const existingMatch = earlyExisting || findExistingQuizForSharedLink(shareId, publicUrl, data.q);
            if (existingMatch) {
                hideLoadingOverlay();
                state.pendingSharedQuiz = {
                    questions: existingMatch.quiz.questions,
                    config: existingMatch.quiz.config,
                    fileName: existingMatch.quiz.fileName || 'Shared Quiz',
                    shareId: shareId,
                    shareUrl: publicUrl,
                    existingKey: existingMatch.key,
                    existingQuiz: existingMatch.quiz,
                    isAlreadySaved: true
                };
                showToast('Shared link expired, but this quiz is saved in your library.', 4000, 'info');
                openSharedQuizModal();
                return;
            }
            throw new Error("This shared link has expired.");
        }

        if (!data.q || !data.c) {
            throw new Error("Shared quiz file data is corrupted or invalid.");
        }
        
        // 4. Check if this shared quiz is already saved in the user's account
        const existingMatch = earlyExisting || findExistingQuizForSharedLink(shareId, publicUrl, data.q);

        // 5. Stage the shared quiz for user action modal selection
        state.pendingSharedQuiz = {
            questions: data.q,
            config: data.c,
            fileName: data.n || 'Shared Quiz',
            shareId: shareId,
            shareUrl: publicUrl,
            existingKey: existingMatch ? existingMatch.key : null,
            existingQuiz: existingMatch ? existingMatch.quiz : null,
            isAlreadySaved: !!existingMatch
        };

        hideLoadingOverlay();

        // 6. Open the shared quiz 3-option choice modal
        openSharedQuizModal();
        
    } catch (e) {
        console.error('Shared Link Error:', e);
        hideLoadingOverlay();
        showToast(e.message || 'Error loading shared quiz.', 4000, 'error');
        elements.statusMessage.textContent = '';
    }
}
