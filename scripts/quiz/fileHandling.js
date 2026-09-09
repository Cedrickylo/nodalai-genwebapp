import { elements, state, constants } from '../state.js';
import { resetAdvancedOptions } from './quizUtils.js';
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
    hideLoadingOverlay,
    updateResumeButtonVisibility,
    handleCustomTypeChange,
    closePasteJsonModal,
    closeImportChoiceModal
} from '../helpers.js';

export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
    'pdf', 'docx', 'doc', 'pptx', 'ppt', 'txt', 'md', 'rtf', 'odt', 'csv', 'html'
]);

export function isDocumentFile(file) {
    if (!file || !file.name) return false;
    const ext = file.name.split('.').pop().toLowerCase();
    return ALLOWED_DOCUMENT_EXTENSIONS.has(ext);
}

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

// Delegate scrolling inside selected files container to the files list if overflowing
if (selectedFilesContainerLocal && selectedFilesListLocal) {
    selectedFilesContainerLocal.addEventListener('wheel', (e) => {
        if (selectedFilesListLocal.scrollHeight > selectedFilesListLocal.clientHeight) {
            if (e.deltaY !== 0) {
                selectedFilesListLocal.scrollTop += e.deltaY;
                e.preventDefault();
            }
        }
    }, { passive: false });
}

// Setup Drag & Drop exclusively on the homepage
export function setupHomeDragAndDrop() {
    const dragOverlay = document.getElementById('home-drag-overlay');
    let dragCounter = 0;

    function isHomePageActive() {
        return Boolean(
            elements.views?.start &&
            elements.views.start.classList.contains('active') &&
            !document.body.classList.contains('quiz-active')
        );
    }

    function hasFiles(e) {
        if (!e.dataTransfer || !e.dataTransfer.types) return false;
        return Array.from(e.dataTransfer.types).includes('Files');
    }

    window.addEventListener('dragenter', (e) => {
        if (!isHomePageActive() || !hasFiles(e)) return;
        e.preventDefault();
        dragCounter++;
        if (dragOverlay) dragOverlay.classList.remove('hidden');
    });

    window.addEventListener('dragover', (e) => {
        if (!isHomePageActive() || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (dragOverlay && dragOverlay.classList.contains('hidden')) {
            dragOverlay.classList.remove('hidden');
        }
    });

    window.addEventListener('dragleave', (e) => {
        if (!isHomePageActive()) return;
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            if (dragOverlay) dragOverlay.classList.add('hidden');
        }
    });

    window.addEventListener('drop', async (e) => {
        if (!isHomePageActive() || !hasFiles(e)) return;
        e.preventDefault();
        dragCounter = 0;
        if (dragOverlay) dragOverlay.classList.add('hidden');

        const files = e.dataTransfer.files;
        if (!files || files.length === 0) return;

        // Check if customize section is already open and has files
        const customizeSection = document.getElementById('customize-section');
        const isCustomizeOpen = customizeSection && !customizeSection.classList.contains('hidden');
        const isAddMore = Boolean(isCustomizeOpen && Array.isArray(state.currentFiles) && state.currentFiles.length > 0);

        await handleFileSelect({
            target: {
                files: files,
                id: isAddMore ? 'add-more-files-input' : 'file-upload-input',
                value: ''
            }
        });
    });
}

// Initialize homepage drag-and-drop
setupHomeDragAndDrop();

