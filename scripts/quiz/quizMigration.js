import { elements, state, constants } from '../state.js';
import { getEncryptedStorageItem, setEncryptedStorageItem } from './quizCrypto.js';
import {
    showToast,
    pushSubState,
    clearSubState,
    refreshHistory,
    syncHistoryWithCloud,
    getQuizTakes,
    closeModalWithAnimation,
    handleDeleteProfile,
    customConfirm
} from '../helpers.js';
import { getExportableOfflineDownloads } from './quizOffline.js';

// ==================================================================
// CRYPTOGRAPHIC SPECIFICATIONS FOR .NODAL PROPRIETARY BACKUP FORMAT
// ==================================================================
const NODAL_MAGIC_HEADER = 'NODAL_ENCRYPTED_BACKUP_V1';
const NODAL_AES_KEY = 'NodalAI_Secure_Migration_Key_2026_@cedrickylo';
export const NODAL_FILE_EXTENSION = '.nodal';

// Active parsed backup staging for import
let stagedImportPayload = null;

// ==================================================================
// UNIFIED MIGRATION POPUP MODAL CONTROLLER
// ==================================================================

/**
 * Opens the unified Data Migration popup modal on the specified step.
 * @param {'choice'|'export'|'import'|'progress'} step 
 * @param {boolean} pushHash 
 */
