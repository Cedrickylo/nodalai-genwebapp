import { elements, state, constants } from '../state.js';
import {
    showToast,
    showView,
    setupCustomizeView,
    customConfirm,
    validateAllInputs,
    loadGenerationCooldownState,
    getGenerationCooldownWarning,
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
    const isAddMore = event.target.id === 'add-more-files-input';
    const newFiles = Array.from(event.target.files || []);

    if (!newFiles.length && !isAddMore) {
        resetAppFiles();
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
    selectedFilesContainerLocal.classList.remove('hidden');
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

        elements.cancelCustomizeBtn.classList.remove('hidden');
        elements.generateQuizBtn.disabled = false;
        elements.resumeQuizBtn.classList.add('hidden'); // Hide resume while dropdown is open
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

function resetAppFiles() {
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
    validateAllInputs();
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

            const { saveQuizToDB, refreshHistory } = await import('../helpers.js');
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
    const { updateAttemptDisplay, displayNextQuestion, startQuizTimer, stopQuizTimer } = await import('./quizExecution.js');
    updateAttemptDisplay();
    displayNextQuestion();
    if (state.isTimedQuiz) {
        const resumeTime = savedData.timeRemaining !== undefined ? savedData.timeRemaining : state.totalQuizTime;
        startQuizTimer(resumeTime);
    } else {
        stopQuizTimer();
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