// Helper to extract text from modern PowerPoint (.pptx) files
async function extractTextFromPPTX(arrayBuffer) {
    if (typeof JSZip === 'undefined') {
        throw new Error('PPTX parser (JSZip) is not available.');
    }
    const zip = await JSZip.loadAsync(arrayBuffer);
    const slidePaths = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name));
    
    if (slidePaths.length === 0) {
        throw new Error('No presentation slides found in this .pptx file.');
    }

    // Sort slide paths numerically (slide1, slide2, slide10...)
    slidePaths.sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/i)[1], 10);
        const numB = parseInt(b.match(/slide(\d+)\.xml/i)[1], 10);
        return numA - numB;
    });

    const parser = new DOMParser();
    const slidesText = [];

    for (const path of slidePaths) {
        const xmlText = await zip.files[path].async('text');
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        // In OpenXML presentations, text elements are <a:t>
        const textNodes = xmlDoc.getElementsByTagName('a:t');
        const slideStrings = [];
        for (let i = 0; i < textNodes.length; i++) {
            const val = textNodes[i].textContent?.trim();
            if (val) slideStrings.push(val);
        }
        if (slideStrings.length > 0) {
            const slideNum = path.match(/slide(\d+)\.xml/i)[1];
            slidesText.push(`[Slide ${slideNum}]\n${slideStrings.join(' ')}`);
        }
    }

    if (slidesText.length === 0) {
        throw new Error('Could not extract readable text from presentation slides.');
    }

    return slidesText.join('\n\n');
}

// Fallback helper for legacy binary .ppt files
async function extractTextFromPPTLegacy(file) {
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let extracted = '';
    let currentWord = '';
    
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
            currentWord += String.fromCharCode(b);
        } else {
            if (currentWord.trim().length >= 4) {
                extracted += currentWord.trim() + ' ';
            }
            currentWord = '';
        }
    }
    if (currentWord.trim().length >= 4) {
        extracted += currentWord.trim() + ' ';
    }
    
    const cleanText = extracted.replace(/\s+/g, ' ').trim();
    if (cleanText.length < 20) {
        throw new Error('Legacy .ppt file contains insufficient readable text. For best results, please save your presentation as .pptx or export to PDF.');
    }
    return cleanText;
}

// Fallback helper for legacy binary .doc files
async function extractTextFromDocLegacy(file) {
    const ab = await file.arrayBuffer();
    const bytes = new Uint8Array(ab);
    let extracted = '';
    let currentWord = '';
    
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
            currentWord += String.fromCharCode(b);
        } else {
            if (currentWord.trim().length >= 3) {
                extracted += currentWord.trim() + ' ';
            }
            currentWord = '';
        }
    }
    if (currentWord.trim().length >= 3) {
        extracted += currentWord.trim() + ' ';
    }
    
    const cleanText = extracted.replace(/\s+/g, ' ').trim();
    if (cleanText.length < 20) {
        throw new Error('Legacy .doc file contains insufficient readable text. For best results, please save your document as .docx or export to PDF.');
    }
    return cleanText;
}

// In-memory text extraction cache so existing documents are resolved in 0ms when adding more files
const fileTextCache = new WeakMap();

async function extractTextFromFile(file) {
    if (fileTextCache.has(file)) {
        return fileTextCache.get(file);
    }
    const ext = file.name.split('.').pop().toLowerCase();
    let txt = '';

    if (['txt','md','html','js','css','py','java','c','cpp','cs','php','rb','go','rs','swift','kt','xml','json','rtf','odt','csv'].includes(ext)) {
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
    } else if (ext === 'pptx') {
        const ab = await file.arrayBuffer();
        txt = await extractTextFromPPTX(ab);
    } else if (ext === 'ppt') {
        txt = await extractTextFromPPTLegacy(file);
    } else if (ext === 'doc') {
        txt = await extractTextFromDocLegacy(file);
    } else {
        txt = await file.text();
    }

    fileTextCache.set(file, txt);
    return txt;
}