export function openMigrationModal(step = 'choice', pushHash = true) {
    const modal = document.getElementById('migration-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    navigateToMigrationStep(step);

    if (pushHash) {
        pushSubState('#migration-modal');
    }
}

/**
 * Closes the unified Data Migration popup modal with smooth exit animation.
 * @param {boolean} fromPopState 
 */
export function closeMigrationModal(fromPopState = false) {
    const modal = document.getElementById('migration-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    clearSubState('#migration-modal');

    // Also reset import state if staged
    resetImportStaging();

    closeModalWithAnimation(modal, () => {
        if (!fromPopState && window.location.hash === '#migration-modal') {
            window.history.back();
        } else if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
            window.scrollTo({ top: state.preModalScrollY, behavior: 'instant' });
            state.preModalScrollY = null;
        }
    });
}

/**
 * Navigates between internal steps of the Data Migration popup modal.
 * @param {'choice'|'export'|'import'|'progress'} step 
 */
export function navigateToMigrationStep(step) {
    const stepChoice = document.getElementById('migration-step-choice');
    const stepExport = document.getElementById('migration-step-export');
    const stepImport = document.getElementById('migration-step-import');
    const stepProgress = document.getElementById('migration-step-progress');

    const backBtn = document.getElementById('migration-modal-back-btn');
    const closeBtn = document.getElementById('close-migration-modal-btn');
    const titleEl = document.getElementById('migration-modal-title');
    const subtitleEl = document.getElementById('migration-modal-subtitle');
    const iconEl = document.getElementById('migration-header-icon');

    // Hide all steps
    if (stepChoice) stepChoice.classList.add('hidden');
    if (stepExport) stepExport.classList.add('hidden');
    if (stepImport) stepImport.classList.add('hidden');
    if (stepProgress) stepProgress.classList.add('hidden');

    // Show target step and update headers & dynamic icons
    if (step === 'choice') {
        if (stepChoice) stepChoice.classList.remove('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Migrate Data';
        if (subtitleEl) subtitleEl.textContent = 'Fast domain-to-domain migration';
        if (iconEl) {
            iconEl.className = 'p-2 rounded-xl bg-blue-500/20 text-blue-400 flex-shrink-0';
            iconEl.innerHTML = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8V20M17 20L21 16M17 20L13 16"/></svg>';
        }
    } else if (step === 'export') {
        if (stepExport) stepExport.classList.remove('hidden');
        if (backBtn) backBtn.classList.remove('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Export Data';
        if (subtitleEl) subtitleEl.textContent = 'Package data into encrypted .nodal file';
        if (iconEl) {
            iconEl.className = 'p-2 rounded-xl bg-blue-500/20 text-blue-400 flex-shrink-0';
            iconEl.innerHTML = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
        }
        populateExportItemCounts();
    } else if (step === 'import') {
        if (stepImport) stepImport.classList.remove('hidden');
        if (backBtn) backBtn.classList.remove('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
        if (titleEl) titleEl.textContent = 'Import Data';
        if (subtitleEl) subtitleEl.textContent = 'Restore from .nodal backup file';
        if (iconEl) {
            iconEl.className = 'p-2 rounded-xl bg-green-500/20 text-green-400 flex-shrink-0';
            iconEl.innerHTML = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>';
        }
        resetImportStaging();
    } else if (step === 'progress') {
        if (stepProgress) stepProgress.classList.remove('hidden');
        if (backBtn) backBtn.classList.add('hidden');
        if (closeBtn) closeBtn.classList.add('hidden');
        if (titleEl) titleEl.textContent = 'Data Migration';
        if (subtitleEl) subtitleEl.textContent = 'Transferring data...';
        if (iconEl) {
            iconEl.className = 'p-2 rounded-xl bg-indigo-500/20 text-indigo-400 flex-shrink-0';
            iconEl.innerHTML = '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>';
        }
    }
}

// Backwards compatibility aliases
export const openMigrationChoiceModal = (pushHash = true) => openMigrationModal('choice', pushHash);
export const closeMigrationChoiceModal = (pop = false) => closeMigrationModal(pop);
export const openExportView = () => openMigrationModal('export', true);
export const openImportView = () => openMigrationModal('import', true);

// ==================================================================
// PROGRESS STEP CONTROLLERS
// ==================================================================

export function openMigrationProgressModal(title, initialStatus = 'Preparing...') {
    navigateToMigrationStep('progress');

    const titleEl = document.getElementById('migration-progress-title');
    const statusEl = document.getElementById('migration-progress-status');
    const barEl = document.getElementById('migration-progress-bar');
    const percentEl = document.getElementById('migration-progress-percent');
    const doneBtn = document.getElementById('migration-progress-done-btn');
    const spinner = document.getElementById('migration-progress-spinner');

    if (titleEl) titleEl.textContent = title;
    if (statusEl) statusEl.textContent = initialStatus;
    if (barEl) barEl.style.width = '0%';
    if (percentEl) percentEl.textContent = '0%';
    if (spinner) spinner.classList.remove('hidden');
    if (doneBtn) doneBtn.classList.add('hidden');
}

export function updateMigrationProgress(percent, statusText, isDone = false) {
    const statusEl = document.getElementById('migration-progress-status');
    const barEl = document.getElementById('migration-progress-bar');
    const percentEl = document.getElementById('migration-progress-percent');
    const doneBtn = document.getElementById('migration-progress-done-btn');
    const spinner = document.getElementById('migration-progress-spinner');
    const closeBtn = document.getElementById('close-migration-modal-btn');

    const clamped = Math.min(100, Math.max(0, Math.round(percent)));
    if (barEl) barEl.style.width = `${clamped}%`;
    if (percentEl) percentEl.textContent = `${clamped}%`;
    if (statusEl && statusText) statusEl.textContent = statusText;

    if (isDone) {
        if (spinner) spinner.classList.add('hidden');
        if (doneBtn) doneBtn.classList.remove('hidden');
        if (closeBtn) closeBtn.classList.remove('hidden');
    } else {
        if (spinner) spinner.classList.remove('hidden');
    }
}

export const closeMigrationProgressModal = (pop = false) => closeMigrationModal(pop);

// ==================================================================
// ERROR MODAL CONTROLLER
// ==================================================================

export function showMigrationErrorModal(errorMessage) {
    const modal = document.getElementById('migration-error-modal');
    if (!modal) {
        alert(errorMessage);
        return;
    }
    const msgEl = document.getElementById('migration-error-message');
    if (msgEl) msgEl.textContent = errorMessage;
    modal.classList.remove('hidden');
    pushSubState('#migration-error');
}

export function closeMigrationErrorModal(fromPopState = false) {
    const modal = document.getElementById('migration-error-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    clearSubState('#migration-error');
    closeModalWithAnimation(modal, () => {
        if (!fromPopState && window.location.hash === '#migration-error') {
            window.history.back();
        }
    });
}

// ==================================================================
// EXPORT EXECUTION & SKELETON LOADERS
// ==================================================================

export async function populateExportItemCounts() {
    const skQuizzes = document.getElementById('export-skeleton-quizzes');
    const skTakes = document.getElementById('export-skeleton-takes');
    const skOffline = document.getElementById('export-skeleton-offline');

    const badgeQuizzes = document.getElementById('export-count-quizzes');
    const badgeTakes = document.getElementById('export-count-takes');
    const badgeOffline = document.getElementById('export-count-offline');

    // 1. Show skeleton placeholders, hide badge counts
    if (skQuizzes) skQuizzes.classList.remove('hidden');
    if (badgeQuizzes) badgeQuizzes.classList.add('hidden');

    if (skTakes) skTakes.classList.remove('hidden');
    if (badgeTakes) badgeTakes.classList.add('hidden');

    if (skOffline) skOffline.classList.remove('hidden');
    if (badgeOffline) badgeOffline.classList.add('hidden');

    // Ensure all checkboxes default to checked
    const checkboxes = document.querySelectorAll('.export-checkbox');
    checkboxes.forEach(cb => { cb.checked = true; });

    // Non-blocking asynchronous query delay for smooth skeleton resolution
    await new Promise(r => setTimeout(r, 120));

    // Calculate item counts
    let quizCount = 0;
    try {
        const quizDb = state.quizHistory || {};
        quizCount = Object.keys(quizDb).length;
        if (quizCount === 0) {
            quizCount = Object.keys(getEncryptedStorageItem(constants.DB_NAME, {})).length;
        }
    } catch (e) {
        quizCount = 0;
    }

    let takesCount = 0;
    try {
        const takesDb = getEncryptedStorageItem(constants.QUIZ_ATTEMPTS_DB_KEY, {});
        takesCount = Object.values(takesDb).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    } catch (e) {
        takesCount = 0;
    }

    let offlineCount = 0;
    try {
        const activeOffline = getExportableOfflineDownloads();
        offlineCount = Object.keys(activeOffline).length;
    } catch (e) {
        offlineCount = 0;
    }

    // Set text values
    if (badgeQuizzes) badgeQuizzes.textContent = `${quizCount} quizzes`;
    if (badgeTakes) badgeTakes.textContent = `${takesCount} takes`;
    if (badgeOffline) badgeOffline.textContent = `${offlineCount} ${offlineCount === 1 ? 'item' : 'items'}`;

    // 2. Hide skeletons and reveal resolved badges
    if (skQuizzes) skQuizzes.classList.add('hidden');
    if (badgeQuizzes) badgeQuizzes.classList.remove('hidden');

    if (skTakes) skTakes.classList.add('hidden');
    if (badgeTakes) badgeTakes.classList.remove('hidden');

    if (skOffline) skOffline.classList.add('hidden');
    if (badgeOffline) badgeOffline.classList.remove('hidden');
}

export async function executeExport() {
    const includeQuizzes = document.getElementById('export-cb-quizzes')?.checked;
    const includeTakes = document.getElementById('export-cb-takes')?.checked;
    const includeOffline = document.getElementById('export-cb-offline')?.checked;
    const includeSettings = document.getElementById('export-cb-settings')?.checked;

    if (!includeQuizzes && !includeTakes && !includeOffline && !includeSettings) {
        showToast('Please select at least one dataset to export.', 3500, 'warning');
        return;
    }

    openMigrationProgressModal('Exporting Data...', 'Gathering selected datasets...');
    await new Promise(r => setTimeout(r, 150));

    try {
        updateMigrationProgress(15, 'Reading quiz library & configurations...');
        await new Promise(r => setTimeout(r, 180));

        const exportPayload = {
            format: 'nodal-migration-v1',
            exportedAt: Date.now(),
            sourceDomain: window.location.hostname || 'nodal-ai',
            clientTime: new Date().toISOString()
        };

        if (includeQuizzes) {
            exportPayload.quizzes = state.quizHistory || {};
            if (Object.keys(exportPayload.quizzes).length === 0) {
                exportPayload.quizzes = getEncryptedStorageItem(constants.DB_NAME, {});
            }
        }

        updateMigrationProgress(35, 'Compiling quiz takes and history...');
        await new Promise(r => setTimeout(r, 180));

        if (includeTakes) {
            try {
                const takesDb = getQuizTakes() || {};
                exportPayload.takes = takesDb;
            } catch (e) {
                exportPayload.takes = {};
            }
        }

        if (includeOffline) {
            try {
                exportPayload.offlineDownloads = getExportableOfflineDownloads();
            } catch (e) {
                exportPayload.offlineDownloads = {};
            }
        }

        if (includeSettings) {
            exportPayload.preferences = {
                customDisplayName: localStorage.getItem('nodal_cached_username') || '',
                deletedKeys: localStorage.getItem('nodal_deleted_quiz_keys') || '{}',
                reduceMotion: localStorage.getItem('nodal_reduce_motion') === 'true'
            };
        }

        updateMigrationProgress(65, 'Encrypting backup with Nodal AES-256...');
        await new Promise(r => setTimeout(r, 220));

        // Use CryptoJS to encrypt the serialized JSON payload
        if (typeof CryptoJS === 'undefined' || !CryptoJS.AES) {
            throw new Error('Encryption engine (CryptoJS) is not available.');
        }

        const serialized = JSON.stringify(exportPayload);
        const ciphertext = CryptoJS.AES.encrypt(serialized, NODAL_AES_KEY).toString();

        const finalEnvelope = {
            magic: NODAL_MAGIC_HEADER,
            version: 1,
            exportedAt: Date.now(),
            domain: window.location.hostname,
            payload: ciphertext
        };

        updateMigrationProgress(85, 'Packaging .nodal backup file...');
        await new Promise(r => setTimeout(r, 180));

        // Format filename: nodal-backup-YYYY-MM-DD.nodal
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const fileName = `nodal-backup-${yyyy}-${mm}-${dd}${NODAL_FILE_EXTENSION}`;

        const blob = new Blob([JSON.stringify(finalEnvelope, null, 2)], {
            type: 'application/octet-stream'
        });

        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = fileName;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        document.body.removeChild(downloadAnchor);
        URL.revokeObjectURL(url);

        updateMigrationProgress(100, `Successfully exported to ${fileName}!`, true);
        showToast('Data exported successfully!', 3500, 'success');
    } catch (err) {
        console.error('[Migration] Export failure:', err);
        navigateToMigrationStep('export');
        showMigrationErrorModal(`Export failed: ${err.message || 'An unexpected error occurred while exporting data.'}`);
    }
}

// ==================================================================
// IMPORT RESTORATION & SKELETON DECRYPTION
// ==================================================================

export function resetImportStaging() {
    stagedImportPayload = null;
    const fileInput = document.getElementById('migration-file-input');
    if (fileInput) fileInput.value = '';

    const dropZone = document.getElementById('migration-drop-zone');
    const skeleton = document.getElementById('migration-import-skeleton');
    const summaryCard = document.getElementById('migration-import-summary');
    const startImportBtn = document.getElementById('start-import-btn');

    if (dropZone) dropZone.classList.remove('hidden');
    if (skeleton) skeleton.classList.add('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');
    if (startImportBtn) startImportBtn.disabled = true;
}

/**
 * Validates and decrypts the uploaded .nodal file with lazy skeleton feedback.
 * @param {File} file 
 */
export async function handleFileSelectionForImport(file) {
    if (!file) return;

    // 1. Strict extension check
    if (!file.name.toLowerCase().endsWith(NODAL_FILE_EXTENSION)) {
        showMigrationErrorModal(
            `Invalid File Type: "${file.name}" is not a valid Nodal AI backup file. Only proprietary ${NODAL_FILE_EXTENSION} files exported from Nodal AI are supported.`
        );
        resetImportStaging();
        return;
    }

    const dropZone = document.getElementById('migration-drop-zone');
    const skeleton = document.getElementById('migration-import-skeleton');
    const summaryCard = document.getElementById('migration-import-summary');
    const startImportBtn = document.getElementById('start-import-btn');

    // 2. Show lazy skeleton shimmer card immediately while decrypting
    if (dropZone) dropZone.classList.add('hidden');
    if (skeleton) skeleton.classList.remove('hidden');
    if (summaryCard) summaryCard.classList.add('hidden');
    if (startImportBtn) startImportBtn.disabled = true;

    // Brief async yield for smooth transition
    await new Promise(r => setTimeout(r, 220));

    try {
        const fileContent = await file.text();
        let parsedEnvelope = null;

        try {
            parsedEnvelope = JSON.parse(fileContent);
        } catch (jsonErr) {
            throw new Error('The backup file is corrupt or not in valid JSON envelope format.');
        }

        // 3. Magic header and payload check
        if (!parsedEnvelope || parsedEnvelope.magic !== NODAL_MAGIC_HEADER || !parsedEnvelope.payload) {
            throw new Error(
                `Unrecognized file format. The file does not contain a valid Nodal AI cryptographic signature (${NODAL_MAGIC_HEADER}).`
            );
        }

        // 4. Cryptographic AES decryption check
        if (typeof CryptoJS === 'undefined' || !CryptoJS.AES) {
            throw new Error('Encryption engine (CryptoJS) is not available to decrypt this backup.');
        }

        const decryptedBytes = CryptoJS.AES.decrypt(parsedEnvelope.payload, NODAL_AES_KEY);
        const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);

        if (!decryptedString) {
            throw new Error('Failed to decrypt backup data. The file signature or contents are corrupt.');
        }

        const payload = JSON.parse(decryptedString);

        if (!payload || payload.format !== 'nodal-migration-v1') {
            throw new Error('Unsupported internal backup structure or version mismatch.');
        }

        // Successfully decrypted and validated!
        stagedImportPayload = payload;

        // Hide skeleton and render summary card
        if (skeleton) skeleton.classList.add('hidden');
        renderImportSummary(file.name, parsedEnvelope.exportedAt, payload);
    } catch (validationErr) {
        console.warn('[Migration] Invalid backup file uploaded:', validationErr);
        if (skeleton) skeleton.classList.add('hidden');
        resetImportStaging();
        showMigrationErrorModal(
            `Invalid or Unsupported File: ${validationErr.message || 'The selected file cannot be decrypted or restored.'}`
        );
    }
}

function renderImportSummary(fileName, exportedAt, payload) {
    const dropZone = document.getElementById('migration-drop-zone');
    const skeleton = document.getElementById('migration-import-skeleton');
    const summaryCard = document.getElementById('migration-import-summary');
    const startImportBtn = document.getElementById('start-import-btn');

    const fileNameEl = document.getElementById('import-summary-filename');
    const dateEl = document.getElementById('import-summary-date');
    const quizzesCountEl = document.getElementById('import-summary-quizzes-count');
    const takesCountEl = document.getElementById('import-summary-takes-count');
    const offlineCountEl = document.getElementById('import-summary-offline-count');

    if (fileNameEl) fileNameEl.textContent = fileName;
    if (dateEl) {
        dateEl.textContent = exportedAt ? new Date(exportedAt).toLocaleString() : 'Unknown';
    }

    const quizzesCount = payload.quizzes ? Object.keys(payload.quizzes).length : 0;
    let takesCount = 0;
    if (payload.takes && typeof payload.takes === 'object') {
        takesCount = Object.values(payload.takes).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
    }
    const offlineCount = payload.offlineDownloads ? Object.keys(payload.offlineDownloads).length : 0;

    if (quizzesCountEl) quizzesCountEl.textContent = `${quizzesCount} quizzes`;
    if (takesCountEl) takesCountEl.textContent = `${takesCount} takes`;
    if (offlineCountEl) offlineCountEl.textContent = `${offlineCount} items`;

    // Toggle and enable checkboxes based on availability
    const cbQuizzes = document.getElementById('import-cb-quizzes');
    const cbTakes = document.getElementById('import-cb-takes');
    const cbOffline = document.getElementById('import-cb-offline');
    const cbSettings = document.getElementById('import-cb-settings');

    if (cbQuizzes) { cbQuizzes.checked = quizzesCount > 0; cbQuizzes.disabled = quizzesCount === 0; }
    if (cbTakes) { cbTakes.checked = takesCount > 0; cbTakes.disabled = takesCount === 0; }
    if (cbOffline) { cbOffline.checked = offlineCount > 0; cbOffline.disabled = offlineCount === 0; }
    if (cbSettings) { cbSettings.checked = !!payload.preferences; cbSettings.disabled = !payload.preferences; }

    if (dropZone) dropZone.classList.add('hidden');
    if (skeleton) skeleton.classList.add('hidden');
    if (summaryCard) summaryCard.classList.remove('hidden');
    if (startImportBtn) startImportBtn.disabled = false;
}

export async function executeImport() {
    if (!stagedImportPayload) {
        showToast('Please select a valid .nodal file first.', 3000, 'warning');
        return;
    }

    const importQuizzes = document.getElementById('import-cb-quizzes')?.checked;
    const importTakes = document.getElementById('import-cb-takes')?.checked;
    const importOffline = document.getElementById('import-cb-offline')?.checked;
    const importSettings = document.getElementById('import-cb-settings')?.checked;

    if (!importQuizzes && !importTakes && !importOffline && !importSettings) {
        showToast('Please select at least one category to restore.', 3000, 'warning');
        return;
    }

    openMigrationProgressModal('Importing Data...', 'Initializing database restore...');
    await new Promise(r => setTimeout(r, 150));

    try {
        let importedQuizzesCount = 0;

        // 1. Restore Quizzes
        if (importQuizzes && stagedImportPayload.quizzes) {
            updateMigrationProgress(25, 'Merging quizzes into local storage...');
            await new Promise(r => setTimeout(r, 180));

            state.quizHistory = state.quizHistory || {};
            for (const [key, quizData] of Object.entries(stagedImportPayload.quizzes)) {
                state.quizHistory[key] = {
                    ...(state.quizHistory[key] || {}),
                    ...quizData
                };
                importedQuizzesCount++;
            }

            setEncryptedStorageItem(constants.DB_NAME, state.quizHistory);
            localStorage.setItem(`${constants.DB_NAME}_ts`, Date.now().toString());
        }

        // 2. Restore Takes & Statistics
        if (importTakes && stagedImportPayload.takes) {
            updateMigrationProgress(50, 'Restoring quiz takes and test statistics...');
            await new Promise(r => setTimeout(r, 180));

            let currentTakes = getEncryptedStorageItem(constants.QUIZ_ATTEMPTS_DB_KEY, {});

            for (const [quizKey, takesList] of Object.entries(stagedImportPayload.takes)) {
                if (Array.isArray(takesList)) {
                    const existing = Array.isArray(currentTakes[quizKey]) ? currentTakes[quizKey] : [];
                    const merged = [...existing];
                    takesList.forEach(newTake => {
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

                    // Sort chronologically ascending and re-index takeNumber sequentially
                    merged.sort((a, b) => (a.completedAt || a.timestamp || 0) - (b.completedAt || b.timestamp || 0));
                    merged.forEach((t, idx) => {
                        t.takeNumber = idx + 1;
                    });
                    currentTakes[quizKey] = merged;
                }
            }

            setEncryptedStorageItem(constants.QUIZ_ATTEMPTS_DB_KEY, currentTakes);
        }

        // 3. Restore Offline Downloads
        if (importOffline && stagedImportPayload.offlineDownloads) {
            updateMigrationProgress(70, 'Restoring offline downloads registry...');
            await new Promise(r => setTimeout(r, 150));

            let currentDownloads = getEncryptedStorageItem(constants.OFFLINE_DOWNLOADS_DB_KEY, {});

            Object.assign(currentDownloads, stagedImportPayload.offlineDownloads);
            setEncryptedStorageItem(constants.OFFLINE_DOWNLOADS_DB_KEY, currentDownloads);
        }

        // 4. Restore Settings
        if (importSettings && stagedImportPayload.preferences) {
            updateMigrationProgress(85, 'Applying preferences and display name...');
            await new Promise(r => setTimeout(r, 150));

            if (stagedImportPayload.preferences.customDisplayName) {
                localStorage.setItem('nodal_cached_username', stagedImportPayload.preferences.customDisplayName);
                const nameInput = document.getElementById('display-name-input');
                if (nameInput) nameInput.value = stagedImportPayload.preferences.customDisplayName;
            }

            if (stagedImportPayload.preferences.reduceMotion !== undefined) {
                const { setReduceMotion } = await import('../helpers.js');
                setReduceMotion(stagedImportPayload.preferences.reduceMotion);
            }
        }

        updateMigrationProgress(95, 'Refreshing interface and synchronizing with cloud...');
        await new Promise(r => setTimeout(r, 180));

        // Redraw lists
        refreshHistory();

        // Background cloud sync if online
        if (navigator.onLine && typeof puter !== 'undefined' && puter.auth?.isSignedIn?.()) {
            syncHistoryWithCloud(false).catch(() => {});
        }

        updateMigrationProgress(100, `Successfully restored ${importedQuizzesCount} quizzes & history!`, true);
        showToast('Data imported successfully!', 3500, 'success');
    } catch (err) {
        console.error('[Migration] Import failed:', err);
        navigateToMigrationStep('import');
        showMigrationErrorModal(`Import failed: ${err.message || 'Failed to restore data.'}`);
    }
}

// ==================================================================
// NETLIFY TO VERCEL MIGRATION SYSTEM (ACTIVE ONLY ON NETLIFY HOST)
// ==================================================================

/**
 * Detects if the current host is the legacy Netlify deployment.
 */
export function isNetlifyDeployment() {
    const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) || '';
    return hostname === 'cedrickylo-nodal.netlify.app' || hostname.endsWith('.netlify.app');
}

/**
 * Automatically creates and triggers browser download of the complete encrypted .nodal backup bundle.
 */
export function autoExportMigrationBundle() {
    try {
        let quizzes = state.quizHistory || {};
        if (Object.keys(quizzes).length === 0) {
            quizzes = getEncryptedStorageItem(constants.DB_NAME, {});
        }

        let takes = {};
        try { takes = getQuizTakes() || {}; } catch (e) {}

        let offlineDownloads = {};
        try {
            offlineDownloads = getExportableOfflineDownloads();
        } catch (e) {}

        const preferences = {
            customDisplayName: localStorage.getItem('nodal_cached_username') || '',
            deletedKeys: localStorage.getItem('nodal_deleted_quiz_keys') || '{}',
            reduceMotion: localStorage.getItem('nodal_reduce_motion') === 'true'
        };

        const exportPayload = {
            format: 'nodal-migration-v1',
            exportedAt: Date.now(),
            sourceDomain: window.location.hostname || 'cedrickylo-nodal.netlify.app',
            clientTime: new Date().toISOString(),
            quizzes,
            takes,
            offlineDownloads,
            preferences
        };

        if (typeof CryptoJS === 'undefined' || !CryptoJS.AES) {
            throw new Error('Encryption library is not ready.');
        }

        const rawJson = JSON.stringify(exportPayload);
        const encrypted = CryptoJS.AES.encrypt(rawJson, NODAL_AES_KEY).toString();
        const finalPackage = `${NODAL_MAGIC_HEADER}:${encrypted}`;

        const blob = new Blob([finalPackage], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nodal-backup-migration.nodal';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1500);

        return true;
    } catch (err) {
        console.error('[Migration] Auto-export failed:', err);
        showToast('Export error: ' + err.message, 4000, 'error');
        return false;
    }
}

/**
 * Handles the "Migrate Now" action from either the top banner or the initial notice modal.
 * Triggers 1-click download and opens the Step-by-Step Guide modal.
 */
export function handleNetlifyMigrateNow() {
    closeNetlifyMigrationNoticeModal();
    autoExportMigrationBundle();
    openNetlifyMigrationGuideModal();
    showToast('Backup downloaded! Complete migration to Vercel.', 4000, 'success');
}

/**
 * Opens the initial Netlify notice modal.
 */
export function openNetlifyMigrationNoticeModal() {
    const modal = document.getElementById('netlify-migration-notice-modal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * Closes the initial Netlify notice modal.
 */
export function closeNetlifyMigrationNoticeModal() {
    const modal = document.getElementById('netlify-migration-notice-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Opens the step-by-step Netlify to Vercel migration guide modal.
 */
export function openNetlifyMigrationGuideModal() {
    const modal = document.getElementById('netlify-migration-guide-modal');
    if (modal) modal.classList.remove('hidden');
}

/**
 * Closes the step-by-step Netlify to Vercel migration guide modal.
 */
export function closeNetlifyMigrationGuideModal() {
    const modal = document.getElementById('netlify-migration-guide-modal');
    if (modal) modal.classList.add('hidden');
}

/**
 * Initializes the Netlify migration banner and initial notice modal.
 * STRICTLY active only when running on cedrickylo-nodal.netlify.app (or *.netlify.app).
 */
export function initNetlifyMigrationBannerAndNotice() {
    if (!isNetlifyDeployment()) {
        return;
    }

    // 1. Reveal top migration banner and adjust page padding
    const banner = document.getElementById('netlify-migration-banner');
    if (banner) {
        banner.classList.remove('hidden');
        document.body.classList.add('has-netlify-banner');
    }

    // 2. Wire Top Banner Button
    const bannerMigrateBtn = document.getElementById('netlify-banner-migrate-btn');
    if (bannerMigrateBtn) {
        bannerMigrateBtn.onclick = () => {
            handleNetlifyMigrateNow();
        };
    }

    // 3. Check if initial popup was dismissed in this session
    const isDismissed = sessionStorage.getItem('nodal_migration_notice_dismissed');
    if (!isDismissed) {
        // Show after a brief delay for smooth appearance
        setTimeout(() => {
            openNetlifyMigrationNoticeModal();
        }, 400);
    }

    // 4. Wire Notice Modal Buttons
    const noticeNowBtn = document.getElementById('netlify-notice-now-btn');
    if (noticeNowBtn) {
        noticeNowBtn.onclick = () => {
            handleNetlifyMigrateNow();
        };
    }

    const noticeLaterBtn = document.getElementById('netlify-notice-later-btn');
    if (noticeLaterBtn) {
        noticeLaterBtn.onclick = () => {
            closeNetlifyMigrationNoticeModal();
            sessionStorage.setItem('nodal_migration_notice_dismissed', 'true');
        };
    }

    // 5. Wire Guide Modal Buttons
    const closeGuideBtn = document.getElementById('close-netlify-guide-btn');
    if (closeGuideBtn) {
        closeGuideBtn.onclick = () => {
            closeNetlifyMigrationGuideModal();
        };
    }

    const downloadAgainBtn = document.getElementById('netlify-guide-download-again-btn');
    if (downloadAgainBtn) {
        downloadAgainBtn.onclick = () => {
            autoExportMigrationBundle();
            showToast('Backup downloaded again!', 2500, 'info');
        };
    }

    // 6. Wire Step 3 & Banner Confirmation and Deletion Buttons
    const confirmMigratedBtn = document.getElementById('netlify-confirm-migrated-btn');
    if (confirmMigratedBtn) {
        confirmMigratedBtn.onclick = handleNetlifyConfirmMigration;
    }

    const guideForceDeleteBtn = document.getElementById('netlify-guide-force-delete-btn');
    if (guideForceDeleteBtn) {
        guideForceDeleteBtn.onclick = forceDeleteNetlifyProfileNow;
    }

    const guideCancelCountdownBtn = document.getElementById('netlify-guide-cancel-countdown-btn');
    if (guideCancelCountdownBtn) {
        guideCancelCountdownBtn.onclick = cancelNetlifyScheduledDeletion;
    }

    const bannerForceDeleteBtn = document.getElementById('netlify-banner-force-delete-btn');
    if (bannerForceDeleteBtn) {
        bannerForceDeleteBtn.onclick = forceDeleteNetlifyProfileNow;
    }

    const bannerCancelCountdownBtn = document.getElementById('netlify-banner-cancel-countdown-btn');
    if (bannerCancelCountdownBtn) {
        bannerCancelCountdownBtn.onclick = cancelNetlifyScheduledDeletion;
    }

    // 7. Check if a 1-week scheduled deletion is currently active or expired
    checkNetlifyScheduledDeletion();
}

// ==================================================================
// NETLIFY POST-MIGRATION PROFILE DELETION & COUNTDOWN SYSTEM
// ==================================================================
const NETLIFY_SCHEDULED_DELETION_KEY = 'nodal_netlify_scheduled_deletion_ts';
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
let netlifyCountdownTimerInterval = null;

/**
 * Formats milliseconds remaining into a readable string: e.g. "6d 23h 45m"
 */
function formatRemainingTime(ms) {
    if (ms <= 0) return '0d 0h 0m';
    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${days}d ${hours}h ${minutes}m`;
}

/**
 * Updates all countdown displays on the Netlify banner and guide modal.
 */
function updateNetlifyCountdownDisplay(remainingMs) {
    const formatted = formatRemainingTime(remainingMs);
    const bannerTimer = document.getElementById('netlify-banner-timer-display');
    if (bannerTimer) {
        bannerTimer.textContent = `${formatted} remaining`;
    }
    const guideTimer = document.getElementById('netlify-guide-countdown-timer');
    if (guideTimer) {
        guideTimer.textContent = `${formatted} remaining`;
    }
}

/**
 * Toggles the banner and guide modal between default migration state and active countdown state.
 */
function setNetlifyCountdownUIActive(isActive) {
    const defaultBannerContent = document.getElementById('netlify-banner-default-content');
    const countdownBannerContent = document.getElementById('netlify-banner-countdown-content');
    const banner = document.getElementById('netlify-migration-banner');

    if (defaultBannerContent && countdownBannerContent) {
        defaultBannerContent.classList.toggle('hidden', isActive);
        countdownBannerContent.classList.toggle('hidden', !isActive);
    }

    if (banner) {
        if (isActive) {
            banner.classList.remove('from-amber-600', 'via-orange-600', 'to-amber-700', 'border-amber-400/40');
            banner.classList.add('from-red-700', 'via-rose-700', 'to-amber-700', 'border-red-400/40');
        } else {
            banner.classList.remove('from-red-700', 'via-rose-700', 'to-amber-700', 'border-red-400/40');
            banner.classList.add('from-amber-600', 'via-orange-600', 'to-amber-700', 'border-amber-400/40');
        }
    }

    const preActions = document.getElementById('netlify-migration-actions-pre');
    const countdownActions = document.getElementById('netlify-migration-actions-countdown');
    if (preActions && countdownActions) {
        preActions.classList.toggle('hidden', isActive);
        countdownActions.classList.toggle('hidden', !isActive);
    }
}

/**
 * Executes automatic profile wipe upon 1-week grace period expiration.
 */
async function executeSilentNetlifyProfileWipe() {
    try {
        // Delete Puter Cloud Files & KV if signed in
        if (typeof puter !== 'undefined' && window.puter && puter.auth?.isSignedIn() && navigator.onLine) {
            try {
                if (puter.fs && typeof puter.fs.readdir === 'function') {
                    const items = await puter.fs.readdir('./').catch(() => []);
                    if (Array.isArray(items)) {
                        for (const item of items) {
                            const fileName = item?.name || item?.path || (typeof item === 'string' ? item : null);
                            if (fileName) {
                                try {
                                    if (typeof puter.fs.delete === 'function') await puter.fs.delete(fileName).catch(() => {});
                                    else if (typeof puter.fs.unlink === 'function') await puter.fs.unlink(fileName).catch(() => {});
                                } catch (e) {}
                            }
                        }
                    }
                }
            } catch (e) {}

            try {
                if (puter.kv) {
                    const keys = ['puter_quiz_sync_v4', 'AIQuizGenerationLog_v1', 'custom_display_name'];
                    for (const k of keys) {
                        try {
                            if (typeof puter.kv.del === 'function') await puter.kv.del(k).catch(() => {});
                            else if (typeof puter.kv.delete === 'function') await puter.kv.delete(k).catch(() => {});
                        } catch (e) {}
                    }
                }
            } catch (e) {}

            try { await puter.auth.signOut(); } catch (e) {}
        }

        // Wipe local data
        localStorage.clear();
        sessionStorage.clear();
        if (typeof caches !== 'undefined' && caches.keys) {
            const cacheNames = await caches.keys();
            for (const c of cacheNames) {
                await caches.delete(c).catch(() => {});
            }
        }

        state.quizHistory = {};
        state.generationLog = [];
        state.savedProgress = null;
        state.questions = [];
        state.userAnswers = [];
        state.score = 0;

        refreshHistory();
        showToast('1-week grace period expired: Netlify profile data has been cleared.', 6000, 'neutral');
        window.location.reload();
    } catch (err) {
        console.error('Automated Netlify profile wipe error:', err);
    }
}

/**
 * Checks if a scheduled deletion exists for Netlify.
 * If expired: triggers automatic profile wipe.
 * If active: enables countdown state on banner and modal and starts ticker.
 */
export async function checkNetlifyScheduledDeletion() {
    if (!isNetlifyDeployment()) return;

    const rawScheduled = localStorage.getItem(NETLIFY_SCHEDULED_DELETION_KEY);
    if (!rawScheduled) {
        setNetlifyCountdownUIActive(false);
        return;
    }

    const scheduledTs = parseInt(rawScheduled, 10);
    if (isNaN(scheduledTs)) {
        localStorage.removeItem(NETLIFY_SCHEDULED_DELETION_KEY);
        setNetlifyCountdownUIActive(false);
        return;
    }

    const now = Date.now();
    const remaining = scheduledTs - now;

    if (remaining <= 0) {
        // Countdown elapsed: execute full profile deletion!
        localStorage.removeItem(NETLIFY_SCHEDULED_DELETION_KEY);
        await executeSilentNetlifyProfileWipe();
        return;
    }

    // Active countdown: update UI
    setNetlifyCountdownUIActive(true);
    updateNetlifyCountdownDisplay(remaining);

    if (netlifyCountdownTimerInterval) clearInterval(netlifyCountdownTimerInterval);
    netlifyCountdownTimerInterval = setInterval(async () => {
        const currentRemaining = scheduledTs - Date.now();
        if (currentRemaining <= 0) {
            clearInterval(netlifyCountdownTimerInterval);
            localStorage.removeItem(NETLIFY_SCHEDULED_DELETION_KEY);
            await executeSilentNetlifyProfileWipe();
        } else {
            updateNetlifyCountdownDisplay(currentRemaining);
        }
    }, 60000);
}

/**
 * Handles the "I Have Successfully Migrated My Data" action in Step 3.
 */
export async function handleNetlifyConfirmMigration() {
    const userChoice = await customConfirm(
        'Congratulations on migrating your data to the new website!\n\n' +
        'How would you like to handle your Netlify profile and local data?\n\n' +
        '• <strong>Start 1-Week Countdown:</strong> Keeps your data for 7 days as a safety fallback, after which it will be permanently wiped.\n\n' +
        '• <strong>Delete Right Away:</strong> Cancel this prompt and click "Delete Profile Now" to wipe everything immediately.',
        'Confirm Successful Migration',
        'Start 1-Week Countdown',
        'Cancel',
        false
    );

    if (userChoice) {
        const scheduledTs = Date.now() + ONE_WEEK_MS;
        localStorage.setItem(NETLIFY_SCHEDULED_DELETION_KEY, scheduledTs.toString());
        setNetlifyCountdownUIActive(true);
        updateNetlifyCountdownDisplay(ONE_WEEK_MS);
        checkNetlifyScheduledDeletion();
        showToast('1-week profile deletion countdown started. You can delete immediately at any time.', 5000, 'info');
    }
}

/**
 * Cancels the scheduled 1-week deletion countdown and restores normal banner.
 */
export function cancelNetlifyScheduledDeletion() {
    if (netlifyCountdownTimerInterval) clearInterval(netlifyCountdownTimerInterval);
    localStorage.removeItem(NETLIFY_SCHEDULED_DELETION_KEY);
    setNetlifyCountdownUIActive(false);
    showToast('Scheduled profile deletion cancelled.', 4000, 'info');
}

/**
 * Forces immediate profile deletion on Netlify (bypassing the 7-day wait).
 */
export async function forceDeleteNetlifyProfileNow() {
    closeNetlifyMigrationGuideModal();
    if (netlifyCountdownTimerInterval) clearInterval(netlifyCountdownTimerInterval);
    await handleDeleteProfile();
}