// Render the selected files list with full original filenames, responsive text wrapping, and delete buttons
export function renderSelectedFilesList() {
    if (!state.currentFiles || state.currentFiles.length === 0) {
        selectedFilesListLocal.innerHTML = '';
        return;
    }
    selectedFilesListLocal.innerHTML = state.currentFiles
        .map((f, idx) => {
            return `<li class="flex items-start gap-2 group w-full min-w-0 py-1.5 border-b border-gray-700/40 last:border-b-0">
                <button class="delete-file-btn text-red-400 hover:text-red-300 font-bold text-lg transition flex-shrink-0 leading-none mt-0.5" data-file-index="${idx}" title="Delete this file">×</button>
                <div class="min-w-0 flex-1 py-0.5">
                    <span class="text-gray-300 text-xs break-words whitespace-normal block leading-relaxed" title="${f.name}">• ${f.name}</span>
                </div>
            </li>`;
        })
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
        showToast('All documents removed.', 2000, 'neutral');
        return;
    }
    
    // Re-render the list
    renderSelectedFilesList();
    
    // Update file content by re-processing remaining files
    showLoadingOverlay('Updating Documents...', `Re-processing ${state.currentFiles.length} remaining document(s)...`);
    state.fileContent = '';
    state.fileHash = '';
    validateAllInputs();
    
    // Re-process all remaining files using fast memory cache
    try {
        let combinedText = '';
        for (const file of state.currentFiles) {
            const txt = await extractTextFromFile(file);
            combinedText += `\n[SOURCE: ${file.name}]\n${txt}\n`;
        }
        
        if (combinedText.trim().length < 10) {
            throw new Error('Not enough text extracted.');
        }
        
        state.fileContent = combinedText;
        state.fileHash = CryptoJS.SHA256(state.fileContent).toString();
        
        // Update header display
        if (fileNameDisplay) {
            fileNameDisplay.textContent = state.currentFiles.length === 1
                ? state.currentFiles[0].name
                : `${state.currentFiles.length} Documents Selected`;
        }

        // Update the file name if needed (strictly capped at 35 characters for quiz name)
        if (state.currentFiles.length === 1 && !editQuizNameInput?.value?.trim()) {
            const rawName = state.currentFiles[0].name;
            state.currentFileName = rawName.length > 35 ? rawName.slice(0, 35) : rawName;
            editQuizNameInput.value = state.currentFileName;
        }
        validateAllInputs();
        hideLoadingOverlay();
        showToast(`"${fileName}" removed.`, 2000, 'neutral');
    } catch (err) {
        console.error('File processing error:', err);
        hideLoadingOverlay();
        showToast(`Error: ${err.message}`, 4000, 'error');
        state.fileContent = '';
    }
}

export async function handleFileSelect(event) {
    const fileNameDisplay = document.getElementById('file-name');

    const files = event.target?.files;
    if (!files || files.length === 0) {
        return;
    }

    const rawFiles = Array.from(files);
    const invalidFiles = rawFiles.filter(f => !isDocumentFile(f));
    if (invalidFiles.length > 0) {
        const invalidNames = invalidFiles.map(f => f.name).join(', ');
        showToast(`Only document files are allowed (.pdf, .docx, .doc, .pptx, .ppt, .txt, .md, .rtf, .odt, .csv, .html). Skipped: ${invalidNames}`, 4500, 'warning');
    }

    const validFiles = rawFiles.filter(f => isDocumentFile(f));
    if (validFiles.length === 0) {
        if (event.target) event.target.value = '';
        return;
    }

    const isAddMore = event.target?.id === 'add-more-files-input';

    if (!isAddMore) {
        resetAdvancedOptions();
    }

    showLoadingOverlay(
        'Processing Documents...',
        isAddMore ? 'Extracting and appending additional documents...' : 'Extracting text and analyzing documents...'
    );

    try {
        const newFiles = validFiles;

        // If clicking "Add More", append new files to existing files (prevent duplicate entries)
        if (isAddMore && Array.isArray(state.currentFiles) && state.currentFiles.length > 0) {
            const filesToAppend = newFiles.filter(nf => 
                !state.currentFiles.some(ef => ef.name === nf.name && ef.size === nf.size && ef.lastModified === nf.lastModified)
            );
            state.currentFiles = [...state.currentFiles, ...filesToAppend];
        } else {
            state.currentFiles = newFiles;
        }

        let combinedText = '';
        for (const file of state.currentFiles) {
            const txt = await extractTextFromFile(file);
            combinedText += `\n[SOURCE: ${file.name}]\n${txt}\n`;
        }

        if (combinedText.trim().length < 10) {
            throw new Error('Not enough text extracted.');
        }

        state.fileContent = combinedText;
        state.fileHash = CryptoJS.SHA256(state.fileContent).toString();
        
        // Maintain custom quiz name if user previously typed one; otherwise default to first file name (max 35 chars)
        const existingCustomName = editQuizNameInput?.value?.trim();
        if (!existingCustomName || !isAddMore) {
            const rawFileName = state.currentFiles.length === 1 
                ? state.currentFiles[0].name 
                : (state.currentFiles[0]?.name || 'Combined Quiz');
            state.currentFileName = rawFileName.length > 35 ? rawFileName.slice(0, 35) : rawFileName;
            if (editQuizNameInput) {
                editQuizNameInput.value = state.currentFileName;
            }
        }

        if (fileNameDisplay) {
            const displayHeaderName = state.currentFiles.length === 1 
                ? state.currentFiles[0].name
                : `${state.currentFiles.length} Documents Selected`;
            fileNameDisplay.textContent = displayHeaderName;
        }

        if (selectedFilesContainerLocal) selectedFilesContainerLocal.classList.remove('hidden');
        if (renameContainer) renameContainer.classList.remove('hidden');
        const customizeSection = document.getElementById('customize-section');
        const customizeContent = document.getElementById('customize-content');
        if (customizeSection) customizeSection.classList.remove('hidden');
        if (customizeContent) customizeContent.classList.remove('hidden');
        elements.cancelCustomizeBtn?.classList.remove('hidden');
        updateResumeButtonVisibility();
        setHistoryVisibility(false);

        // Ensure quiz configuration selectors are visible and clean for new generation
        document.getElementById('quiz-custom-summary-banner')?.remove();
        document.getElementById('quiz-type-group')?.classList.remove('hidden');
        document.getElementById('ui-mode-group')?.classList.remove('hidden');
        document.getElementById('question-count-group')?.classList.remove('hidden');
        document.getElementById('difficulty-group')?.classList.remove('hidden');
        handleCustomTypeChange();

        renderSelectedFilesList();

        // Reset input value so selecting the same document again can fire change
        if (event.target) event.target.value = '';
        
        // Ensure generate button unlocks context properly
        const generateBtn = document.getElementById('generate-quiz-btn');
        if (generateBtn) generateBtn.disabled = false;

        validateAllInputs();
        pushSubState('#customize');

        hideLoadingOverlay();
        showToast(isAddMore ? 'Additional documents added successfully!' : 'Documents processed successfully!', 3000, 'success');

    } catch (err) {
        console.error("Document analysis break:", err);
        hideLoadingOverlay();
        showToast(`Error: ${err.message || 'Failed to read document scope'}`, 4000, 'error');
    }
}

export function resetAppFiles() {
    clearSubState('#customize');
    state.fileContent = '';
    state.fileHash = '';
    state.currentFileName = '';
    state.currentFiles = [];
    if (fileUploadInput) fileUploadInput.value = '';
    if (addMoreFilesInputLocal) addMoreFilesInputLocal.value = '';
    if (fileNameDisplay) fileNameDisplay.textContent = 'Select Documents';
    if (statusMessage) {
        statusMessage.textContent = '';
        statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
    }
    renameContainer?.classList.add('hidden');
    selectedFilesContainerLocal?.classList.add('hidden');
    if (elements.selectedFilesContainer) elements.selectedFilesContainer.classList.add('hidden');
    document.getElementById('selected-files-container')?.classList.add('hidden');
    if (selectedFilesListLocal) selectedFilesListLocal.innerHTML = '';
    if (elements.selectedFilesList) elements.selectedFilesList.innerHTML = '';
    fileActionsDiv?.classList.remove('hidden');
    elements.cancelCustomizeBtn?.classList.add('hidden');
    setHistoryVisibility(true);
    document.getElementById('customize-section')?.classList.add('hidden');
    document.getElementById('customize-content')?.classList.add('hidden');
    resetAdvancedOptions();
    validateAllInputs();
    window.history.replaceState({ view: 'start' }, '', '#home');
    updateResumeButtonVisibility();
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

                if (type === 'true-or-false' || type === 'tf' || (options.length === 2 && options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())))) {
                    type = 'true-or-false';
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
            const rawImportedName = data.fileName || file.name || 'Imported Quiz';
            state.currentFileName = rawImportedName.length > 35 ? rawImportedName.slice(0, 35) : rawImportedName;
            state.currentQuizKey = importedId;
            state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
            state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
            state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
            state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;

            const { saveQuizToDB, refreshHistory, closeAiPromptModal, closePasteJsonModal, closeImportChoiceModal, syncHistoryWithCloud } = await import('../helpers.js');
            if (typeof closeAiPromptModal === 'function') closeAiPromptModal(true);
            if (typeof closePasteJsonModal === 'function') closePasteJsonModal(true);
            if (typeof closeImportChoiceModal === 'function') closeImportChoiceModal(true);

            saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });

            // Restore takes and statistics if bundled in the imported JSON
            if (Array.isArray(data.takes) && data.takes.length > 0) {
                const takesDbKey = constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1';
                let allTakes = {};
                try {
                    const raw = localStorage.getItem(takesDbKey);
                    allTakes = raw ? JSON.parse(raw) : {};
                } catch (e) {
                    allTakes = {};
                }
                const existing = Array.isArray(allTakes[state.currentQuizKey]) ? allTakes[state.currentQuizKey] : [];
                const merged = [...existing];
                data.takes.forEach(newTake => {
                    const newId = newTake.id || newTake.takeId;
                    const newTime = newTake.completedAt || newTake.timestamp;
                    const exists = merged.some(t => {
                        const tId = t.id || t.takeId;
                        const tTime = t.completedAt || t.timestamp;
                        if (newId && tId && newId === tId) return true;
                        if (newTime && tTime && newTime === tTime) return true;
                        return false;
                    });
                    if (!exists) merged.push(newTake);
                });
                merged.sort((a, b) => (a.completedAt || a.timestamp || 0) - (b.completedAt || b.timestamp || 0));
                merged.forEach((t, idx) => { t.takeNumber = idx + 1; });
                allTakes[state.currentQuizKey] = merged;
                localStorage.setItem(takesDbKey, JSON.stringify(allTakes));
            }
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

export async function importQuizFromText(rawText) {
    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
        showToast('Please paste valid quiz JSON text.', 3000, 'warning');
        return false;
    }

    showLoadingOverlay('Importing Quiz...', 'Parsing pasted quiz JSON text...');

    try {
        const { cleanAndParseQuizJson } = await import('../aiService.js');
        const data = cleanAndParseQuizJson(rawText, 'Pasted Quiz');
        
        if (!data?.questions?.length) {
            throw new Error('No valid questions found in pasted JSON.');
        }

        // Check if raw text also had takes
        let takes = [];
        try {
            let cleaned = rawText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
            const firstBrace = cleaned.indexOf('{');
            const lastBrace = cleaned.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                const parsedObj = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
                if (Array.isArray(parsedObj?.takes)) {
                    takes = parsedObj.takes;
                }
            }
        } catch (e) {}

        const normalizedQuestions = (data.questions || []).map(q => {
            let answer = q.answer;
            if (typeof answer === 'boolean') {
                answer = answer ? 'True' : 'False';
            } else if (typeof answer === 'string') {
                answer = answer.trim();
            }

            let type = (q.type || 'multiple-choice').toString().trim().toLowerCase();
            let options = Array.isArray(q.options) ? [...q.options] : [];

            if (type === 'true-or-false' || type === 'tf' || (options.length === 2 && options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())))) {
                type = 'true-or-false';
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

        const importedId = data.quizId || CryptoJS.SHA256(JSON.stringify(normalizedQuestions) + JSON.stringify(config) + (data.fileName || 'Pasted Quiz')).toString();

        if (state.quizHistory[importedId]) {
            hideLoadingOverlay();
            const importAnyway = await customConfirm(
                'A similar quiz already exists in your history. Do you want to import it anyway? (This will overwrite the existing one)',
                'Duplicate Detected',
                'Overwrite & Import',
                'Cancel'
            );
            
            if (!importAnyway) {
                statusMessage.textContent = 'Import cancelled.';
                statusMessage.className = 'text-center text-gray-400 mt-4 text-sm h-5';
                return false;
            }
            showLoadingOverlay('Importing Quiz...', 'Saving quiz to history...');
        }

        state.questions = normalizedQuestions;
        if (!config.uiMode) {
            config.uiMode = document.querySelector('input[name="ui_mode"]:checked')?.value || 'modern';
        }
        state.currentQuizConfig = config;
        const rawImportedName = data.fileName || 'Pasted Quiz';
        state.currentFileName = rawImportedName.length > 35 ? rawImportedName.slice(0, 35) : rawImportedName;
        state.currentQuizKey = importedId;
        state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
        state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
        state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
        state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;

        const { saveQuizToDB, refreshHistory, closeAiPromptModal, closePasteJsonModal, closeImportChoiceModal, syncHistoryWithCloud } = await import('../helpers.js');
        if (typeof closeAiPromptModal === 'function') closeAiPromptModal(true);
        if (typeof closePasteJsonModal === 'function') closePasteJsonModal(true);
        if (typeof closeImportChoiceModal === 'function') closeImportChoiceModal(true);

        saveQuizToDB(state.currentQuizKey, { questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig });

        if (Array.isArray(takes) && takes.length > 0) {
            const takesDbKey = constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1';
            let allTakes = {};
            try {
                const raw = localStorage.getItem(takesDbKey);
                allTakes = raw ? JSON.parse(raw) : {};
            } catch (e) {
                allTakes = {};
            }
            const existing = Array.isArray(allTakes[state.currentQuizKey]) ? allTakes[state.currentQuizKey] : [];
            const merged = [...existing];
            takes.forEach(newTake => {
                const newId = newTake.id || newTake.takeId;
                const newTime = newTake.completedAt || newTake.timestamp;
                const exists = merged.some(t => {
                    const tId = t.id || t.takeId;
                    const tTime = t.completedAt || t.timestamp;
                    if (newId && tId && newId === tId) return true;
                    if (newTime && tTime && newTime === tTime) return true;
                    return false;
                });
                if (!exists) merged.push(newTake);
            });
            merged.sort((a, b) => (a.completedAt || a.timestamp || 0) - (b.completedAt || b.timestamp || 0));
            merged.forEach((t, idx) => { t.takeNumber = idx + 1; });
            allTakes[state.currentQuizKey] = merged;
            localStorage.setItem(takesDbKey, JSON.stringify(allTakes));
        }

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
        return true;
    } catch (err) {
        console.error('Text Import Err:', err);
        hideLoadingOverlay();
        showView('start', false);
        statusMessage.textContent = `Import Err: ${err.message}`;
        statusMessage.className = 'text-center text-red-400 mt-4 text-sm h-5';
        showToast(`Import failed: ${err.message}`, 4000, 'error');
        return false;
    }
}

export async function resumeQuiz(savedData) {
    state.questions = savedData.questions;
    state.currentQuizConfig = { ...savedData.config };
    if (state.currentQuizConfig.manualReveal !== undefined) {
        if (state.currentQuizConfig.showAnswersInSummaryOnly === undefined) {
            state.currentQuizConfig.showAnswersInSummaryOnly = !!state.currentQuizConfig.manualReveal;
        }
        delete state.currentQuizConfig.manualReveal;
    }
    state.currentQuizKey = savedData.key;
    state.currentFileName = savedData.fileName;
    state.score = savedData.score;
    state.userAnswers = savedData.answers;
    state.shuffledIndices = savedData.shuffledIndices;
    state.shuffledOptionsMap = savedData.shuffledOptionsMap || {};
    state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
    state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
    state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
    state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;
    state.currentAttempts = savedData.currentAttempts || 0;
    state.currentShuffledIndexPos = savedData.shuffledIndexPos || 0;
    state.answeredOriginalIndices = new Set(savedData.answeredIndices || []);
    state.skippedOriginalIndices = new Set(savedData.skippedIndices || []);
    state.currentSkippedItemIndex = savedData.skippedIndexPos || 0;
    state.inSkippedRound = savedData.inSkippedRound || false;
    state.currentSkippedArray = state.inSkippedRound ? Array.from(state.skippedOriginalIndices) : [];
    
    state.currentQuestionIndex = savedData.currentQuestionIndex !== undefined ? savedData.currentQuestionIndex : (savedData.shuffledIndexPos || 0);
    state.isReviewingUnanswered = savedData.isReviewingUnanswered || false;
    
    state.isQuizCompleted = false;
    showView('quiz');
    const isSummaryOnly = !!state.currentQuizConfig?.showAnswersInSummaryOnly;
    if (elements.muteSoundBtn) {
        elements.muteSoundBtn.classList.toggle('hidden', isSummaryOnly);
    }
    if (isSummaryOnly && elements.modernScoreStats) {
        elements.modernScoreStats.classList.add('hidden');
        elements.modernScoreStats.classList.remove('flex');
    }
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
        const { findExactQuizForSharedLink, findExistingQuizForSharedLink, extractShareId, openSharedQuizModal } = await import('../helpers.js');
        const shareId = extractShareId(publicUrl);

        // 1. Early local check: Check if user already has this exact quiz saved in history
        const earlyExact = findExactQuizForSharedLink(shareId, publicUrl);

        if (!navigator.onLine) {
            if (earlyExact) {
                // Offline, but the user has already saved this quiz in their account!
                state.pendingSharedQuiz = {
                    questions: earlyExact.quiz.questions,
                    config: earlyExact.quiz.config,
                    fileName: earlyExact.quiz.fileName || 'Shared Quiz',
                    shareId: shareId,
                    shareUrl: publicUrl,
                    existingKey: earlyExact.key,
                    existingQuiz: earlyExact.quiz,
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
            if (earlyExact) {
                hideLoadingOverlay();
                state.pendingSharedQuiz = {
                    questions: earlyExact.quiz.questions,
                    config: earlyExact.quiz.config,
                    fileName: earlyExact.quiz.fileName || 'Shared Quiz',
                    shareId: shareId,
                    shareUrl: publicUrl,
                    existingKey: earlyExact.key,
                    existingQuiz: earlyExact.quiz,
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

            const effectiveShareId = data.shareId || shareId;
            // If link expired, check if user already has it saved in their account
            const existingMatch = earlyExact || findExactQuizForSharedLink(effectiveShareId, publicUrl) || findExistingQuizForSharedLink(effectiveShareId, publicUrl, data.q);
            if (existingMatch) {
                hideLoadingOverlay();
                state.pendingSharedQuiz = {
                    questions: existingMatch.quiz.questions,
                    config: existingMatch.quiz.config,
                    fileName: existingMatch.quiz.fileName || 'Shared Quiz',
                    shareId: effectiveShareId,
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
        
        const effectiveShareId = data.shareId || shareId;

        // 4. Check if this shared quiz is already saved in the user's account (strict exact match)
        const exactMatch = earlyExact || findExactQuizForSharedLink(effectiveShareId, publicUrl);

        // 5. Stage the shared quiz for user action modal selection
        state.pendingSharedQuiz = {
            questions: data.q,
            config: data.c,
            fileName: data.n || 'Shared Quiz',
            shareId: effectiveShareId,
            shareUrl: publicUrl,
            existingKey: exactMatch ? exactMatch.key : null,
            existingQuiz: exactMatch ? exactMatch.quiz : null,
            isAlreadySaved: !!exactMatch
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
