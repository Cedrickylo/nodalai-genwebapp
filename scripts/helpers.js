import { elements, state, constants } from './state.js';
import { isUsingPuterAI } from './aiService.js';

const {
    views,
    globalSyncDone,
    globalSyncLoad,
    quizSyncDone,
    quizSyncLoad,
    statusMessage,
    historyList,
    showAllHistoryBtn,
    toastEl,
    toastMessageEl,
    startSubtitle,
    fileActionsDiv,
    cancelCustomizeBtn,
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
    attemptLimitToggle,
    attemptLimitOptions,
    attemptLimitInput,
    summaryOnlyToggle,
    generateQuizBtn,
    customizeSection,
    customizeContent,
    customizeToggleIcon,
    deleteCustomizeBtn,
    renameContainer,
    editQuizNameInput,
    authBtn,
    authBtnText,
    accountModal,
    closeAccountModal,
    modalUsername,
    modalAccountId,
    modalEmail,
    modalCreditPanel,
    modalCredits,
    creditProgress,
    buyCreditsBtn,
    modalStoragePanel,
    modalStorageLabel,
    modalCooldownPanel,
    modalCooldownStatus,
    modalCooldownDetail,
    displayNameInput,
    saveDisplayNameBtn,
    logoutBtn,
    confirmModal,
    confirmTitle,
    confirmMessage,
    acceptConfirmBtn,
    cancelConfirmBtn,
    accountModalOverlay,
    accountViewContainer,
    accountCard,
    closeAccountBtn,
    accountLoggedInContent,
    accountLoggedOutContent,
    accountLoginBtn
} = elements;

const { DB_NAME, CLOUD_SYNC_KEY, IN_PROGRESS_QUIZ_KEY, GENERATION_LOG_LOCAL_KEY, GENERATION_LOG_CLOUD_KEY, GENERATION_WINDOW_MS, MAX_GENERATIONS_PER_WINDOW, MIN_QUIZ_QUESTIONS, MAX_QUIZ_QUESTIONS, WELCOME_DISMISSED_KEY } = constants;

// Add this to helpers.js
const setVisibility = (element, isVisible) => {
    element.classList.toggle('hidden', !isVisible);
};

export function closeModalWithAnimation(modal, onClosed) {
    if (!modal) {
        if (typeof onClosed === 'function') onClosed();
        return;
    }
    const modalEl = typeof modal === 'string' ? document.getElementById(modal) : modal;
    if (!modalEl || modalEl.classList.contains('hidden')) {
        if (typeof onClosed === 'function') onClosed();
        return;
    }
    if (state.isReduceMotion) {
        modalEl.classList.add('hidden');
        modalEl.classList.remove('modal-closing');
        if (typeof onClosed === 'function') onClosed();
        return;
    }
    if (modalEl.classList.contains('modal-closing')) return;

    modalEl.classList.add('modal-closing');
    setTimeout(() => {
        modalEl.classList.add('hidden');
        modalEl.classList.remove('modal-closing');
        if (typeof onClosed === 'function') onClosed();
    }, 180);
}

export function customConfirm(message, title = 'Confirm', acceptText = 'OK', cancelText = 'Cancel', isDestructive = false) {
    return new Promise((resolve) => {
        confirmTitle.textContent = title;
        // Replace newlines with <br> for HTML rendering
        confirmMessage.innerHTML = message.replace(/\n/g, '<br>'); 
        
        acceptConfirmBtn.textContent = acceptText;
        cancelConfirmBtn.textContent = cancelText;

        // Apply destructive styling (red) if requested, else default blue
        if (isDestructive) {
            acceptConfirmBtn.classList.replace('bg-blue-600', 'bg-red-600');
            acceptConfirmBtn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
        } else {
            acceptConfirmBtn.classList.replace('bg-red-600', 'bg-blue-600');
            acceptConfirmBtn.classList.replace('hover:bg-red-700', 'hover:bg-blue-700');
        }

        confirmModal.classList.remove('hidden');

        const cleanup = (result) => {
            closeModalWithAnimation(confirmModal, () => {
                acceptConfirmBtn.removeEventListener('click', onAccept);
                cancelConfirmBtn.removeEventListener('click', onCancel);
                resolve(result);
            });
        };

        const onAccept = () => { cleanup(true); };
        const onCancel = () => { cleanup(false); };

        acceptConfirmBtn.addEventListener('click', onAccept);
        cancelConfirmBtn.addEventListener('click', onCancel);
    });
}

export function toggleContainerVisibility(containerId, isVisible) {
    const el = document.getElementById(containerId);
    if (el) {
        el.classList.toggle('hidden', !isVisible);
    }
}

export function setHistoryVisibility(show) {
    const section = elements.historySection || document.getElementById('history-section');
    if (!section) return;
    if (!section.classList.contains('hidden')) section.classList.add('hidden');
    if (!section.classList.contains('md:block')) section.classList.add('md:block');
    if (show) {
        section.classList.remove('customize-hidden');
    } else {
        section.classList.add('customize-hidden');
    }
}

// --- Consolidated Toggle Functions ---

export function handleTimeToggle() {
    timeLimitOptions.classList.toggle('hidden', !timeLimitToggle.checked);
    
    if (timeLimitToggle.checked) {
        // Evaluate dynamic internal displays based on active settings select index value
        const timerMode = elements.timerModeSelect ? elements.timerModeSelect.value : 'quiz';
        const isQuestionMode = timerMode === 'question';
        
        document.getElementById('quiz-time-presets-container')?.classList.toggle('hidden', isQuestionMode);
        document.getElementById('question-time-container')?.classList.toggle('hidden', !isQuestionMode);
        
        if (!isQuestionMode) {
            handleTimePresetChange();
        }
    } else {
        // PARSE PURGE: Clear inputs/checkbox parameters if hidden or disabled
        if (elements.timerModeSelect) elements.timerModeSelect.value = 'quiz';
        if (elements.questionTimeInput) elements.questionTimeInput.value = 30;
        const time10m = document.getElementById('time-10m');
        if (time10m) time10m.checked = true;
        customTimeInputContainer.classList.add('hidden');
        document.getElementById('quiz-time-presets-container')?.classList.remove('hidden');
        document.getElementById('question-time-container')?.classList.add('hidden');
    }
    validateAllInputs();
}

export function handleAttemptToggle() {
    // Show/hide the attempt limit container based on checkbox state
    attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
    validateAllInputs();
}

export function handleDifficultyChange() {
    // Difficulty is decoupled from Quiz Type; validate all inputs on change
    validateAllInputs();
}

export async function handleLogout() {
    const isConfirmed = await customConfirm('Are you sure you want to log out?', 'Sign Out', 'Sign Out', 'Cancel', true);
    if (isConfirmed) {
        if (elements.accountModalOverlay) elements.accountModalOverlay.classList.add('hidden');
        
        // Ensure local quizzes are safely saved to Puter cloud before signing out
        if (typeof puter !== 'undefined' && window.puter && puter.auth && puter.auth.isSignedIn() && navigator.onLine) {
            try {
                await syncHistoryWithCloud(false);
            } catch (syncErr) {
                console.warn("Pre-logout sync warning:", syncErr);
            }
        }

        // 1. Sign out of Puter
        await puter.auth.signOut();
        
        // 2. Wipe the saved data from the browser's Local Storage
        localStorage.removeItem(constants.DB_NAME); 
        localStorage.removeItem(constants.IN_PROGRESS_QUIZ_KEY);
        
        // 3. Clear the active history from the live state
        state.quizHistory = {};
        
        // 4. Update the UI to reflect empty history and reset the view
        refreshHistory();
        clearInProgressQuiz(); // Hides any "Resume Quiz" buttons
        showView('start');     // Kicks the user back to the main screen

        // 5. Update Auth buttons and notify user
        updateAuthUI();
        showToast('Logged out successfully');
    }
}

export async function clearHistory() {
    const isConfirmed = await customConfirm('Are you sure you want to clear all history? This cannot be undone.', 'Clear History', 'Clear All', 'Cancel', true);
    if (isConfirmed) {
        localStorage.removeItem(DB_NAME);
        state.quizHistory = {};
        localStorage.setItem(DB_NAME + '_ts', Date.now().toString());
        refreshHistory();
        syncHistoryWithCloud();
    }
}

export function setSyncing(status) {
    // Determine if user is physically offline vs. unauthenticated
    const isOffline = !navigator.onLine;
    const isLoggedOut = !window.puter || !puter.auth || !puter.auth.isSignedIn();
    const isUnsynced = isOffline || isLoggedOut;
    const finalStatus = isUnsynced ? 'offline' : status;

    const offlineText = isOffline ? 'Offline' : (isLoggedOut ? 'Logged out' : "Can't sync");
    const offlineTitle = isOffline ? 'Offline - Unable to sync' : (isLoggedOut ? 'Logged out - Sign in to sync' : 'Sync unavailable');

    // 1. Target Global Sync Buttons (Using Class to hit Home, History, and Statistics views)
    const globalSyncBtns = document.querySelectorAll('.global-sync-btn');
    globalSyncBtns.forEach(btn => {
        const done = btn.querySelector('.sync-icon-done');
        const load = btn.querySelector('.sync-icon-loading');
        const offline = btn.querySelector('.sync-icon-offline');
        const offlineTextSpan = btn.querySelector('.sync-text-offline');

        if (offlineTextSpan) offlineTextSpan.textContent = offlineText;

        if (finalStatus === 'offline') {
            btn.title = offlineTitle;
        } else if (finalStatus === 'synced') {
            btn.title = 'Synced with cloud';
        } else if (finalStatus === 'syncing') {
            btn.title = 'Syncing with cloud...';
        }

        if (done) done.classList.toggle('hidden', finalStatus !== 'synced');
        if (load) load.classList.toggle('hidden', finalStatus !== 'syncing');
        if (offline) offline.classList.toggle('hidden', finalStatus !== 'offline');
    });

    // 2. Target Quiz View Sync Indicator
    const quizIndicator = document.getElementById('quiz-sync-indicator');
    const quizDone = document.querySelector('#quiz-sync-indicator .sync-icon-done');
    const quizLoad = document.querySelector('#quiz-sync-indicator .sync-icon-loading');
    const quizOffline = document.querySelector('#quiz-sync-indicator .sync-icon-offline');
    const quizOfflineTextSpan = document.querySelector('#quiz-sync-indicator .sync-text-offline');

    if (quizOfflineTextSpan) quizOfflineTextSpan.textContent = offlineText;

    if (quizIndicator) {
        if (finalStatus === 'offline') {
            quizIndicator.title = offlineTitle;
        } else if (finalStatus === 'synced') {
            quizIndicator.title = 'Synced';
        } else if (finalStatus === 'syncing') {
            quizIndicator.title = 'Syncing...';
        }
    }

    if (quizDone) quizDone.classList.toggle('hidden', finalStatus !== 'synced');
    if (quizLoad) quizLoad.classList.toggle('hidden', finalStatus !== 'syncing');
    if (quizOffline) quizOffline.classList.toggle('hidden', finalStatus !== 'offline');
}

const PUTER_FS_SYNC_FILE = 'nodal_quiz_sync_v4.json';
const PUTER_FS_BACKUP_FILE = 'nodal_quiz_sync_backup.json';

async function parsePuterFSFile(fileItem) {
    if (!fileItem) return null;
    try {
        let text = '';
        if (typeof fileItem === 'string') {
            text = fileItem;
        } else if (fileItem instanceof Blob || (fileItem && typeof fileItem.text === 'function')) {
            text = await fileItem.text();
        } else if (fileItem && fileItem.content) {
            text = typeof fileItem.content === 'string' ? fileItem.content : JSON.stringify(fileItem.content);
        }
        if (text && text.trim().length > 0) {
            return JSON.parse(text);
        }
    } catch (e) {
        console.warn('parsePuterFSFile parse error:', e);
    }
    return null;
}

async function writePuterCloudBackup(fileName, contentString) {
    if (typeof puter === 'undefined' || !window.puter || !puter.fs) return false;
    try {
        // Attempt write with overwrite: true and dedupe_name: false
        const res = await puter.fs.write(fileName, contentString, { overwrite: true, dedupe_name: false });
        if (res && res.error) {
            console.warn(`Puter FS write to ${fileName} returned error:`, res.error);
            return false;
        }
        return true;
    } catch (writeErr) {
        console.warn(`Puter FS write exception on ${fileName}, trying unlink fallback:`, writeErr);
        try {
            if (typeof puter.fs.delete === 'function') {
                await puter.fs.delete(fileName).catch(() => {});
            } else if (typeof puter.fs.unlink === 'function') {
                await puter.fs.unlink(fileName).catch(() => {});
            }
            await puter.fs.write(fileName, contentString);
            return true;
        } catch (unlinkErr) {
            console.error(`Puter FS fallback write failed on ${fileName}:`, unlinkErr);
            return false;
        }
    }
}

export async function syncHistoryWithCloud(manual = false) {
    // 1. Authentication check
    if (typeof puter === 'undefined' || !window.puter || !puter.auth.isSignedIn()) {
        setSyncing('offline');
        if (manual) showToast('Sign in to Puter to sync history.', 4000, 'warning');
        return;
    }

    // Block cloud access immediately if offline
    if (!navigator.onLine) {
        setSyncing('offline');
        if (manual) showToast('Cannot sync history while offline.', 4000, 'warning');
        return;
    }
    
    if (manual) showToast('Started syncing...');
    setSyncing('syncing'); 

    // If local history is empty, display skeleton placeholder during sync
    const skeleton = elements.historySkeleton || document.getElementById('history-skeleton');
    if (skeleton && (!state.quizHistory || Object.keys(state.quizHistory).length === 0)) {
        skeleton.classList.remove('hidden');
        elements.historyList?.classList.add('hidden');
    }

    try {
        let combinedCloudItems = {};
        let combinedCloudTakes = {};

        // Ensure state.deletedQuizKeys is populated
        state.deletedQuizKeys = state.deletedQuizKeys || JSON.parse(localStorage.getItem('nodal_deleted_quiz_keys') || '{}');

        // Helper to ingest remote takes from parsed payload
        const ingestCloudTakes = (takesObj) => {
            if (takesObj && typeof takesObj === 'object') {
                for (const [qKey, takesArr] of Object.entries(takesObj)) {
                    if (Array.isArray(takesArr)) {
                        combinedCloudTakes[qKey] = (combinedCloudTakes[qKey] || []).concat(takesArr);
                    }
                }
            }
        };

        // 2. Read from Puter KV
        try {
            const cloudRaw = await puter.kv.get(CLOUD_SYNC_KEY);
            if (cloudRaw) {
                const parsedKv = typeof cloudRaw === 'string' ? JSON.parse(cloudRaw) : cloudRaw;
                if (parsedKv && parsedKv.items && typeof parsedKv.items === 'object') {
                    Object.assign(combinedCloudItems, parsedKv.items);
                }
                if (parsedKv && parsedKv.deletedKeys && typeof parsedKv.deletedKeys === 'object') {
                    Object.assign(state.deletedQuizKeys, parsedKv.deletedKeys);
                }
                ingestCloudTakes(parsedKv?.takes);
            }
        } catch (kvReadErr) {
            console.warn("Puter KV read warning:", kvReadErr);
        }

        // 3. Read from Puter FS primary & backup files
        if (puter.fs && typeof puter.fs.read === 'function') {
            try {
                const fsItemPrimary = await puter.fs.read(PUTER_FS_SYNC_FILE);
                const parsedPrimary = await parsePuterFSFile(fsItemPrimary);
                if (parsedPrimary && parsedPrimary.items) {
                    for (const [k, v] of Object.entries(parsedPrimary.items)) {
                        const vTime = Math.max(v.timestamp || 0, v.lastModified || 0, v.config?.lastModified || 0);
                        const existingTime = Math.max(combinedCloudItems[k]?.timestamp || 0, combinedCloudItems[k]?.lastModified || 0, combinedCloudItems[k]?.config?.lastModified || 0);
                        if (!combinedCloudItems[k] || vTime > existingTime) {
                            combinedCloudItems[k] = v;
                        }
                    }
                }
                if (parsedPrimary && parsedPrimary.deletedKeys && typeof parsedPrimary.deletedKeys === 'object') {
                    Object.assign(state.deletedQuizKeys, parsedPrimary.deletedKeys);
                }
                ingestCloudTakes(parsedPrimary?.takes);
            } catch (ePrimary) {
                // Primary file not created yet or read issue
            }

            try {
                const fsItemBackup = await puter.fs.read(PUTER_FS_BACKUP_FILE);
                const parsedBackup = await parsePuterFSFile(fsItemBackup);
                if (parsedBackup && parsedBackup.items) {
                    for (const [k, v] of Object.entries(parsedBackup.items)) {
                        const vTime = Math.max(v.timestamp || 0, v.lastModified || 0, v.config?.lastModified || 0);
                        const existingTime = Math.max(combinedCloudItems[k]?.timestamp || 0, combinedCloudItems[k]?.lastModified || 0, combinedCloudItems[k]?.config?.lastModified || 0);
                        if (!combinedCloudItems[k] || vTime > existingTime) {
                            combinedCloudItems[k] = v;
                        }
                    }
                }
                if (parsedBackup && parsedBackup.deletedKeys && typeof parsedBackup.deletedKeys === 'object') {
                    Object.assign(state.deletedQuizKeys, parsedBackup.deletedKeys);
                }
                ingestCloudTakes(parsedBackup?.takes);
            } catch (eBackup) {
                // Backup file not created yet
            }
        }

        // Save updated deletedQuizKeys
        localStorage.setItem('nodal_deleted_quiz_keys', JSON.stringify(state.deletedQuizKeys));

        // 4. Fetch current local system matrix
        const localItems = JSON.parse(localStorage.getItem(DB_NAME) || '{}');
        const mergedItems = {};

        // Filter out any items in combinedCloudItems and localItems that have tombstones
        for (const [delKey, delTime] of Object.entries(state.deletedQuizKeys)) {
            const cTime = Math.max(combinedCloudItems[delKey]?.timestamp || 0, combinedCloudItems[delKey]?.lastModified || 0);
            if (combinedCloudItems[delKey] && cTime <= delTime) {
                delete combinedCloudItems[delKey];
            }
            const lTime = Math.max(localItems[delKey]?.timestamp || 0, localItems[delKey]?.lastModified || 0);
            if (localItems[delKey] && lTime <= delTime) {
                delete localItems[delKey];
            }
        }

        // 5. Merge all keys across all cloud items and local items (Last-Write-Wins on settings/timestamp)
        const allKeys = new Set([...Object.keys(combinedCloudItems), ...Object.keys(localItems)]);

        for (const key of allKeys) {
            const cTime = Math.max(combinedCloudItems[key]?.timestamp || 0, combinedCloudItems[key]?.lastModified || 0, combinedCloudItems[key]?.config?.lastModified || 0);
            const lTime = Math.max(localItems[key]?.timestamp || 0, localItems[key]?.lastModified || 0, localItems[key]?.config?.lastModified || 0);
            if (state.deletedQuizKeys[key] && Math.max(cTime, lTime) <= state.deletedQuizKeys[key]) {
                continue;
            }
            const cloudQuiz = combinedCloudItems[key];
            const localQuiz = localItems[key];
            
            if (cloudQuiz && localQuiz) {
                if (cTime >= lTime) {
                    mergedItems[key] = cloudQuiz;
                } else {
                    mergedItems[key] = localQuiz;
                }
            } else if (cloudQuiz) {
                mergedItems[key] = cloudQuiz;
            } else if (localQuiz) {
                mergedItems[key] = localQuiz;
            }
        }

        // 5b. Merge and re-index quiz retakes across devices chronologically
        const localTakesDb = getQuizTakes() || {};
        const mergedTakesDb = {};
        const allTakeKeys = new Set([...Object.keys(combinedCloudTakes), ...Object.keys(localTakesDb), ...Object.keys(mergedItems)]);

        for (const qKey of allTakeKeys) {
            if (state.deletedQuizKeys && state.deletedQuizKeys[qKey]) {
                continue;
            }
            const cTakes = Array.isArray(combinedCloudTakes[qKey]) ? combinedCloudTakes[qKey] : [];
            const lTakes = Array.isArray(localTakesDb[qKey]) ? localTakesDb[qKey] : [];

            // Deduplicate takes by take ID or fallback composite key
            const seenTakeIds = new Set();
            const uniqueTakes = [];

            for (const take of [...lTakes, ...cTakes]) {
                if (!take || typeof take !== 'object') continue;
                const takeId = take.id || `take_${take.completedAt || 0}_${take.score || 0}_${take.totalQuestions || 0}`;
                if (!seenTakeIds.has(takeId)) {
                    seenTakeIds.add(takeId);
                    uniqueTakes.push(take);
                }
            }

            if (uniqueTakes.length > 0) {
                // Sort chronologically ascending by completedAt
                uniqueTakes.sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

                // Re-index sequentially so Take #1, Take #2, etc. are consistent across devices
                uniqueTakes.forEach((t, idx) => {
                    t.takeNumber = idx + 1;
                });

                mergedTakesDb[qKey] = uniqueTakes;
            }
        }

        // Persist merged takes to local storage
        localStorage.setItem(constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1', JSON.stringify(mergedTakesDb));

        const now = Date.now();

        // 6. Push structural modifications back to core state pointers & localStorage
        state.quizHistory = mergedItems; 
        localStorage.setItem(DB_NAME, JSON.stringify(mergedItems));
        localStorage.setItem(DB_NAME + '_ts', now.toString());

        const payloadString = JSON.stringify({ 
            items: mergedItems, 
            deletedKeys: state.deletedQuizKeys,
            takes: mergedTakesDb,
            updatedAt: now 
        });

        // 7. Write to cloud: Puter FS primary & backup + Puter KV
        let writeSuccess = false;

        const fsPrimarySuccess = await writePuterCloudBackup(PUTER_FS_SYNC_FILE, payloadString);
        if (fsPrimarySuccess) writeSuccess = true;

        const fsBackupSuccess = await writePuterCloudBackup(PUTER_FS_BACKUP_FILE, payloadString);
        if (fsBackupSuccess) writeSuccess = true;

        try {
            const kvRes = await puter.kv.set(CLOUD_SYNC_KEY, payloadString);
            if (kvRes !== false && !(kvRes && kvRes.error)) {
                writeSuccess = true;
            }
        } catch (kvWriteErr) {
            console.warn("Puter KV set failed (likely size limit, preserved in Puter FS):", kvWriteErr);
        }

        if (!writeSuccess) {
            throw new Error("Unable to save sync payload to Puter cloud.");
        }

        // Redraw lists and resolve indicators
        refreshHistory();
        setSyncing('synced');
        if (manual) showToast('Done syncing!', 2000, 'success');

    } catch (e) {
        console.error('Core Cloud Sync Stack Breakdown:', e);
        setSyncing('offline');
        showToast('Sync failed. Please check your network connection.', 4000, 'error');
        refreshHistory();
    }
}

// ==========================================
// QUIZ TAKES & RETAKE PERSISTENCE HELPERS
// ==========================================

export function getQuizTakes(quizKey) {
    try {
        const dbKey = constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1';
        const raw = localStorage.getItem(dbKey);
        const db = raw ? JSON.parse(raw) : {};
        if (quizKey) {
            return Array.isArray(db[quizKey]) ? db[quizKey] : [];
        }
        return db;
    } catch (e) {
        console.warn('Failed to parse quiz takes from storage:', e);
        return quizKey ? [] : {};
    }
}

export function saveQuizTake(quizKey, takeData) {
    if (!quizKey || !takeData) return;
    try {
        const dbKey = constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1';
        const raw = localStorage.getItem(dbKey);
        const db = raw ? JSON.parse(raw) : {};
        if (!Array.isArray(db[quizKey])) {
            db[quizKey] = [];
        }
        db[quizKey].push(takeData);
        localStorage.setItem(dbKey, JSON.stringify(db));
    } catch (e) {
        console.error('Failed to save quiz take:', e);
    }
}

export function deleteQuizTakes(quizKey) {
    if (!quizKey) return;
    try {
        const dbKey = constants.QUIZ_ATTEMPTS_DB_KEY || 'nodal_quiz_takes_v1';
        const raw = localStorage.getItem(dbKey);
        if (!raw) return;
        const db = JSON.parse(raw);
        if (db[quizKey]) {
            delete db[quizKey];
            localStorage.setItem(dbKey, JSON.stringify(db));
        }
    } catch (e) {
        console.error('Failed to delete quiz takes:', e);
    }
}

export async function deleteQuizPermanently(key) {
    if (!key) return;
    deleteQuizTakes(key);
    const quiz = state.quizHistory[key];
    state.deletedQuizKeys = state.deletedQuizKeys || JSON.parse(localStorage.getItem('nodal_deleted_quiz_keys') || '{}');
    state.deletedQuizKeys[key] = Date.now();
    localStorage.setItem('nodal_deleted_quiz_keys', JSON.stringify(state.deletedQuizKeys));

    if (quiz && quiz.share && quiz.share.shareId && window.puter && window.puter.fs && typeof puter.fs.delete === 'function') {
        try {
            await puter.fs.delete(quiz.share.shareId);
        } catch (e) {
            console.warn('Failed to delete shared file during permanent quiz deletion:', e);
        }
    }

    delete state.quizHistory[key];
    localStorage.setItem(DB_NAME, JSON.stringify(state.quizHistory));
    localStorage.setItem(DB_NAME + '_ts', Date.now().toString());
    refreshHistory();

    await syncHistoryWithCloud();
}

export function pruneGenerationLog(log = [], now = Date.now()) {
    if (!Array.isArray(log)) return [];
    return log
        .filter(ts => typeof ts === 'number' && now - ts < GENERATION_WINDOW_MS)
        .sort((a, b) => a - b);
}

export function getLocalGenerationLog() {
    try {
        const raw = localStorage.getItem(GENERATION_LOG_LOCAL_KEY);
        const log = raw ? JSON.parse(raw) : [];
        return pruneGenerationLog(log);
    } catch (e) {
        console.error('Read generation log failed', e);
        return [];
    }
}

export function saveLocalGenerationLog(log = []) {
    try {
        const pruned = pruneGenerationLog(log);
        localStorage.setItem(GENERATION_LOG_LOCAL_KEY, JSON.stringify(pruned));
        localStorage.setItem(GENERATION_LOG_LOCAL_KEY + '_ts', Date.now().toString());
        return pruned;
    } catch (e) {
        console.error('Save generation log failed', e);
        return [];
    }
}

export async function loadGenerationCooldownState() {
    let log = getLocalGenerationLog();
    if (typeof puter === 'undefined' || !puter.auth.isSignedIn()) {
        state.generationLog = log;
        return log;
    }

    // CRITICAL FIX: Fall back immediately to local logs if offline to avoid network rejections
    if (!navigator.onLine) {
        state.generationLog = log;
        return log;
    }

    try {
        const cloudRaw = await puter.kv.get(GENERATION_LOG_CLOUD_KEY);
        const cloudData = cloudRaw
            ? (typeof cloudRaw === 'string' ? JSON.parse(cloudRaw) : cloudRaw)
            : { timestamps: [], updatedAt: 0 };
        const cloudLog = pruneGenerationLog(cloudData.timestamps || []);
        const merged = [...new Set([...(log || []), ...cloudLog])].sort((a, b) => a - b);
        const pruned = pruneGenerationLog(merged);
        state.generationLog = pruned;
        saveLocalGenerationLog(pruned);
        await puter.kv.set(GENERATION_LOG_CLOUD_KEY, JSON.stringify({ timestamps: pruned, updatedAt: Date.now() }));
        return pruned;
    } catch (e) {
        console.error('Cooldown sync fail', e);
        state.generationLog = log;
        return log;
    }
}

export function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    const kb = bytes / 1024;
    if (kb < 1024) {
        return `${kb.toFixed(1)} KB`;
    }
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
}

/**
 * Calculates storage used by the logged-in user in Puter cloud storage.
 * Inspects Puter FS files, Puter KV sync data, and user account metrics.
 */
export async function calculatePuterStorageUsage() {
    let totalBytes = 0;
    let fileCount = 0;

    if (typeof puter === 'undefined' || !window.puter?.auth?.isSignedIn() || !navigator.onLine) {
        return {
            totalBytes: 0,
            formatted: '0 KB',
            fileCount: 0,
            isOffline: !navigator.onLine
        };
    }

    try {
        // 1. Files in user's app directory on Puter FS
        if (puter.fs && typeof puter.fs.readdir === 'function') {
            const items = await puter.fs.readdir('./').catch(() => []);
            if (Array.isArray(items)) {
                for (const it of items) {
                    totalBytes += (typeof it.size === 'number' ? it.size : 0);
                    fileCount++;
                }
            }
        }

        // 2. Fallback check for known sync files via stat if readdir was empty
        if (totalBytes === 0 && puter.fs && typeof puter.fs.stat === 'function') {
            const syncStat = await puter.fs.stat(PUTER_FS_SYNC_FILE, { returnSize: true }).catch(() => null);
            if (syncStat?.size) {
                totalBytes += syncStat.size;
                fileCount++;
            }
            const backupStat = await puter.fs.stat(PUTER_FS_BACKUP_FILE, { returnSize: true }).catch(() => null);
            if (backupStat?.size) {
                totalBytes += backupStat.size;
                fileCount++;
            }
        }

        // 3. Puter KV payload sizes
        if (puter.kv && typeof puter.kv.get === 'function') {
            try {
                const syncRaw = await puter.kv.get(CLOUD_SYNC_KEY);
                if (typeof syncRaw === 'string') {
                    totalBytes += new Blob([syncRaw]).size;
                }
            } catch (e) {}
            try {
                const logRaw = await puter.kv.get(GENERATION_LOG_CLOUD_KEY);
                if (typeof logRaw === 'string') {
                    totalBytes += new Blob([logRaw]).size;
                }
            } catch (e) {}
        }

        // 4. Check if Puter user object exposes total account storage
        try {
            const user = await puter.auth.getUser();
            if (user) {
                if (typeof user.storage_used === 'number') totalBytes = Math.max(totalBytes, user.storage_used);
                else if (typeof user.used_storage === 'number') totalBytes = Math.max(totalBytes, user.used_storage);
            }
        } catch (e) {}

        const formatted = formatBytes(totalBytes);
        return {
            totalBytes,
            formatted,
            fileCount,
            isOffline: false
        };
    } catch (err) {
        console.warn('Failed to calculate Puter storage usage:', err);
        return {
            totalBytes,
            formatted: formatBytes(totalBytes),
            fileCount,
            isOffline: false
        };
    }
}

/**
 * Resolves the authenticated user's email address from Puter.
 * Inspects user properties, username, local cache, and requests permission if available.
 */
export async function resolvePuterUserEmail(user) {
    if (!user) return null;

    // 1. Direct object properties
    const directEmail = user.email || user.email_address || user.primary_email || user.mail;
    if (directEmail && typeof directEmail === 'string' && directEmail.includes('@')) {
        try { localStorage.setItem('nodal_cached_email', directEmail); } catch (e) {}
        return directEmail;
    }

    // 2. If username itself is an email address
    if (user.username && typeof user.username === 'string' && user.username.includes('@')) {
        try { localStorage.setItem('nodal_cached_email', user.username); } catch (e) {}
        return user.username;
    }

    // 3. Local cached email from previous session
    try {
        const cached = localStorage.getItem('nodal_cached_email');
        if (cached && cached.includes('@')) return cached;
    } catch (e) {}

    // 4. Check if permission was already granted in Puter perms
    if (typeof puter !== 'undefined' && puter.perms && typeof puter.perms.check === 'function') {
        try {
            const hasPerm = await puter.perms.check('email');
            if (hasPerm && typeof puter.perms?.request === 'function') {
                const requested = await puter.perms.request('email');
                if (requested && typeof requested === 'string' && requested.includes('@')) {
                    try { localStorage.setItem('nodal_cached_email', requested); } catch (e) {}
                    return requested;
                }
            }
        } catch (e) {
            console.warn('Puter email permission check error:', e);
        }
    }

    return null;
}

export function getGenerationCooldownInfo(log = state.generationLog || []) {
    const pruned = pruneGenerationLog(log);
    const now = Date.now();
    const maxLongTerm = constants.MAX_GENERATIONS_PER_WINDOW || 10;
    const windowMs = constants.GENERATION_WINDOW_MS || (3 * 60 * 60 * 1000);
    const shortTermMs = constants.SHORT_TERM_COOLDOWN_MS || (3 * 60 * 1000);
    const maxShortTerm = constants.SHORT_TERM_MAX_GENERATIONS || 2;

    const used = pruned.length;
    const remaining = Math.max(0, maxLongTerm - used);

    // Rule 1: Short-term window (2 quizzes per 3 minutes)
    const recentInShortTerm = pruned.filter(ts => (now - ts) < shortTermMs);
    const shortTermActive = recentInShortTerm.length >= maxShortTerm;
    const shortTermNextMs = shortTermActive
        ? Math.max(0, (recentInShortTerm[0] + shortTermMs) - now)
        : 0;

    // Rule 2: Long-term window (10 quizzes per 3 hours)
    const longTermActive = used >= maxLongTerm;
    const longTermNextMs = longTermActive
        ? Math.max(0, (pruned[0] + windowMs) - now)
        : 0;

    const isAllowed = !shortTermActive && !longTermActive;
    const nextAvailableInMs = Math.max(shortTermNextMs, longTermNextMs);

    return {
        used,
        remaining,
        nextAvailableInMs,
        isAllowed,
        shortTermActive,
        longTermActive,
        recentShortTermCount: recentInShortTerm.length
    };
}

export function formatMsDuration(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    if (totalSeconds <= 0) return '0s';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
}

export async function recordGenerationEvent() {
    const now = Date.now();
    const existingLog = getLocalGenerationLog();
    const log = pruneGenerationLog([...existingLog, now]);
    state.generationLog = saveLocalGenerationLog(log);
    if (typeof puter !== 'undefined' && puter.auth?.isSignedIn?.()) {
        try {
            await puter.kv.set(GENERATION_LOG_CLOUD_KEY, JSON.stringify({ timestamps: state.generationLog, updatedAt: now }));
        } catch (err) {
            console.error('Failed sync cooldown to cloud', err);
        }
    }
    return state.generationLog;
}

export async function refreshCooldownPanel() {
    if (!modalCooldownPanel) return;
    const log = await loadGenerationCooldownState();
    const info = getGenerationCooldownInfo(log);
    const maxWindow = constants.MAX_GENERATIONS_PER_WINDOW || 10;
    modalCooldownPanel.classList.remove('hidden');
    if (info.isAllowed) {
        modalCooldownStatus.textContent = `${info.remaining} / ${maxWindow} available`;
        modalCooldownStatus.className = 'text-sm font-bold text-green-400';
        modalCooldownDetail.textContent = `You can generate ${info.remaining} more quiz${info.remaining === 1 ? '' : 'zes'} in the next 3 hours (up to 2 per 3 minutes).`;
    } else {
        modalCooldownStatus.textContent = 'Cooldown active';
        modalCooldownStatus.className = 'text-sm font-bold text-yellow-400';
        modalCooldownDetail.textContent = `Next generation available in ${formatMsDuration(info.nextAvailableInMs)}.`;
    }
}

export function getGenerationCooldownWarning() {
    const localLog = getLocalGenerationLog();
    if (localLog && localLog.length > 0) {
        state.generationLog = localLog;
    }

    if (!state.generationLog || state.generationLog.length === 0) {
        return null;
    }

    const info = getGenerationCooldownInfo(state.generationLog);
    if (info.isAllowed) {
        return null;
    }

    if (info.shortTermActive) {
        const remainingMs = info.nextAvailableInMs;
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.ceil((remainingMs % 60000) / 1000);
        if (remainingMinutes > 0) {
            return `Cooldown active (limit: 2 quizzes per 3 mins). Please wait ${remainingMinutes}m ${remainingSeconds}s before generating another quiz.`;
        }
        return `Cooldown active (limit: 2 quizzes per 3 mins). Please wait ${remainingSeconds} seconds before generating another quiz.`;
    }

    if (info.longTermActive) {
        const maxLongTerm = constants.MAX_GENERATIONS_PER_WINDOW || 10;
        const remainingMs = info.nextAvailableInMs;
        const hours = Math.floor(remainingMs / (60 * 60 * 1000));
        const mins = Math.ceil((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
        const waitText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        return `Rate limit reached (${maxLongTerm} quizzes per 3 hours). Next generation available in ${waitText}.`;
    }

    return null;
}

export function getUniqueName(baseName) {
    let name = baseName.replace(/\.[^/.]+$/, '');
    let counter = 2;
    let finalName = name;
    const existingNames = Object.values(state.quizHistory).map(q => q.fileName);
    while (existingNames.includes(finalName)) {
        finalName = `${counter} ${name}`;
        counter++;
    }
    return finalName;
}

export async function updateAuthUI() {
    // 1. Defensive Guard: Check if the Puter cloud script failed to load or is missing entirely
    if (typeof puter === 'undefined') {
        if (elements.authBtnText) elements.authBtnText.textContent = 'Offline';
        setSyncing('offline');
        return;
    }

    try {
        const signedIn = puter.auth.isSignedIn();

        if (signedIn) {
            let customName = null;
            
            // CRITICAL FIX: Only query the cloud KV store if the browser is online
            if (navigator.onLine) {
                try {
                    customName = await puter.kv.get('custom_display_name');
                } catch (kvError) {
                    console.warn("Failed to fetch custom name from cloud while online:", kvError);
                }
            }

            if (elements.authBtnText) elements.authBtnText.textContent = customName || 'Account';
            if (elements.authBtn) {
                elements.authBtn.classList.remove('bg-blue-600');
                elements.authBtn.classList.add('bg-green-600');
            }
            
            // CRITICAL FIX: Only trigger background sync tracks if actively online
            if (navigator.onLine) {
                try {
                    await syncHistoryWithCloud();
                } catch (err) {
                    console.warn("syncHistoryWithCloud failed inside updateAuthUI:", err);
                }
                try {
                    await loadGenerationCooldownState();
                } catch (err) {
                    console.warn("loadGenerationCooldownState failed inside updateAuthUI:", err);
                }
            } else {
                setSyncing('offline');
            }
        } else {
            if (elements.authBtnText) elements.authBtnText.textContent = 'Puter Login';
            if (elements.authBtn) {
                elements.authBtn.classList.remove('bg-green-600');
                elements.authBtn.classList.add('bg-blue-600');
            }
            setSyncing('offline'); 
        }
    } catch (err) {
        console.error("Error during auth UI check:", err);
        if (elements.authBtnText) elements.authBtnText.textContent = 'Account';
        setSyncing('offline');
    }
}

export async function openAccountAsModal(pushHash = true) {
    if (!elements.accountModalOverlay || !elements.accountCard) return;
    if (!await confirmLeaveCustomizeIfActive()) return;

    // Show the small title card header when operating inside the floating overlay
    const cardHeader = document.getElementById('account-card-header');
    if (cardHeader) cardHeader.classList.remove('hidden');

    elements.accountModalOverlay.appendChild(elements.accountCard);

    // Reset scroll position to top only when opening fresh modal (pushHash === true)
    if (pushHash) {
        const loggedIn = document.getElementById('account-logged-in-content');
        const loggedOut = document.getElementById('account-logged-out-content');
        if (loggedIn) loggedIn.scrollTop = 0;
        if (loggedOut) loggedOut.scrollTop = 0;
    }

    elements.accountModalOverlay.classList.remove('hidden');
    if (pushHash) {
        pushSubState('#account-modal', { view: getActiveViewId() });
    } else {
        state.activeSubState = '#account-modal';
        state.authorizedSubStates = state.authorizedSubStates || new Set();
        state.authorizedSubStates.add('#account-modal');
    }
    await populateAccountData();
}

// Function for Nav Bar buttons (Shows as Full Page Dashboard)
export async function openAccountAsView() {
    if (!await confirmLeaveCustomizeIfActive()) return;

    // Hide the card header to prevent duplicate title layouts with the sticky header navbar
    const cardHeader = document.getElementById('account-card-header');
    if (cardHeader) cardHeader.classList.add('hidden');

    elements.accountViewContainer.appendChild(elements.accountCard);
    showView('account');
    await populateAccountData();
}

export async function populateAccountData() {
    const loggedInContent = document.getElementById('account-logged-in-content');
    const loggedOutContent = document.getElementById('account-logged-out-content');

    const rm = localStorage.getItem('nodal_reduce_motion') === 'true';
    const cb1 = document.getElementById('reduce-motion-toggle');
    const cb2 = document.getElementById('reduce-motion-toggle-logged-out');
    if (cb1) cb1.checked = rm;
    if (cb2) cb2.checked = rm;

    if (typeof puter === 'undefined' || !window.puter || !puter.auth.isSignedIn()) {
        if (loggedInContent) loggedInContent.classList.add('hidden');
        if (loggedOutContent) loggedOutContent.classList.remove('hidden');
        return;
    }

    if (loggedInContent) loggedInContent.classList.remove('hidden');
    if (loggedOutContent) loggedOutContent.classList.add('hidden');

    try {
        let username = 'User';
        let uuid = 'Unavailable';
        let email = 'Unavailable';
        let user = null;

        // CRITICAL FIX: Only poll profile parameters from cloud if online
        if (navigator.onLine) {
            try {
                user = await puter.auth.getUser();
                username = user.username || 'Unknown';
                uuid = user.uuid || user.id || user.accountId || 'Unknown';
            } catch (uErr) {
                console.warn("Failed to fetch user data from cloud:", uErr);
                username = localStorage.getItem('nodal_cached_username') || 'Account User';
                uuid = 'Offline Mode';
            }
        } else {
            username = localStorage.getItem('nodal_cached_username') || 'Account User';
            uuid = 'Offline Mode';
            email = 'Offline Mode';
        }

        if (elements.modalUsername) elements.modalUsername.textContent = username;
        if (document.getElementById('modal-account-id')) document.getElementById('modal-account-id').textContent = uuid;

        const emailEl = document.getElementById('modal-email');
        if (emailEl) {
            if (navigator.onLine && user) {
                const resolvedEmail = await resolvePuterUserEmail(user);
                if (resolvedEmail) {
                    emailEl.textContent = resolvedEmail;
                    emailEl.onclick = null;
                } else if (typeof puter !== 'undefined' && puter.perms && typeof puter.perms.request === 'function') {
                    emailEl.innerHTML = '<span class="text-blue-400 hover:text-blue-300 underline cursor-pointer text-xs font-semibold">Click to reveal email (Puter permission)</span>';
                    emailEl.onclick = async () => {
                        try {
                            const grantedEmail = await puter.perms.request('email');
                            if (grantedEmail && typeof grantedEmail === 'string' && grantedEmail.includes('@')) {
                                localStorage.setItem('nodal_cached_email', grantedEmail);
                                emailEl.textContent = grantedEmail;
                                emailEl.onclick = null;
                                showToast('Email verified and loaded!', 2500, 'success');
                            }
                        } catch (pErr) {
                            console.warn('User dismissed email permission request:', pErr);
                        }
                    };
                } else {
                    emailEl.textContent = email;
                }
            } else {
                emailEl.textContent = email;
            }
        }

        let creditLabel = 'Balance unavailable';
        let progressWidth = 0;

        // CRITICAL FIX: Only poll monthly usages if online
        if (navigator.onLine) {
            try {
                const usage = await puter.auth.getMonthlyUsage();
                const remaining = usage?.allowanceInfo?.remaining;
                const allowance = usage?.allowanceInfo?.monthUsageAllowance;
                if (typeof remaining === 'number') {
                    creditLabel = allowance ? `${Math.round(remaining)} / ${Math.round(allowance)} remaining` : `${Math.round(remaining)} remaining`;
                    if (typeof allowance === 'number' && allowance > 0) {
                        progressWidth = Math.min(100, Math.max(0, (remaining / allowance) * 100));
                    } else {
                        progressWidth = 100;
                    }
                }
            } catch (err) {
                console.error('Failed to fetch monthly usage', err);
            }
        } else {
            creditLabel = 'Offline (Usage details hidden)';
            progressWidth = 0;
        }

        if (document.getElementById('modal-credits')) document.getElementById('modal-credits').textContent = creditLabel;
        if (document.getElementById('credit-progress')) document.getElementById('credit-progress').style.width = `${progressWidth}%`;

        const showCredits = isUsingPuterAI();
        if (document.getElementById('modal-credit-panel')) {
            document.getElementById('modal-credit-panel').classList.toggle('hidden', !showCredits || !navigator.onLine);
        }
        if (document.getElementById('modal-storage-panel')) {
            document.getElementById('modal-storage-panel').classList.remove('hidden');
        }

        const storageLabel = document.getElementById('modal-storage-label');
        const storageDetail = document.getElementById('modal-storage-detail');
        if (storageLabel && !navigator.onLine) {
            storageLabel.textContent = 'Offline';
            storageLabel.className = 'text-sm font-bold text-gray-400';
            if (storageDetail) storageDetail.textContent = 'Connect to the internet to view cloud storage.';
        } else if (storageLabel) {
            storageLabel.textContent = 'Calculating...';
            calculatePuterStorageUsage().then(info => {
                if (storageLabel) {
                    storageLabel.textContent = info.isOffline ? 'Offline' : `${info.formatted} Used`;
                    storageLabel.className = 'text-sm font-bold text-blue-400';
                }
                if (storageDetail) {
                    storageDetail.textContent = info.isOffline 
                        ? 'Connect to the internet to view cloud storage.' 
                        : `Free Cloud Tier • ${info.fileCount} cloud file${info.fileCount === 1 ? '' : 's'} & sync data`;
                }
            }).catch(err => {
                console.warn('Storage calculation error in modal:', err);
                if (storageLabel) storageLabel.textContent = '0 KB Used';
            });
        }

        let customName = '';
        if (navigator.onLine) {
            try {
                customName = await puter.kv.get('custom_display_name');
                if (customName) localStorage.setItem('nodal_cached_username', customName);
            } catch (kvErr) {
                console.warn("Failed to fetch display name:", kvErr);
                customName = localStorage.getItem('nodal_cached_username') || '';
            }
        } else {
            customName = localStorage.getItem('nodal_cached_username') || '';
        }
        if (document.getElementById('display-name-input')) document.getElementById('display-name-input').value = customName || '';
        if (elements.authBtnText) elements.authBtnText.textContent = customName || (navigator.onLine ? 'Account' : 'Account (Offline)');

        await refreshCooldownPanel();
    } catch (globalPanelErr) {
        console.error("Error populating layout panel values:", globalPanelErr);
    }
}

export async function saveDisplayName() {
    const newName = displayNameInput.value.trim();
    if (newName) {
        setSyncing(true);
        await puter.kv.set('custom_display_name', newName);
        setSyncing(false);
        showToast(`Display name updated to: ${newName}`);
        updateAuthUI();
    }
}

export function closeAccountHandler(fromPopState = false) {
    // If it's inside the modal overlay, just hide the modal with smooth exit animation
    if (elements.accountCard.parentElement?.id === 'account-modal-overlay') {
        clearSubState('#account-modal');
        closeModalWithAnimation(elements.accountModalOverlay, () => {
            if (!fromPopState && window.location.hash === '#account-modal') {
                window.history.back();
            }
        });
    } else {
        // If it's inside the view, go back to start screen
        showView('start');
    }
}

export function setReduceMotion(enabled) {
    state.isReduceMotion = !!enabled;
    localStorage.setItem('nodal_reduce_motion', state.isReduceMotion ? 'true' : 'false');
    document.documentElement.classList.toggle('reduce-motion', state.isReduceMotion);
    const cb1 = document.getElementById('reduce-motion-toggle');
    const cb2 = document.getElementById('reduce-motion-toggle-logged-out');
    if (cb1) cb1.checked = state.isReduceMotion;
    if (cb2) cb2.checked = state.isReduceMotion;
}

export function showToast(message, duration = 3000, type = 'success') {
    if (state.toastTimeout) {
        clearTimeout(state.toastTimeout);
    }
    if (state.toastExitTimeout) {
        clearTimeout(state.toastExitTimeout);
    }
    toastMessageEl.textContent = message;
    toastEl.classList.remove('hidden', 'bg-green-600', 'bg-red-600', 'bg-yellow-600', 'bg-gray-700', 'border', 'border-gray-600', 'toast-out');
    if (type === 'error') {
        toastEl.classList.add('bg-red-600');
    } else if (type === 'warning') {
        toastEl.classList.add('bg-yellow-600');
    } else if (type === 'info' || type === 'neutral') {
        toastEl.classList.add('bg-gray-700', 'border', 'border-gray-600');
    } else {
        toastEl.classList.add('bg-green-600');
    }
    
    // Enable quick click-to-dismiss on toast with animation
    toastEl.onclick = () => {
        if (state.toastTimeout) clearTimeout(state.toastTimeout);
        if (state.toastExitTimeout) clearTimeout(state.toastExitTimeout);
        if (!state.isReduceMotion) {
            toastEl.classList.remove('toast-in');
            toastEl.classList.add('toast-out');
            state.toastExitTimeout = setTimeout(() => {
                toastEl.classList.add('hidden');
                toastEl.classList.remove('toast-out');
            }, 180);
        } else {
            toastEl.classList.add('hidden');
        }
    };

    if (!state.isReduceMotion) {
        toastEl.classList.add('toast-in');
    }

    state.toastTimeout = setTimeout(() => {
        if (!state.isReduceMotion) {
            toastEl.classList.remove('toast-in');
            toastEl.classList.add('toast-out');
            state.toastExitTimeout = setTimeout(() => {
                toastEl.classList.add('hidden');
                toastEl.classList.remove('toast-out');
            }, 180);
        } else {
            toastEl.classList.add('hidden');
        }
    }, duration);
}

export function showLoadingOverlay(title = 'Please wait...', message = 'Processing request...') {
    const overlay = elements.loadingOverlay || document.getElementById('loading-overlay');
    const titleEl = elements.loadingOverlayTitle || document.getElementById('loading-overlay-title');
    const msgEl = elements.loadingOverlayMessage || document.getElementById('loading-overlay-message');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (overlay) {
        overlay.classList.remove('hidden');
    }
}

export function hideLoadingOverlay() {
    const overlay = elements.loadingOverlay || document.getElementById('loading-overlay');
    if (overlay) {
        closeModalWithAnimation(overlay);
    }
}

export function updateNavHighlights(activeKey) {
    const effectiveKey = (activeKey === 'statistics' || activeKey === 'review')
        ? (state.navRootOrigin || 'history')
        : (activeKey === 'whats-new' ? 'help' : activeKey);

    // 1. Update Mobile Nav
    if (elements.mobileNavHomeBtn) {
        elements.mobileNavHomeBtn.classList.toggle('text-white', effectiveKey === 'home');
        elements.mobileNavHomeBtn.classList.toggle('bg-blue-600', effectiveKey === 'home');
        elements.mobileNavHomeBtn.classList.toggle('text-gray-300', effectiveKey !== 'home');
    }
    if (elements.mobileNavHistoryBtn) {
        elements.mobileNavHistoryBtn.classList.toggle('text-white', effectiveKey === 'history');
        elements.mobileNavHistoryBtn.classList.toggle('bg-blue-600', effectiveKey === 'history');
        elements.mobileNavHistoryBtn.classList.toggle('text-gray-300', effectiveKey !== 'history');
    }

    // --- NEW: Track if current layout is nested inside the Mobile Menu overlay drawer ---
    const isMenuPage = ['help', 'about', 'account', 'downloads', 'whats-new'].includes(effectiveKey);
    if (elements.mobileNavMenuBtn) {
        elements.mobileNavMenuBtn.classList.toggle('text-white', isMenuPage);
        elements.mobileNavMenuBtn.classList.toggle('bg-blue-600', isMenuPage);
        elements.mobileNavMenuBtn.classList.toggle('text-gray-300', !isMenuPage);
    }

    // --- NEW: Active context highlights directly on buttons inside the open Modal list ---
    if (elements.mobileMenuDownloadsBtn) {
        elements.mobileMenuDownloadsBtn.classList.toggle('text-white', effectiveKey === 'downloads');
        elements.mobileMenuDownloadsBtn.classList.toggle('bg-blue-600', effectiveKey === 'downloads');
        elements.mobileMenuDownloadsBtn.classList.toggle('bg-gray-700/30', effectiveKey !== 'downloads');
        elements.mobileMenuDownloadsBtn.classList.toggle('text-gray-300', effectiveKey !== 'downloads');
    }
    if (elements.mobileMenuHelpBtn) {
        elements.mobileMenuHelpBtn.classList.toggle('text-white', effectiveKey === 'help');
        elements.mobileMenuHelpBtn.classList.toggle('bg-blue-600', effectiveKey === 'help');
        elements.mobileMenuHelpBtn.classList.toggle('bg-gray-700/30', effectiveKey !== 'help');
        elements.mobileMenuHelpBtn.classList.toggle('text-gray-300', effectiveKey !== 'help');
    }
    if (elements.mobileMenuAboutBtn) {
        elements.mobileMenuAboutBtn.classList.toggle('text-white', effectiveKey === 'about');
        elements.mobileMenuAboutBtn.classList.toggle('bg-blue-600', effectiveKey === 'about');
        elements.mobileMenuAboutBtn.classList.toggle('bg-gray-700/30', effectiveKey !== 'about');
        elements.mobileMenuAboutBtn.classList.toggle('text-gray-300', effectiveKey !== 'about');
    }
    if (elements.mobileMenuAccountBtn) {
        elements.mobileMenuAccountBtn.classList.toggle('text-white', effectiveKey === 'account');
        elements.mobileMenuAccountBtn.classList.toggle('bg-blue-600', effectiveKey === 'account');
        elements.mobileMenuAccountBtn.classList.toggle('bg-gray-700/30', effectiveKey !== 'account');
        elements.mobileMenuAccountBtn.classList.toggle('text-gray-300', effectiveKey !== 'account');
    }

    // 2. Update Desktop Nav
    const map = {
        home: elements.desktopNavHomeBtn,
        history: elements.desktopNavHistoryBtn,
        downloads: elements.desktopNavDownloadsBtn,
        help: elements.desktopNavHelpBtn,
        about: elements.desktopNavAboutBtn,
        account: elements.desktopNavAccountBtn
    };

    Object.keys(map).forEach(key => {
        const btn = map[key];
        if (btn) {
            btn.classList.toggle('text-white', key === effectiveKey);
            btn.classList.toggle('bg-blue-600', key === effectiveKey);
            btn.classList.toggle('text-gray-300', key !== effectiveKey);
        }
    });
}

const scrollReactiveHeaderObservers = new Map();

export function setupScrollReactiveHeader(viewId) {
    const configMap = {
        'history-fullscreen': {
            headerSelector: '#history-fullscreen-view .scroll-reactive-header',
            sentinelId: 'history-header-sentinel'
        },
        help: {
            headerSelector: '#help-view .scroll-reactive-header',
            sentinelId: 'help-header-sentinel'
        },
        about: {
            headerSelector: '#about-view .scroll-reactive-header',
            sentinelId: 'about-header-sentinel'
        },
        // --- NEW: Registers Account panel into the Intersection Observer system ---
        account: {
            headerSelector: '#account-view .scroll-reactive-header',
            sentinelId: 'account-header-sentinel'
        },
        statistics: {
            headerSelector: '#statistics-view .scroll-reactive-header',
            sentinelId: 'statistics-header-sentinel'
        },
        review: {
            headerSelector: '#review-view .scroll-reactive-header',
            sentinelId: 'review-header-sentinel'
        },
        downloads: {
            headerSelector: '#downloads-view .scroll-reactive-header',
            sentinelId: 'downloads-header-sentinel'
        },
        'whats-new': {
            headerSelector: '#whats-new-view .scroll-reactive-header',
            sentinelId: 'whats-new-header-sentinel'
        }
    };

    const config = configMap[viewId];
    if (!config) return;

    const header = document.querySelector(config.headerSelector);
    const sentinel = document.getElementById(config.sentinelId);
    if (!header || !sentinel) return;

    const existingCleanup = scrollReactiveHeaderObservers.get(viewId);
    if (existingCleanup) {
        if (typeof existingCleanup === 'function') {
            existingCleanup();
        } else if (existingCleanup.disconnect) {
            existingCleanup.disconnect();
        }
    }

    const getScrollTop = () => window.scrollY || document.documentElement.scrollTop || 0;
    const isAtTop = () => getScrollTop() <= 5;
    const isNearEnd = () => {
        const scrollTop = getScrollTop();
        const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return scrollTop > 5 && (scrollTop + clientHeight >= scrollHeight - 20);
    };

    // Set initial state based on current scroll position
    if (isAtTop()) {
        header.classList.remove('is-stuck');
    }

    // Hysteresis Observer:
    // When sentinel exits view, or near end of page, stick header.
    // When sentinel intersects, ONLY unstick if user is truly at the top (scrollTop <= 5).
    // If the intersection is an artifact of header shrinking or lack of scroll space,
    // PRIORITIZE THE SMALL HEADER to eliminate resize flickering loops.
    const observer = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting || isNearEnd()) {
            header.classList.add('is-stuck');
        } else {
            if (isAtTop()) {
                header.classList.remove('is-stuck');
            } else {
                header.classList.add('is-stuck');
            }
        }
    }, { threshold: 0 });

    observer.observe(sentinel);

    // Passive scroll listener to enforce state stability on fast flick or bounce scrolls
    let rafId = null;
    const onScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            const scrollTop = getScrollTop();
            if (scrollTop <= 5) {
                header.classList.remove('is-stuck');
            } else if (scrollTop > 15 || isNearEnd()) {
                header.classList.add('is-stuck');
            }
        });
    };

    window.addEventListener('scroll', onScroll, { passive: true });

    const cleanup = () => {
        observer.disconnect();
        window.removeEventListener('scroll', onScroll);
        if (rafId) cancelAnimationFrame(rafId);
    };

    scrollReactiveHeaderObservers.set(viewId, cleanup);
}

export function viewToHash(viewId) {
    switch (viewId) {
        case 'start': return '#home';
        case 'history-fullscreen': return '#history';
        case 'downloads': return '#downloads';
        case 'help': return '#help';
        case 'about': return '#about';
        case 'account': return '#account';
        case 'quiz': return '#quiz';
        case 'results': return '#results';
        case 'loading': return '#loading';
        case 'statistics': return '#statistics';
        case 'review': return '#review';
        case 'whats-new': return '#whats-new';
        default: return '#home';
    }
}

export function hashToView(hash) {
    const cleanHash = (hash || '').replace(/^#/, '').toLowerCase();
    switch (cleanHash) {
        case 'home':
        case '': return 'start';
        case 'history': return 'history-fullscreen';
        case 'downloads': return 'downloads';
        case 'help': return 'help';
        case 'about': return 'about';
        case 'account': return 'account';
        case 'quiz': return 'quiz';
        case 'results': return 'results';
        case 'loading': return 'loading';
        case 'statistics': return 'statistics';
        case 'review': return 'review';
        case 'whats-new': return 'whats-new';
        case 'history-actions': return 'history-fullscreen';
        case 'offline-modal': return (getActiveViewId() === 'downloads' ? 'downloads' : 'history-fullscreen');
        case 'account-modal': return getActiveViewId() || 'start';
        case 'import-choice': return 'start';
        default: return 'start';
    }
}

export const SUB_STATE_HASHES = [
    '#customize',
    '#edit',
    '#remedial-setup',
    '#import-choice',
    '#ai-choice',
    '#ai-prompt',
    '#paste-json',
    '#account-modal',
    '#share',
    '#share-config',
    '#share-live',
    '#share-manage',
    '#history-actions',
    '#shared-quiz',
    '#offline-modal',
    '#migration-modal',
    '#migration-choice',
    '#migration-progress',
    '#migration-error'
];

export function pushSubState(hash, extraState = {}) {
    if (!SUB_STATE_HASHES.includes(hash)) return;
    state.activeSubState = hash;
    state.authorizedSubStates = state.authorizedSubStates || new Set();
    state.authorizedSubStates.add(hash);
    if (state.preModalScrollY === null || state.preModalScrollY === undefined) {
        state.preModalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }
    if (window.location.hash !== hash) {
        window.history.pushState({ 
            view: getActiveViewId(), 
            subState: hash, 
            fromApp: true, 
            preScrollY: state.preModalScrollY,
            ...extraState 
        }, '', hash);
    }
}

export function replaceSubState(hash, extraState = {}) {
    if (!state.authorizedSubStates) {
        state.authorizedSubStates = new Set();
    }
    state.authorizedSubStates.add(hash);
    if (state.preModalScrollY === null || state.preModalScrollY === undefined) {
        state.preModalScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    }
    window.history.replaceState({ 
        view: getActiveViewId(), 
        subState: hash, 
        fromApp: true, 
        preScrollY: state.preModalScrollY,
        ...extraState 
    }, '', hash);
}

export function clearSubState(hash) {
    if (state.authorizedSubStates) {
        state.authorizedSubStates.delete(hash);
    }
    if (state.activeSubState === hash) {
        state.activeSubState = null;
    }
}

export function isSubStateAuthorized(hash, eventState = null) {
    if (!SUB_STATE_HASHES.includes(hash)) return true;

    // In-session navigation generated by the app is always authorized
    if (eventState && (eventState.fromApp || eventState.subState === hash)) {
        return true;
    }
    if (state.authorizedSubStates && state.authorizedSubStates.has(hash)) {
        return true;
    }

    // Prerequisite context checks for privacy and state safety
    if (hash === '#remedial-setup') {
        return !!(state.incorrectQuestionsForRemedial && state.incorrectQuestionsForRemedial.length > 0) || !!state.currentQuizConfig?.isRemedial;
    }
    if (hash === '#customize') {
        return (state.currentFiles && state.currentFiles.length > 0) || (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0);
    }
    if (hash === '#edit') {
        return !!state.isCustomizingHistory && !!state.customizingQuizData;
    }
    if (hash === '#ai-choice' || hash === '#ai-prompt') {
        return (state.currentFiles && state.currentFiles.length > 0) || 
            (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0) || 
            (!!state.isCustomizingHistory && !!state.customizingQuizData) ||
            !!state.currentQuizConfig?.isRemedial ||
            !!(state.incorrectQuestionsForRemedial && state.incorrectQuestionsForRemedial.length > 0) ||
            !!state.currentQuizConfig;
    }
    if (hash === '#account-modal') {
        return true;
    }
    if (hash.startsWith('#share')) {
        return !!(state.currentShareQuizKey || eventState?.quizKey || state.lastHistoryMenuKey || state.currentStatsQuizKey);
    }
    if (hash === '#history-actions') {
        return !!(state.activeHistoryMenuKey || state.lastHistoryMenuKey || eventState?.quizKey || state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key'));
    }
    if (hash === '#shared-quiz') {
        return elements.sharedQuizModal && !elements.sharedQuizModal.classList.contains('hidden');
    }
    if (hash === '#offline-modal') {
        return !!(state.activeOfflineModalKey || eventState?.quizKey || state.lastHistoryMenuKey || state.currentStatsQuizKey);
    }
    if (hash.startsWith('#migration')) {
        return true;
    }
    return true;
}

export function getActiveViewId() {
    for (const [id, el] of Object.entries(elements.views)) {
        if (el && el.classList.contains('active')) return id;
    }
    return 'start';
}

export function isCustomizingQuizGeneration() {
    if (getActiveViewId() !== 'start') return false;
    const customizeSection = elements.customizeSection || document.getElementById('customize-section');
    const customizeContent = elements.customizeContent || document.getElementById('customize-content');
    const isSectionVisible = (customizeSection && !customizeSection.classList.contains('hidden')) ||
                             (customizeContent && !customizeContent.classList.contains('hidden'));
    const hasFiles = (state.currentFiles && state.currentFiles.length > 0) ||
                     (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0);
    const isSubState = state.activeSubState === '#customize' || state.activeSubState === '#edit';
    const isHist = !!state.isCustomizingHistory || !!state.customizingQuizData;
    return isSectionVisible || hasFiles || isSubState || isHist;
}

export async function confirmLeaveCustomizeIfActive() {
    if (!isCustomizingQuizGeneration()) {
        return true;
    }

    const confirmed = await customConfirm(
        'You are currently customizing quiz generation. Leaving this page will cancel your current quiz setup and clear your selected documents.\n\nDo you want to stay or cancel generation?',
        'Customizing Quiz Generation',
        'Cancel Generation',
        'Stay',
        true
    );

    if (confirmed) {
        clearSubState('#customize');
        clearSubState('#edit');
        state.isCustomizingHistory = false;
        const { resetApp } = await import('./quiz/quizUtils.js');
        resetApp(true);
        showToast('Quiz customization cancelled.', 2000, 'neutral');
        return true;
    }

    return false;
}

export function showView(id, pushHash = true) {
    // 1. Switch the visible page
    Object.values(elements.views).forEach(v => { if (v) v.classList.remove('active'); });
    if (elements.views[id]) elements.views[id].classList.add('active');
    
    // 2. Hide navigation during active quiz
    if (id === 'quiz' || id === 'results' || id === 'loading') {
        document.body.classList.add('quiz-active');
    } else {
        document.body.classList.remove('quiz-active');
        state.preQuizHash = viewToHash(id);
        try { sessionStorage.setItem('nodal_pre_quiz_hash', state.preQuizHash); } catch(e) {}
    }

    // 3. Reset scroll position to topmost of the page immediately upon navigation
    state.preModalScrollY = null;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (elements.views[id]) {
        elements.views[id].scrollTop = 0;
    }
    requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        if (elements.views[id]) {
            elements.views[id].scrollTop = 0;
        }
    });

    // 4. Automatically highlight the correct nav button!
    let navKey = id;
    if (id === 'start') {
        navKey = 'home';
        updateResumeButtonVisibility();
    }
    if (id === 'history-fullscreen') navKey = 'history';
    if (id === 'whats-new') navKey = 'help';
    if (id === 'statistics' || id === 'review') {
        navKey = state.navRootOrigin || 'history';
    }
    updateNavHighlights(navKey);

    setupScrollReactiveHeader(id);

    // 4. Update URL hash if requested and differs
    if (pushHash) {
        const targetHash = viewToHash(id);
        if (window.location.hash !== targetHash) {
            window.history.pushState({ view: id }, '', targetHash);
        }
    }
}

let isPopStateHandling = false;

export async function handlePopState(event) {
    if (isPopStateHandling) return;
    isPopStateHandling = true;

    try {
        const targetHash = window.location.hash || '#home';
        const targetViewId = hashToView(targetHash);
        const currentViewId = getActiveViewId();

        // 0. DIRECT URL ACCESS GUARD
        // Privacy & integrity check: disallow opening sub-states/modals by typing the # tag directly in address bar
        if (SUB_STATE_HASHES.includes(targetHash) && !isSubStateAuthorized(targetHash, event.state)) {
            console.warn(`[Router] Direct manual access to ${targetHash} blocked for privacy/safety. Redirecting to #home.`);
            window.history.replaceState({ view: 'start' }, '', '#home');
            showView('start', false);
            return;
        }

        // 1. Check open Confirm / Unanswered Modals
        if (elements.confirmModal && !elements.confirmModal.classList.contains('hidden')) {
            window.history.pushState(event.state || { view: currentViewId }, '', window.location.hash);
            elements.cancelConfirmBtn?.click();
            return;
        }
        if (elements.unansweredModal && !elements.unansweredModal.classList.contains('hidden')) {
            window.history.pushState(event.state || { view: currentViewId }, '', window.location.hash);
            elements.unansweredModal.classList.add('hidden');
            return;
        }

        // 2. Share Modal Sub-Steps & Dismiss
        const shareModal = document.getElementById('share-modal');
        if (shareModal && !shareModal.classList.contains('hidden')) {
            if (targetHash === '#share-config' || targetHash === '#share-manage' || targetHash === '#share-live') {
                const step = targetHash === '#share-config' ? 'config' : 'manage';
                navigateToShareStep(step, false);
                return;
            } else if (targetHash === '#share') {
                navigateToShareStep('menu', false);
                return;
            } else {
                closeShareModal(true);
            }
        }

        // 2c. AI Choice Modal Dismiss
        if (elements.aiChoiceModal && !elements.aiChoiceModal.classList.contains('hidden')) {
            if (targetHash !== '#ai-choice') {
                closeAiChoiceModal(true);
                if (targetHash === '#remedial-setup') {
                    const { openRemedialSetupModal } = await import('./quiz/quizResults.js');
                    openRemedialSetupModal(false, true);
                    return;
                }
                if (targetHash === '#customize' || targetHash === '#edit') {
                    return;
                }
            }
        }

        // 2d. Remedial Setup Modal Dismiss
        const remedialModal = elements.remedialSetupModal || document.getElementById('remedial-setup-modal');
        if (remedialModal && !remedialModal.classList.contains('hidden')) {
            if (targetHash !== '#remedial-setup') {
                const { closeRemedialSetupModal } = await import('./quiz/quizResults.js');
                closeRemedialSetupModal(true);
                if (targetHash === '#results') {
                    return;
                }
            }
        }

        // 3. AI Prompt Modal Dismiss
        if (elements.aiPromptModal && !elements.aiPromptModal.classList.contains('hidden')) {
            if (targetHash !== '#ai-prompt') {
                closeAiPromptModal(true);
                if (targetHash === '#remedial-setup') {
                    const { openRemedialSetupModal } = await import('./quiz/quizResults.js');
                    openRemedialSetupModal(false, true);
                    return;
                }
                if (targetHash === '#customize' || targetHash === '#edit') {
                    return;
                }
                if (targetHash === '#ai-choice') {
                    if (elements.aiChoiceModal) elements.aiChoiceModal.classList.remove('hidden');
                    return;
                }
            }
        }

        // 3b. Paste JSON Modal Dismiss
        if (elements.pasteJsonModal && !elements.pasteJsonModal.classList.contains('hidden')) {
            if (targetHash !== '#paste-json') {
                closePasteJsonModal(true);
                if (targetHash === '#customize' || targetHash === '#edit') {
                    return;
                }
            }
        }

        // 3c. Import Choice Modal Dismiss
        if (elements.importChoiceModal && !elements.importChoiceModal.classList.contains('hidden')) {
            if (targetHash !== '#import-choice') {
                closeImportChoiceModal(true);
                if (targetHash === '#customize' || targetHash === '#edit' || targetHash === '#paste-json') {
                    return;
                }
            }
        }

        // 4. Account Modal Overlay Dismiss
        if (elements.accountModalOverlay && !elements.accountModalOverlay.classList.contains('hidden')) {
            if (targetHash !== '#account-modal') {
                elements.accountModalOverlay.classList.add('hidden');
                clearSubState('#account-modal');
                if (targetHash === '#home') {
                    if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
                        window.scrollTo({ top: state.preModalScrollY, behavior: 'instant' });
                        state.preModalScrollY = null;
                    } else if (event.state?.preScrollY !== undefined) {
                        window.scrollTo({ top: event.state.preScrollY, behavior: 'instant' });
                    }
                    return;
                }
            }
        }

        // 5. Mobile Menu Dismiss
        if (elements.mobileMenuModal && !elements.mobileMenuModal.classList.contains('hidden')) {
            elements.mobileMenuModal.classList.add('hidden');
        }

        // 5a. History Actions Submenu Modal Dismiss
        if (elements.historyActionsModal && !elements.historyActionsModal.classList.contains('hidden')) {
            if (targetHash !== '#history-actions') {
                closeHistoryActionsModal(true, false);
                if (targetHash === '#history') {
                    const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                    if (currentViewId !== 'history-fullscreen') {
                        showAllHistoryFullScreen(false);
                    }
                    if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
                        window.scrollTo({ top: state.preModalScrollY, behavior: 'instant' });
                        state.preModalScrollY = null;
                    } else if (event.state?.preScrollY !== undefined) {
                        window.scrollTo({ top: event.state.preScrollY, behavior: 'instant' });
                    }
                    return;
                }
            }
        }

        // 5b. Shared Quiz Action Modal Dismiss
        if (elements.sharedQuizModal && !elements.sharedQuizModal.classList.contains('hidden')) {
            if (targetHash !== '#shared-quiz') {
                closeSharedQuizModal(true);
                if (targetHash === '#home') {
                    showView('start', false);
                    return;
                }
            }
        }

        // 5c. Offline Download Modal Dismiss
        if (elements.offlineModal && !elements.offlineModal.classList.contains('hidden')) {
            if (targetHash !== '#offline-modal') {
                const { closeOfflineModal } = await import('./quiz/quizOffline.js');
                closeOfflineModal(true);
            }
        }

        // 5d. Migration Modal Dismiss
        const migrationModal = document.getElementById('migration-modal');
        if (migrationModal && !migrationModal.classList.contains('hidden')) {
            if (targetHash !== '#migration-modal' && targetHash !== '#migration-choice' && targetHash !== '#migration-progress') {
                const { closeMigrationModal } = await import('./quiz/quizMigration.js');
                closeMigrationModal(true);
            }
        }

        // 5e. Migration Error Modal Dismiss
        const migrationErrorModal = document.getElementById('migration-error-modal');
        if (migrationErrorModal && !migrationErrorModal.classList.contains('hidden')) {
            if (targetHash !== '#migration-error') {
                const { closeMigrationErrorModal } = await import('./quiz/quizMigration.js');
                closeMigrationErrorModal(true);
            }
        }

        // 5f. Netlify Migration Notice & Guide Modals Dismiss
        const netlifyNotice = document.getElementById('netlify-migration-notice-modal');
        if (netlifyNotice && !netlifyNotice.classList.contains('hidden')) {
            const { closeNetlifyMigrationNoticeModal } = await import('./quiz/quizMigration.js');
            closeNetlifyMigrationNoticeModal();
        }
        const netlifyGuide = document.getElementById('netlify-migration-guide-modal');
        if (netlifyGuide && !netlifyGuide.classList.contains('hidden')) {
            const { closeNetlifyMigrationGuideModal } = await import('./quiz/quizMigration.js');
            closeNetlifyMigrationGuideModal();
        }

        // 5g. Post-Quiz Navigation Guard:
        // Case 1: Browser Back button pressed while viewing quiz results
        if (currentViewId === 'results') {
            if (targetHash !== '#results' && targetHash !== '#remedial-setup') {
                const redirectHash = state.preQuizHash || sessionStorage.getItem('nodal_pre_quiz_hash') || '#home';
                console.log(`[Router] Back navigation from results view. Redirecting to pre-quiz page: ${redirectHash}`);
                window.history.replaceState({ view: hashToView(redirectHash) }, '', redirectHash);
                await restoreRouteFromHash(redirectHash);
                return;
            }
        }

        // Case 2: Block entering or returning to #quiz or #loading once a quiz has completed
        if (state.isQuizCompleted && (targetHash === '#quiz' || targetHash === '#loading' || targetViewId === 'quiz')) {
            const redirectHash = state.preQuizHash || sessionStorage.getItem('nodal_pre_quiz_hash') || '#home';
            console.log(`[Router] Access to ${targetHash} blocked after quiz completion. Redirecting to ${redirectHash}`);
            window.history.replaceState({ view: hashToView(redirectHash) }, '', redirectHash);
            await restoreRouteFromHash(redirectHash);
            return;
        }

        // 6. Active Quiz (#quiz) - Prompt before leaving
        if (currentViewId === 'quiz') {
            window.history.pushState({ view: 'quiz' }, '', '#quiz');
            const shouldExit = await customConfirm('Save progress and return to the home screen?', 'Return Home', 'Save & Exit', 'Cancel');
            if (shouldExit) {
                const { saveAndGoHome } = await import('./quiz/quizUtils.js');
                saveAndGoHome();
            }
            return;
        }

        // 6b. Quiz Generation in Progress (#loading) - Prompt before aborting
        if (currentViewId === 'loading') {
            window.history.pushState({ view: 'loading' }, '', '#loading');
            const shouldCancel = await customConfirm(
                'Quiz generation is currently in progress. Do you want to cancel and return to the home screen?',
                'Cancel Quiz Generation',
                'Yes, Cancel',
                'Keep Generating',
                true
            );
            if (shouldCancel) {
                const { cancelNodalAiGeneration } = await import('./quiz/quizGeneration.js');
                cancelNodalAiGeneration();
            }
            return;
        }

        // 7. Document Upload Customization Screen (#customize)
        const isCustomizingDocs = isCustomizingQuizGeneration();
        if (isCustomizingDocs) {
            if (targetHash !== '#customize') {
                window.history.pushState({ view: 'start', subState: '#customize', fromApp: true }, '', '#customize');
                const confirmed = await customConfirm(
                    'You are currently customizing quiz generation. Leaving this page will cancel your current quiz setup and clear your selected documents.\n\nDo you want to stay or cancel generation?',
                    'Customizing Quiz Generation',
                    'Cancel Generation',
                    'Stay',
                    true
                );
                if (confirmed) {
                    clearSubState('#customize');
                    const { resetApp } = await import('./quiz/quizUtils.js');
                    resetApp(true);
                    window.history.replaceState({ view: 'start' }, '', '#home');
                    showToast('Quiz generation cancelled.', 2000, 'neutral');
                }
                return;
            }
        }

        // 8. History Quiz Edit Mode (#edit)
        const isCustomizingHist = (currentViewId === 'start') && (
            (state.activeSubState === '#edit') || state.isCustomizingHistory
        );
        if (isCustomizingHist) {
            if (targetHash !== '#edit') {
                window.history.pushState({ view: 'start', subState: '#edit', fromApp: true }, '', '#edit');
                if (hasUnsavedChanges()) {
                    const wantsToSave = await customConfirm(
                        'You have unsaved changes! Do you want to save them before exiting?\n\n• OK = Save changes\n• Cancel = Discard changes',
                        'Unsaved Changes',
                        'Save Changes',
                        'Discard',
                        false
                    );
                    if (wantsToSave) {
                        const { handleQuizGeneration } = await import('./quiz/quizGeneration.js');
                        handleQuizGeneration(false, true);
                        return;
                    }
                }
                clearSubState('#edit');
                const { resetApp } = await import('./quiz/quizUtils.js');
                resetApp(true);
                if (state.editOriginView === 'history-fullscreen') {
                    const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                    window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
                    showAllHistoryFullScreen();
                } else {
                    window.history.replaceState({ view: 'start' }, '', '#home');
                    showView('start', false);
                }
                showToast('Customization closed.', 2000, 'info');
                return;
            }
        }

        // 9. Re-open Modals when popping back into them
        if (targetHash === '#history-actions') {
            const quizKey = event.state?.quizKey || state.activeHistoryMenuKey || state.lastHistoryMenuKey || state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key');
            state.historyOrigin = 'nav';
            const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
            showAllHistoryFullScreen(false);
            updateNavHighlights('history');
            if (quizKey && state.quizHistory && state.quizHistory[quizKey]) {
                state.activeHistoryMenuKey = quizKey;
                state.lastHistoryMenuKey = quizKey;
                await openHistoryActionsModal(quizKey, false);
            }
            return;
        }

        if (targetHash === '#account-modal') {
            const baseView = event.state?.view || (getActiveViewId() !== 'account' ? getActiveViewId() : 'start');
            showView(baseView, false);
            await openAccountAsModal(false);
            return;
        }

        if (targetHash === '#offline-modal') {
            const offKey = event.state?.quizKey || state.activeOfflineModalKey || state.lastHistoryMenuKey || state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key');
            const baseView = event.state?.view || getActiveViewId() || 'downloads';
            showView(baseView, false);
            if (offKey && state.quizHistory && state.quizHistory[offKey]) {
                const { openOfflineModal } = await import('./quiz/quizOffline.js');
                openOfflineModal(offKey, false);
            }
            return;
        }

        if (targetHash.startsWith('#share')) {
            const shareModalEl = document.getElementById('share-modal');
            if (!shareModalEl || shareModalEl.classList.contains('hidden')) {
                const shareKey = event.state?.quizKey || state.currentShareQuizKey || state.lastHistoryMenuKey || state.currentStatsQuizKey;
                if (shareKey && state.quizHistory && state.quizHistory[shareKey]) {
                    openShareModal(shareKey);
                }
            }
            const step = targetHash === '#share-config' ? 'config' : (targetHash === '#share-manage' || targetHash === '#share-live' ? 'manage' : 'menu');
            navigateToShareStep(step, false);
            return;
        }

        if (targetHash === '#import-choice') {
            openImportChoiceModal(true);
            return;
        }

        if (targetHash === '#ai-choice') {
            if (elements.aiChoiceModal) elements.aiChoiceModal.classList.remove('hidden');
            return;
        }

        if (targetHash === '#ai-prompt') {
            if (elements.aiPromptModal) {
                elements.aiPromptModal.classList.remove('hidden');
                const noticeEl = elements.aiServiceNotice || document.getElementById('ai-service-notice');
                if (noticeEl) {
                    noticeEl.classList.toggle('hidden', !state.aiPromptShowNotice);
                }
            }
            return;
        }

        if (targetHash === '#paste-json') {
            openPasteJsonModal(true);
            return;
        }

        if (targetHash === '#remedial-setup') {
            const baseView = event.state?.view || 'results';
            showView(baseView, false);
            const { openRemedialSetupModal } = await import('./quiz/quizResults.js');
            openRemedialSetupModal(false, true);
            return;
        }

        // 10. Standard View Navigation (#home, #history, #help, #about, #account, #results, #statistics, #review, #whats-new)
        if (targetViewId === 'start') {
            const wasStart = currentViewId === 'start';
            if (!wasStart) {
                showView('start', false);
            }
            refreshHistory();
            if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
                window.scrollTo({ top: state.preModalScrollY, behavior: 'instant' });
                state.preModalScrollY = null;
            } else if (event.state?.preScrollY !== undefined) {
                window.scrollTo({ top: event.state.preScrollY, behavior: 'instant' });
            } else if (!wasStart) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
            updateNavHighlights('home');
        } else if (targetViewId === 'history-fullscreen') {
            state.historyOrigin = 'nav';
            const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
            const wasHistory = currentViewId === 'history-fullscreen';
            if (!wasHistory) {
                showAllHistoryFullScreen(false);
            }
            if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
                window.scrollTo({ top: state.preModalScrollY, behavior: 'instant' });
                state.preModalScrollY = null;
            } else if (event.state?.preScrollY !== undefined) {
                window.scrollTo({ top: event.state.preScrollY, behavior: 'instant' });
            }
            updateNavHighlights('history');
        } else if (targetViewId === 'account') {
            const wasAccount = currentViewId === 'account';
            if (!wasAccount) {
                await openAccountAsView();
            } else {
                await populateAccountData();
            }
            if (state.preModalScrollY !== null && state.preModalScrollY !== undefined) {
                const targetY = state.preModalScrollY;
                window.scrollTo({ top: targetY, behavior: 'instant' });
                requestAnimationFrame(() => {
                    window.scrollTo({ top: targetY, behavior: 'instant' });
                });
                state.preModalScrollY = null;
            } else if (event.state?.preScrollY !== undefined) {
                const targetY = event.state.preScrollY;
                window.scrollTo({ top: targetY, behavior: 'instant' });
                requestAnimationFrame(() => {
                    window.scrollTo({ top: targetY, behavior: 'instant' });
                });
            }
            updateNavHighlights('account');
        } else if (targetViewId === 'statistics') {
            const statsKey = event.state?.quizKey || state.currentStatsQuizKey || state.lastHistoryMenuKey || localStorage.getItem('nodal_last_stats_key');
            if (statsKey && state.quizHistory && state.quizHistory[statsKey]) {
                state.currentStatsQuizKey = statsKey;
                localStorage.setItem('nodal_last_stats_key', statsKey);
                state.statisticsOrigin = event.state?.origin || state.statisticsOrigin || 'history';
                const { renderQuizStatistics } = await import('./quiz/quizStatistics.js');
                renderQuizStatistics(statsKey);
                showView('statistics', false);
            } else {
                const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                showAllHistoryFullScreen(false);
                updateNavHighlights('history');
            }
        } else if (targetViewId === 'downloads') {
            const { renderDownloadsView } = await import('./quiz/quizOffline.js');
            renderDownloadsView(false);
            updateNavHighlights('downloads');
        } else if (targetViewId === 'review') {
            const reviewTake = event.state?.takeData || state.currentReviewTake;
            const statsKey = event.state?.quizKey || state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key');
            if (reviewTake) {
                state.currentReviewTake = reviewTake;
                if (statsKey) state.currentStatsQuizKey = statsKey;
                state.reviewOrigin = event.state?.origin || state.reviewOrigin || 'statistics';
                const { renderTestReview } = await import('./quiz/quizStatistics.js');
                renderTestReview(reviewTake);
                showView('review', false);
            } else if (statsKey && state.quizHistory && state.quizHistory[statsKey]) {
                state.currentStatsQuizKey = statsKey;
                const { openQuizStatistics } = await import('./quiz/quizStatistics.js');
                openQuizStatistics(statsKey, false);
            } else {
                showView('start', false);
                updateNavHighlights('home');
            }
        } else if (targetViewId === 'whats-new') {
            showView('whats-new', false);
            updateNavHighlights('help');
        } else if (targetViewId === 'help') {
            showView('help', false);
            updateNavHighlights('help');
        } else if (targetViewId === 'about') {
            showView('about', false);
            updateNavHighlights('about');
        } else {
            showView(targetViewId, false);
        }

    } finally {
        isPopStateHandling = false;
    }
}

export async function restoreRouteFromHash(hash) {
    const clean = (hash || '').replace(/^#/, '').toLowerCase();
    
    if (clean === 'history') {
        state.historyOrigin = 'nav';
        const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
        showAllHistoryFullScreen(false);
        updateNavHighlights('history');
    } else if (clean === 'downloads') {
        const { renderDownloadsView } = await import('./quiz/quizOffline.js');
        renderDownloadsView(false);
        updateNavHighlights('downloads');
    } else if (clean === 'help') {
        showView('help', false);
        updateNavHighlights('help');
    } else if (clean === 'about') {
        showView('about', false);
        updateNavHighlights('about');
    } else if (clean === 'whats-new') {
        showView('whats-new', false);
        updateNavHighlights('help');
    } else if (clean === 'account') {
        await openAccountAsView();
        updateNavHighlights('account');
    } else if (clean === 'account-modal') {
        showView('start', false);
        await openAccountAsModal(false);
    } else if (clean === 'history-actions') {
        const lastKey = state.activeHistoryMenuKey || state.lastHistoryMenuKey || localStorage.getItem('nodal_last_stats_key');
        state.historyOrigin = 'nav';
        const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
        showAllHistoryFullScreen(false);
        updateNavHighlights('history');
        if (lastKey && state.quizHistory && state.quizHistory[lastKey]) {
            await openHistoryActionsModal(lastKey, false);
        }
    } else if (clean === 'statistics') {
        const lastKey = state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key');
        if (lastKey && state.quizHistory && state.quizHistory[lastKey]) {
            state.currentStatsQuizKey = lastKey;
            const { openQuizStatistics } = await import('./quiz/quizStatistics.js');
            openQuizStatistics(lastKey, false);
        } else {
            const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
            showAllHistoryFullScreen(false);
            window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
            updateNavHighlights('history');
        }
    } else if (clean === 'review') {
        const lastKey = state.currentStatsQuizKey || localStorage.getItem('nodal_last_stats_key');
        let reviewTake = state.currentReviewTake;
        if (!reviewTake) {
            try {
                const rawTake = sessionStorage.getItem('nodal_last_review_take');
                if (rawTake) reviewTake = JSON.parse(rawTake);
            } catch(e) {}
        }
        if (reviewTake) {
            state.currentReviewTake = reviewTake;
            const { renderTestReview } = await import('./quiz/quizStatistics.js');
            renderTestReview(reviewTake);
            showView('review', false);
            updateNavHighlights('history');
        } else if (lastKey && state.quizHistory && state.quizHistory[lastKey]) {
            const { openQuizStatistics } = await import('./quiz/quizStatistics.js');
            openQuizStatistics(lastKey, false);
            window.history.replaceState({ view: 'statistics' }, '', '#statistics');
            updateNavHighlights('history');
        } else {
            showView('start', false);
            window.history.replaceState({ view: 'start' }, '', '#home');
            updateNavHighlights('home');
        }
    } else if (clean === 'migration-import' || clean === 'import') {
        showView('start', false);
        const { openMigrationModal } = await import('./quiz/quizMigration.js');
        openMigrationModal('import', false);
    } else if (clean === 'remedial-setup') {
        if (!state.questions || state.questions.length === 0) {
            const redirectHash = state.preQuizHash || sessionStorage.getItem('nodal_pre_quiz_hash') || '#home';
            window.history.replaceState({ view: hashToView(redirectHash) }, '', redirectHash);
            await restoreRouteFromHash(redirectHash);
        } else {
            showView('results', false);
            const { openRemedialSetupModal } = await import('./quiz/quizResults.js');
            openRemedialSetupModal(false, true);
        }
    } else if (clean === 'results') {
        if (!state.questions || state.questions.length === 0) {
            const redirectHash = state.preQuizHash || sessionStorage.getItem('nodal_pre_quiz_hash') || '#home';
            window.history.replaceState({ view: hashToView(redirectHash) }, '', redirectHash);
            await restoreRouteFromHash(redirectHash);
        } else {
            showView('results', false);
        }
    } else if (clean === 'quiz' || clean === 'loading') {
        if (state.isQuizCompleted || !state.questions || state.questions.length === 0) {
            const redirectHash = state.preQuizHash || sessionStorage.getItem('nodal_pre_quiz_hash') || '#home';
            window.history.replaceState({ view: hashToView(redirectHash) }, '', redirectHash);
            await restoreRouteFromHash(redirectHash);
        } else {
            showView('quiz', false);
        }
    } else {
        showView('start', false);
        updateNavHighlights('home');
    }
}

export async function initRouter() {
    const initialHash = window.location.hash;
    const isMigrationImport = initialHash === '#migration-import' || initialHash === '#import';
    let isUpdating = false;
    try {
        isUpdating = sessionStorage.getItem('nodal_is_updating') === 'true';
    } catch(e) {}

    window.addEventListener('popstate', handlePopState);

    // If website was being updated, reset route to #home and clear flag
    if (isUpdating) {
        try { sessionStorage.removeItem('nodal_is_updating'); } catch(e) {}
        window.history.replaceState({ view: 'start' }, '', '#home');
        showView('start', false);
        updateNavHighlights('home');
        return;
    }

    if (isMigrationImport) {
        window.history.replaceState({ view: 'start' }, '', '#home');
        showView('start', false);
        updateNavHighlights('home');
        import('./quiz/quizMigration.js').then(({ openMigrationModal }) => {
            openMigrationModal('import', false);
            showToast('Welcome to Nodal on Vercel! Select your .nodal backup file to restore all your data.', 7000, 'info');
        }).catch(err => console.error('Failed to launch migration modal for import hash', err));
        return;
    }

    // Normal refresh or first navigation: restore specific page from URL hash
    if (!initialHash || initialHash === '#home' || initialHash === '#') {
        window.history.replaceState({ view: 'start' }, '', '#home');
        showView('start', false);
        updateNavHighlights('home');
    } else {
        await restoreRouteFromHash(initialHash);
    }
}

export function getQuizDB() {
    try {
        const d = localStorage.getItem(DB_NAME);
        return d ? JSON.parse(d) : {};
    } catch (e) {
        console.error('Read DB fail', e);
        return {};
    }
}

export function saveQuizToDB(key, data) {
    try {
        const existingQuiz = state.quizHistory[key] || {};
        let finalName = (data.fileName && data.fileName.trim()) || existingQuiz.fileName || state.currentFileName || 'Untitled Quiz';
        const existingEntries = Object.entries(state.quizHistory);
        let counter = 2;
        const baseName = finalName.replace(/\.[^/.]+$/, '');

        while (existingEntries.some(([k, v]) => k !== key && v.fileName === finalName)) {
            finalName = `${counter} ${baseName}`;
            counter++;
        }

        // MERGE: Keep old 'share' data, source share info, and update the rest
        state.quizHistory[key] = {
            ...existingQuiz,
            questions: data.questions, 
            fileName: finalName, 
            config: data.config, 
            timestamp: Date.now(),
            ...(data.sourceShareId ? { sourceShareId: data.sourceShareId } : {}),
            ...(data.sourceShareUrl ? { sourceShareUrl: data.sourceShareUrl } : {}),
            ...(data.share ? { share: data.share } : {})
        };

        localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
        localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());
        
        syncHistoryWithCloud();
        return true;
    } catch (e) {
        console.error('Save DB fail', e);
        elements.statusMessage.textContent = 'Err saving history.';
        return false;
    }
}

export function formatTime(secs) {
    if (!secs || secs <= 0) return '';
    const mins = Math.floor(secs / 60);
    if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        const rMins = mins % 60;
        return rMins > 0 ? `(${hrs}h ${rMins}m)` : `(${hrs}h)`;
    }
    return `(${mins}m)`;
}

export function getQuizTypeLabel(config = {}, questions = []) {
    const raw = (config.customTypeShort || config.customType || config.type || '').toString().trim().toLowerCase().replace(/[_\-\/]/g, '');
    if (raw === 'mc' || raw === 'multiplechoice') return 'MC';
    if (raw === 'tf' || raw === 'trueorfalse' || raw === 'truefalse') return 'T/F';
    if (raw === 'id' || raw === 'identification') return 'ID';
    if (raw === 'en' || raw === 'enumeration') return 'EN';
    if (raw === 'mix' || raw === 'mixed') return 'MIX';

    const mc = (config.mc !== undefined ? config.mc : (config.counts?.mc)) || 0;
    const tf = (config.tf !== undefined ? config.tf : (config.counts?.tf)) || 0;
    const id = (config.id !== undefined ? config.id : (config.counts?.id)) || 0;
    const en = (config.en !== undefined ? config.en : (config.counts?.en)) || 0;
    const active = [];
    if (mc > 0) active.push('MC');
    if (tf > 0) active.push('T/F');
    if (id > 0) active.push('ID');
    if (en > 0) active.push('EN');
    if (active.length > 1) return 'MIX';
    if (active.length === 1) return active[0];

    if (Array.isArray(questions) && questions.length > 0) {
        const typesFound = new Set();
        for (const q of questions) {
            const qt = (q.type || '').toString().trim().toLowerCase().replace(/[_\-\/]/g, '');
            const isTF = qt === 'trueorfalse' || qt === 'truefalse' || qt === 'tf' || (
                Array.isArray(q.options) && q.options.length === 2 &&
                q.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase()))
            );
            if (isTF) typesFound.add('T/F');
            else if (qt === 'identification' || qt === 'id') typesFound.add('ID');
            else if (qt === 'enumeration' || qt === 'en') typesFound.add('EN');
            else typesFound.add('MC');
        }
        if (typesFound.size > 1) return 'MIX';
        if (typesFound.size === 1) return [...typesFound][0];
    }

    return 'MC';
}

export function refreshHistory() {
    const isCustomizing = state.isCustomizingHistory || (state.currentFiles && state.currentFiles.length > 0) || !document.getElementById('customize-content')?.classList.contains('hidden');
    if (isCustomizing) {
        setHistoryVisibility(false);
    } else {
        setHistoryVisibility(true);
    }

    // Hide lazy skeleton and reveal history list
    const skeleton = elements.historySkeleton || document.getElementById('history-skeleton');
    if (skeleton) skeleton.classList.add('hidden');
    if (elements.historyList) elements.historyList.classList.remove('hidden');

    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    // 1. CLEAR BOTH CONTAINERS
    if (elements.historyList) elements.historyList.innerHTML = '';
    
    const fullContainer = elements.historyFullList || document.getElementById('history-full-list');
    if (fullContainer) fullContainer.innerHTML = '';
    
    // Handle empty state
    if (sorted.length === 0) {
        const homeEmptyHTML = `
            <div class="text-center py-6 sm:py-8 px-4 space-y-2.5">
                <div class="p-3 bg-blue-500/10 text-blue-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                        <path d="M6 6h10M6 10h10"/>
                    </svg>
                </div>
                <h3 class="text-base font-bold text-gray-200">No Saved Quizzes</h3>
                <p class="text-xs text-gray-400 max-w-sm mx-auto">You haven't generated or saved any quizzes yet. Upload a document above to create your first practice quiz.</p>
            </div>
        `;
        const fullEmptyHTML = `
            <div class="text-center py-12 px-4 space-y-3">
                <div class="p-3 bg-blue-500/10 text-blue-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/>
                        <path d="M6 6h10M6 10h10"/>
                    </svg>
                </div>
                <h3 class="text-base font-bold text-gray-200">No Saved Quizzes</h3>
                <p class="text-xs text-gray-400 max-w-sm mx-auto">You haven't generated or saved any quizzes yet. Upload a document on the home page or import your history from another device.</p>
            </div>
        `;
        if (elements.historyList) elements.historyList.innerHTML = homeEmptyHTML;
        if (fullContainer) fullContainer.innerHTML = fullEmptyHTML;
        elements.showAllHistoryBtn?.classList.add('hidden');
        return;
    }

    // 2. MANAGE HOME SCREEN COMPACT LIST (Limit to 3 items on desktop)
    const isDesktop = window.innerWidth >= 768;
    const compactDisplayItems = isDesktop ? sorted.slice(0, 3) : sorted;

    if (isDesktop && sorted.length > 3) {
        elements.showAllHistoryBtn?.classList.remove('hidden');
    } else {
        elements.showAllHistoryBtn?.classList.add('hidden');
    }

    // Helper function to generate uniform inner HTML for both list items
    function generateQuizItemHTML(key, data, showDelete = false) {
        const config = data.config || {};
        const tInfo = formatTime(config.totalTime);
        const typeLabel = getQuizTypeLabel(config, data.questions);
        const diffName = config.difficulty || (config.customType === 'mixed' ? 'custom' : 'easy');
        const diffTxt = `(${diffName})`;
        
        const attInfo = config.isAttemptLimited ? `(${config.maxAttempts} att)` : '';
        const summaryInfo = config.showAnswersInSummaryOnly ? '(Summ Only)' : '';
        
        const isShared = data.share && data.share.isShared;
        const shareIconHTML = isShared ? `
            <span class="text-blue-400 bg-blue-500/10 p-1 rounded inline-flex items-center flex-shrink-0" title="Currently sharing via link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </span>
        ` : '';

        return `
            <div class="flex-grow min-w-0 mr-4 overflow-hidden">
                <div class="flex items-center gap-2 min-w-0 mb-1 w-full">
                    <p class="font-semibold text-sm truncate min-w-0" title="${data.fileName || 'Untitled'}">
                        ${data.fileName || 'Untitled'}
                    </p>
                    ${shareIconHTML}
                </div>
                <p class="text-xs text-gray-400 truncate">${config.count || 0} Qs (${typeLabel}) ${diffTxt} ${tInfo} ${attInfo} ${summaryInfo}</p>
            </div>
            <!-- Mobile 2-button layout: 3-dot Options (Submenu) and Load -->
            <div class="flex md:hidden flex-shrink-0 gap-1.5 items-center">
                <button class="h-7 w-7 bg-gray-700/90 hover:bg-gray-700 text-gray-200 rounded-lg inline-flex items-center justify-center border border-gray-600/60 transition-colors" data-key="${key}" data-action="history-submenu" title="Quiz Options" aria-label="Quiz Options">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                    </svg>
                </button>
                <button class="h-7 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2.5 rounded-lg inline-flex items-center justify-center gap-1 transition-colors border border-blue-500/50" data-key="${key}" data-action="load" title="Load Quiz">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
            </div>
            <!-- Desktop buttons: Option, Edit, Load -->
            <div class="hidden md:flex flex-shrink-0 gap-1 sm:gap-2"> 
                <button class="bg-gray-700 hover:bg-gray-600 text-gray-200 text-xs font-bold py-1 px-2.5 sm:px-3 rounded inline-flex items-center justify-center gap-1.5 border border-gray-600/60 transition-colors cursor-pointer" data-key="${key}" data-action="history-submenu" title="Quiz Options" aria-label="Quiz Options">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                    </svg>
                    <span>Option</span>
                </button>
                <button class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1 transition-colors cursor-pointer" data-key="${key}" data-action="customize" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"/></svg>
                    <span>Edit</span>
                </button>
                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1 transition-colors cursor-pointer" data-key="${key}" data-action="load" title="Load">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
            </div>
        `;
    }

    // 3. RENDER COMPACT LIST (Homepage - desktop Delete button hidden)
    if (elements.historyList) {
        compactDisplayItems.forEach(([key, data]) => {
            const item = document.createElement('div');
            item.className = 'p-2 sm:p-3 bg-gray-700/50 rounded-lg flex justify-between items-center gap-2';
            item.innerHTML = generateQuizItemHTML(key, data, false);
            elements.historyList.appendChild(item);
        });
    }

    // 4. RENDER FULL SCREEN LIST (If container exists in DOM layout - desktop Delete button visible)
    if (fullContainer) {
        sorted.forEach(([key, data]) => {
            const item = document.createElement('div');
            item.className = 'p-2 sm:p-3 bg-gray-700/50 rounded-lg flex justify-between items-center gap-2';
            item.innerHTML = generateQuizItemHTML(key, data, true);
            fullContainer.appendChild(item);
        });
    }
}

export function getCustomizeState() {
    let preset = '10';
    const selectedRadio = document.querySelector('input[name="time_preset"]:checked');
    if (selectedRadio) preset = selectedRadio.value;
    const selectedUiMode = document.querySelector('input[name="ui_mode"]:checked')?.value || 'modern';
    return {
        name: editQuizNameInput.value.trim(),
        timeLimit: timeLimitToggle.checked,
        timePreset: preset,
        customTime: parseInt(customTimeLimitInput.value, 10) || 15,
        attemptLimit: attemptLimitToggle.checked,
        attempts: parseInt(attemptLimitInput.value, 10) || 3,
        summaryOnly: summaryOnlyToggle.checked,
        uiMode: selectedUiMode,
        // --- Packed Advanced Configurations ---
        timerMode: elements.timerModeSelect ? elements.timerModeSelect.value : 'quiz',
        questionTime: elements.questionTimeInput ? parseInt(elements.questionTimeInput.value, 10) || 30 : 30,
        enableSecondChance: elements.secondChanceToggle ? elements.secondChanceToggle.checked : false,
        maxChances: elements.maxChancesInput ? parseInt(elements.maxChancesInput.value, 10) || 1 : 1,
        randomizeQuestions: elements.shuffleQuestionsToggle ? elements.shuffleQuestionsToggle.checked : true,
        randomizeChoices: elements.shuffleChoicesToggle ? elements.shuffleChoicesToggle.checked : true,
        allowChangeSelection: elements.allowChangeToggle ? elements.allowChangeToggle.checked : false
    };
}

export function hasUnsavedChanges() {
    if (!state.isCustomizingHistory) return false;
    const current = getCustomizeState();
    const initial = state.initialCustomizeState || {};
    return current.name !== initial.name ||
        current.timeLimit !== initial.timeLimit ||
        current.timePreset !== initial.timePreset ||
        current.customTime !== initial.customTime ||
        current.timerMode !== initial.timerMode ||
        current.questionTime !== initial.questionTime ||
        current.attemptLimit !== initial.attemptLimit ||
        current.attempts !== initial.attempts ||
        current.summaryOnly !== initial.summaryOnly ||
        current.uiMode !== initial.uiMode ||
        current.enableSecondChance !== initial.enableSecondChance ||
        current.maxChances !== initial.maxChances ||
        current.randomizeQuestions !== initial.randomizeQuestions ||
        current.randomizeChoices !== initial.randomizeChoices ||
        current.allowChangeSelection !== initial.allowChangeSelection;
}

export function setupCustomizeView(config, name) {
    state.isCustomizingHistory = true;
    renameContainer.classList.remove('hidden');
    const cleanName = (name || '').slice(0, 35);
    editQuizNameInput.value = cleanName;

    startSubtitle.textContent = `Customizing: "${cleanName || 'quiz'}" (Options only)`;
    generateQuizBtn.textContent = 'Start Customized Quiz';
    elements.saveCustomizeBtn?.classList.add('hidden');
    cancelCustomizeBtn.classList.remove('hidden');
    deleteCustomizeBtn.classList.remove('hidden');
    fileActionsDiv.classList.add('hidden');

    // Purge any lingering uploaded documents from previous sessions
    if (elements.selectedFilesContainer) elements.selectedFilesContainer.classList.add('hidden');
    document.getElementById('selected-files-container')?.classList.add('hidden');
    if (elements.selectedFilesList) elements.selectedFilesList.innerHTML = '';
    const selFilesListEl = document.getElementById('selected-files-list');
    if (selFilesListEl) selFilesListEl.innerHTML = '';
    state.currentFiles = [];
    state.fileContent = '';
    state.fileHash = '';

    // Reset advanced options to pristine defaults before applying quiz config
    if (elements.shuffleQuestionsToggle) elements.shuffleQuestionsToggle.checked = true;
    if (elements.shuffleChoicesToggle) elements.shuffleChoicesToggle.checked = true;
    if (summaryOnlyToggle) summaryOnlyToggle.checked = false;
    if (elements.allowChangeToggle) elements.allowChangeToggle.checked = false;
    if (elements.allowchangetoggle) elements.allowchangetoggle.checked = false;
    if (elements.secondChanceToggle) elements.secondChanceToggle.checked = false;
    document.getElementById('second-chance-options')?.classList.add('hidden');
    if (elements.maxChancesInput) elements.maxChancesInput.value = 1;
    if (timeLimitToggle) timeLimitToggle.checked = false;
    timeLimitOptions?.classList.add('hidden');
    if (elements.timerModeSelect) elements.timerModeSelect.value = 'quiz';
    document.getElementById('quiz-time-presets-container')?.classList.remove('hidden');
    document.getElementById('question-time-container')?.classList.add('hidden');
    if (elements.questionTimeInput) elements.questionTimeInput.value = 30;
    const time10m = document.getElementById('time-10m');
    if (time10m) time10m.checked = true;
    if (customTimeInputContainer) customTimeInputContainer.classList.add('hidden');
    if (customTimeLimitInput) customTimeLimitInput.value = 15;
    if (attemptLimitToggle) attemptLimitToggle.checked = false;
    if (attemptLimitOptions) attemptLimitOptions.classList.add('hidden');
    if (attemptLimitInput) attemptLimitInput.value = 3;

    elements.resumeQuizBtn.classList.add('hidden');

    customizeSection.classList.remove('hidden');
    customizeContent.classList.remove('hidden');
    customizeToggleIcon.classList.add('rotate-180');

    // Horizontally expand start-view on desktop
    document.getElementById('start-view')?.classList.add('customize-expanded');

    // Hide history section while customization is open
    setHistoryVisibility(false);

    // =====================================================================
    // CLEAN CUSTOMIZATION UI OVERHAUL (HIDES INACTIVE CONTROLS)
    // =====================================================================
    
    // 1. Locate the top-most wrapper layout rows
    const countGroup = document.getElementById('question-count-group') || questionCountInput.closest('.mb-4, .space-y-4, div');
    const diffGroup = document.getElementById('difficulty-group') || 
                      document.querySelector('.difficulty-section') || 
                      difficultyRadios[0]?.closest('.mb-6, .mb-4, .space-y-4, div');
    const quizTypeGroup = document.getElementById('quiz-type-group');
    
    // Hide all interactive configuration selectors from the form layout grid
    if (countGroup) countGroup.classList.add('hidden');
    if (diffGroup) diffGroup.classList.add('hidden');
    if (quizTypeGroup) quizTypeGroup.classList.add('hidden');

    // 2. Parse configuration attributes to build clean text summary labels
    const qCount = config.count || 10;
    const rawDiff = config.difficulty || 'easy';
    const capitalizedDiff = rawDiff.charAt(0).toUpperCase() + rawDiff.slice(1);
    
    const customType = config.customType || (config.type || 'mixed');
    let typeText = 'Mixed Types';
    if (customType === 'multiple-choice') typeText = 'Multiple Choice Only';
    else if (customType === 'true-or-false') typeText = 'True / False Only';
    else if (customType === 'identification') typeText = 'Identification Only';
    else if (customType === 'enumeration') typeText = 'Enumeration Only';

    // 3. Prevent duplication by purging an existing summary banner instance
    document.getElementById('quiz-custom-summary-banner')?.remove();

    // 4. Construct and inject the custom metadata overview row container widget
    const summaryBanner = document.createElement('div');
    summaryBanner.id = 'quiz-custom-summary-banner';
    summaryBanner.className = 'w-full bg-gray-800/80 border border-gray-700/60 rounded-xl p-4 mb-5 flex flex-wrap gap-4 items-center justify-around text-center shadow-md animate-fade-in';
    summaryBanner.innerHTML = `
        <div class="flex flex-col px-2">
            <span class="text-xs text-gray-400 font-medium tracking-wide uppercase">Questions Count</span>
            <span class="text-base font-bold text-blue-400 mt-0.5">${qCount} Items</span>
        </div>
        <div class="h-8 w-px bg-gray-700/50 hidden sm:block"></div>
        <div class="flex flex-col px-2">
            <span class="text-xs text-gray-400 font-medium tracking-wide uppercase">Difficulty Mode</span>
            <span class="text-base font-bold text-indigo-400 mt-0.5">${capitalizedDiff}</span>
        </div>
        <div class="h-8 w-px bg-gray-700/50 hidden sm:block"></div>
        <div class="flex flex-col px-2">
            <span class="text-xs text-gray-400 font-medium tracking-wide uppercase">Question Structure</span>
            <span class="text-base font-bold text-purple-400 mt-0.5">${typeText}</span>
        </div>
    `;

    // Put our visual summary card right at the very top of your options panel view frame
    customizeContent.insertBefore(summaryBanner, customizeContent.firstChild);

    // Keep form background element states assigned accurately so generation requests remain pristine
    questionCountInput.value = qCount;
    difficultyRadios.forEach(radio => {
        radio.checked = radio.value === rawDiff;
    });
    if (customQuestionTypeSelect) {
        customQuestionTypeSelect.value = customType;
    }
    if (customType === 'mixed') {
        const mcInput = document.getElementById('mc-count');
        const tfInput = document.getElementById('tf-count');
        const idInput = document.getElementById('id-count');
        const enInput = document.getElementById('en-count');
        
        if (mcInput) mcInput.value = config.mcCount !== undefined ? config.mcCount : (config.mc || 0);
        if (tfInput) tfInput.value = config.tfCount !== undefined ? config.tfCount : (config.tf || 0);
        if (idInput) idInput.value = config.id || 0;
        if (enInput) enInput.value = config.en || 0;
    }
    handleCustomTypeChange();

    // Set UI Mode
    const savedUiMode = config.uiMode || 'modern';
    const targetUiRadio = document.querySelector(`input[name="ui_mode"][value="${savedUiMode}"]`);
    if (targetUiRadio) targetUiRadio.checked = true;

    // --- Unpack Time Limit & Presets ---
    if (timeLimitToggle) {
        timeLimitToggle.checked = !!config.isTimed;
        handleTimeToggle();
        if (config.isTimed) {
            const totalMinutes = Math.max(1, Math.round((config.totalTime || 600) / 60));
            const presetVal = config.timePreset || (['5', '10', '15'].includes(String(totalMinutes)) ? String(totalMinutes) : 'custom');
            const presetRadio = document.querySelector(`input[name="time_preset"][value="${presetVal}"]`);
            if (presetRadio) {
                presetRadio.checked = true;
            }
            if (presetVal === 'custom' && customTimeLimitInput) {
                customTimeLimitInput.value = config.customTime || totalMinutes;
            }
            handleTimePresetChange();
        }
    }

    // --- Unpack Attempt Limit ---
    if (attemptLimitToggle) {
        attemptLimitToggle.checked = !!config.isAttemptLimited;
        attemptLimitOptions?.classList.toggle('hidden', !attemptLimitToggle.checked);
        if (attemptLimitInput && config.maxAttempts) {
            attemptLimitInput.value = config.maxAttempts;
        }
    }

    // --- Unpack Summary Only ---
    if (summaryOnlyToggle) {
        summaryOnlyToggle.checked = !!(config.showAnswersInSummaryOnly ?? config.manualReveal);
    }

    // --- Unpacking Form Field Variables and Syncing Sub-Containers ---
    if (elements.timerModeSelect) {
        elements.timerModeSelect.value = config.timerMode || 'quiz';
        const isQuestionMode = config.timerMode === 'question';
        document.getElementById('quiz-time-presets-container')?.classList.toggle('hidden', isQuestionMode);
        document.getElementById('question-time-container')?.classList.toggle('hidden', !isQuestionMode);
    }
    if (elements.questionTimeInput) elements.questionTimeInput.value = config.questionTime || 30;
    
    if (elements.secondChanceToggle) {
        elements.secondChanceToggle.checked = config.enableSecondChance || false;
        document.getElementById('second-chance-options')?.classList.toggle('hidden', !config.enableSecondChance);
    }
    if (elements.maxChancesInput) elements.maxChancesInput.value = config.maxChances || 1;
    
    if (elements.shuffleQuestionsToggle) elements.shuffleQuestionsToggle.checked = config.randomizeQuestions !== false;
    if (elements.shuffleChoicesToggle) elements.shuffleChoicesToggle.checked = config.randomizeChoices !== false;

    const isSummaryOnly = summaryOnlyToggle ? summaryOnlyToggle.checked : false;
    const allowChangeToggleEl = elements.allowChangeToggle || document.getElementById('allow-change-toggle');
    const allowChangeContainer = elements.allowChangeContainer || document.getElementById('allow-change-container');
    if (allowChangeToggleEl) {
        if (isSummaryOnly) {
            allowChangeToggleEl.checked = false;
            allowChangeToggleEl.disabled = true;
            allowChangeContainer?.classList.add('opacity-50', 'pointer-events-none');
        } else {
            allowChangeToggleEl.disabled = false;
            allowChangeToggleEl.checked = config.allowChangeSelection || false;
            allowChangeContainer?.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    state.initialCustomizeState = getCustomizeState();
    validateAllInputs();
}

export function handleTimePresetChange() {
    const sel = document.querySelector('input[name="time_preset"]:checked')?.value || '10';
    customTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
    validateAllInputs();
}



export function autoBalanceMixedCounts(totalCount) {
    if (!totalCount || totalCount <= 0) return;
    const mcInput = document.getElementById('mc-count');
    const tfInput = document.getElementById('tf-count');
    const idInput = document.getElementById('id-count');
    const enInput = document.getElementById('en-count');
    
    if (mcInput && tfInput && idInput && enInput) {
        const mc = Math.round(totalCount * 0.4);
        const tf = Math.round(totalCount * 0.2);
        const id = Math.round(totalCount * 0.2);
        const en = Math.max(0, totalCount - mc - tf - id);
        mcInput.value = mc;
        tfInput.value = tf;
        idInput.value = id;
        enInput.value = en;
    }
}

export function handleCustomTypeChange() {
    const selected = customQuestionTypeSelect?.value || 'mixed';
    const showMixed = selected === 'mixed';
    if (customOptionsDiv) customOptionsDiv.classList.toggle('hidden', !showMixed);
    if (customMixedCountsDiv) customMixedCountsDiv.classList.toggle('hidden', !showMixed);
    if (showMixed) {
        const mcVal = document.getElementById('mc-count')?.value;
        const tfVal = document.getElementById('tf-count')?.value;
        const idVal = document.getElementById('id-count')?.value;
        const enVal = document.getElementById('en-count')?.value;
        if (!mcVal && !tfVal && !idVal && !enVal) {
            const totalCount = parseInt(questionCountInput.value, 10) || 10;
            autoBalanceMixedCounts(totalCount);
        }
    }
    validateAllInputs();
}

export function validateAllInputs() {
    const hasSource = typeof state.fileContent === 'string' && state.fileContent.trim().length > 0;
    const hasCustomize = !!state.customizingQuizData || state.isCustomizingHistory;
    const totalCount = parseInt(questionCountInput.value, 10) || 0;

    // Check configuration parameters
    let enabled = state.isCustomizingHistory 
        ? hasCustomize 
        : (hasSource && totalCount >= constants.MIN_QUIZ_QUESTIONS && totalCount <= constants.MAX_QUIZ_QUESTIONS);

    const customFeedback = document.getElementById('custom-total-feedback');

    if (!state.isCustomizingHistory) {
        const type = customQuestionTypeSelect?.value || 'mixed';
        if (type === 'mixed') {
            const mc = parseInt(document.getElementById('mc-count')?.value, 10) || 0;
            const tf = parseInt(document.getElementById('tf-count')?.value, 10) || 0;
            const id = parseInt(document.getElementById('id-count')?.value, 10) || 0;
            const en = parseInt(document.getElementById('en-count')?.value, 10) || 0;
            const sum = mc + tf + id + en;
            if (sum !== totalCount || totalCount <= 0) {
                if (customFeedback) {
                    customFeedback.textContent = `Total: ${sum} / ${totalCount} (MC: ${mc}, T/F: ${tf}, ID: ${id}, EN: ${en})`;
                    customFeedback.className = 'text-xs text-center mt-3 h-4 text-red-400 font-medium';
                }
                enabled = false;
            } else {
                if (customFeedback) {
                    customFeedback.textContent = `Counts match: ${mc} MC + ${tf} T/F + ${id} ID + ${en} EN = ${totalCount}`;
                    customFeedback.className = 'text-xs text-center mt-3 h-4 text-green-400 font-medium';
                }
            }
        } else if (customFeedback) {
            customFeedback.textContent = '';
        }
    } else if (customFeedback) {
        customFeedback.textContent = '';
    }

    if (timeLimitToggle.checked) {
        const selectedPreset = document.querySelector('input[name="time_preset"]:checked')?.value;
        if (selectedPreset === 'custom') {
            const customTime = parseInt(customTimeLimitInput.value, 10) || 0;
            enabled = enabled && customTime > 0;
        }
    }

    if (attemptLimitToggle.checked) {
        const maxAttempts = parseInt(attemptLimitInput.value, 10) || 0;
        enabled = enabled && maxAttempts > 0;
    }

    // 1. Choice-Swapping settings panel (Automatically disabled when "Don't auto-validate" is checked)
    const isSummaryOnly = summaryOnlyToggle ? summaryOnlyToggle.checked : false;
    const allowChangeToggleEl = elements.allowChangeToggle || document.getElementById('allow-change-toggle');
    const allowChangeContainer = elements.allowChangeContainer || document.getElementById('allow-change-container');

    if (isSummaryOnly) {
        if (allowChangeToggleEl) {
            allowChangeToggleEl.checked = false;
            allowChangeToggleEl.disabled = true;
        }
        if (allowChangeContainer) {
            allowChangeContainer.classList.add('opacity-50', 'pointer-events-none');
        }
    } else {
        if (allowChangeToggleEl) {
            allowChangeToggleEl.disabled = false;
        }
        if (allowChangeContainer) {
            allowChangeContainer.classList.remove('opacity-50', 'pointer-events-none');
        }
    }

    // 2. Evaluate Verification Bounds on Timed Quiz Variations
    if (timeLimitToggle.checked && elements.timerModeSelect) {
        if (elements.timerModeSelect.value === 'question') {
            const qTime = elements.questionTimeInput ? parseInt(elements.questionTimeInput.value, 10) || 0 : 0;
            enabled = enabled && qTime >= 5;
        } else {
            const selectedPreset = document.querySelector('input[name="time_preset"]:checked')?.value;
            if (selectedPreset === 'custom') {
                const cTime = parseInt(customTimeLimitInput.value, 10) || 0;
                enabled = enabled && cTime > 0;
            }
        }
    }

    generateQuizBtn.disabled = !enabled;
    if (elements.saveCustomizeBtn) {
        if (state.isCustomizingHistory) {
            const hasChanges = hasUnsavedChanges();
            elements.saveCustomizeBtn.classList.toggle('hidden', !hasChanges);
            elements.saveCustomizeBtn.disabled = !enabled;
        } else {
            elements.saveCustomizeBtn.classList.add('hidden');
        }
    }
}

// ==========================================
// AI PROMPT GENERATOR BACKUP SYSTEM
// ==========================================

export function buildQuizSystemPrompt(config, fileName, fileContent = '') {
    const totalCount = config.count || 10;
    const diff = config.difficulty || 'easy';
    const mcCount = config.mc !== undefined ? config.mc : (config.mcCount !== undefined ? config.mcCount : Math.round(totalCount * 0.4));
    const tfCount = config.tf !== undefined ? config.tf : (config.tfCount !== undefined ? config.tfCount : Math.round(totalCount * 0.2));
    const idCount = config.id !== undefined ? config.id : Math.round(totalCount * 0.2);
    const enCount = config.en !== undefined ? config.en : Math.max(0, totalCount - mcCount - tfCount - idCount);
    const finalFileName = fileName || 'Quiz';
    const totalTimeInMinutes = config.isTimed ? Math.max(1, Math.round((config.totalTime || 600) / 60)) : 10;

    let diffGuidance = '';
    if (diff === 'easy') {
        diffGuidance = 'Difficulty Level: Easy. Questions must focus on fundamental definitions, core concepts, and direct recall using clear, accessible language.';
    } else if (diff === 'hard') {
        diffGuidance = 'Difficulty Level: Hard. Questions must challenge deep analytical understanding, nuanced concepts, tricky edge cases, and complex reasoning.';
    } else {
        diffGuidance = 'Difficulty Level: Medium. Questions must test conceptual comprehension, application of principles, and standard problem-solving.';
    }

    const qType = config.customType || 'mixed';
    let distributionText = '';
    if (qType === 'multiple-choice') {
        distributionText = `${totalCount} Multiple Choice questions.`;
    } else if (qType === 'true-or-false') {
        distributionText = `${totalCount} True or False questions.`;
    } else if (qType === 'identification') {
        distributionText = `${totalCount} Identification questions.`;
    } else if (qType === 'enumeration') {
        distributionText = `${totalCount} Enumeration questions.`;
    } else {
        distributionText = `${mcCount} Multiple Choice, ${tfCount} True or False, ${idCount} Identification, and ${enCount} Enumeration questions.`;
    }

    let effectiveContent = fileContent && fileContent.trim().length > 0 ? fileContent.trim() : '';
    let remedialFocusText = '';
    if (config.isRemedial) {
        if (state.incorrectQuestionsForRemedial && state.incorrectQuestionsForRemedial.length > 0) {
            const missedItemsText = state.incorrectQuestionsForRemedial.map((q, idx) => {
                const ans = Array.isArray(q.answer) ? q.answer.join(', ') : q.answer;
                return `[Missed Item ${idx + 1}]\nQuestion: ${q.question}\nCorrect Answer: ${ans}\nExplanation: ${q.explanation || 'N/A'}`;
            }).join('\n\n');
            if (effectiveContent) {
                effectiveContent = `${effectiveContent}\n\n========================================\nQuestions Previously Answered Incorrectly by Student (Remedial Focus):\n${missedItemsText}`;
            } else {
                effectiveContent = `Questions Previously Answered Incorrectly by Student (Remedial Focus):\n${missedItemsText}`;
            }
        }
        remedialFocusText = '\nRemedial Focus: This is a remedial quiz designed for targeted practice based on questions the student previously answered incorrectly. Prioritize testing and reinforcing the core concepts, knowledge, and problem patterns behind these missed items.\n';
    }

    const sourceSection = effectiveContent.length > 0 
        ? `\n\n----------------------------------------\nSource Text / Reviewer:\n${effectiveContent}`
        : `\n\n----------------------------------------\nSource Text / Reviewer:\n[PASTE YOUR SOURCE TEXT / REVIEWER MATERIAL HERE]`;

    return `System Prompt: JSON Quiz Generator

Role & Task:
Act as an expert instructional designer and JSON architect. Your task is to generate a quiz based strictly on the provided text reviewer.

CRITICAL FILE OUTPUT REQUIREMENT:
You MUST provide the generated quiz as a downloadable .json file (named "${finalFileName}.json") or enclosed entirely within a single, clean \`\`\`json code block that can be directly saved and downloaded as a ".json" file.
Do NOT output any conversational text, pleasantries, preambles, summaries, explanations, or Markdown text outside of the JSON block. The user will be downloading and importing this JSON file directly into an automated quiz web application, so the response must strictly be 100% valid, parseable JSON.

Content Requirements:

Total Items: ${totalCount} questions.

${diffGuidance}
${remedialFocusText}
Distribution: ${distributionText}

Coverage: Distribute the questions evenly across all topics provided in the source text.

JSON Schema & Formatting Rules:
The JSON root must contain three main keys: fileName, config, and questions.

fileName: Set the value to exactly "${finalFileName}".

config: Include the following exact key-value pairs, replacing the bracketed placeholders with your desired numbers.

"count": ${totalCount}

"difficulty": "${diff}"

"mc": ${mcCount}

"tf": ${tfCount}

"id": ${idCount}

"en": ${enCount}

"customType": "${qType}"

"customTypeShort": "${config.customTypeShort || (qType === 'mixed' ? 'MIX' : qType.toUpperCase())}"

"uiMode": "${config.uiMode || 'modern'}"

"isTimed": ${config.isTimed ? 'true' : 'false'}

"totalTime": ${totalTimeInMinutes}

"isAttemptLimited": ${config.isAttemptLimited ? 'true' : 'false'}

"maxAttempts": ${config.maxAttempts || 0}

"showAnswersInSummaryOnly": ${config.showAnswersInSummaryOnly ? 'true' : 'false'}

"isRemedial": ${config.isRemedial ? 'true' : 'false'}

questions (Multiple Choice - Standard): Format each object as follows:

"type": "multiple-choice"

"question": The question text.

"options": An array of exactly 4 strings (1 correct answer, 3 plausible distractors).

"answer": The exact string of the correct option.

"explanation": A specific, factual explanation drawn directly from the text detailing why the answer is correct.

questions (True or False): Format each object as follows:

"type": "true-or-false"

"question": The true or false statement.

"options": An array containing exactly two strings: ["True", "False"].

"answer": Either "True" or "False".

"explanation": A specific, factual explanation drawn directly from the text detailing why the statement is true or false.

questions (Identification): Format each object as follows:

"type": "identification"

"question": The statement or question text.

"options": An empty array [].

"answer": The exact string of the correct identification term.

"explanation": A specific, factual explanation drawn directly from the text.

questions (Enumeration): Format each object as follows:

"type": "enumeration"

"question": The prompt asking for a specific list of items.

"options": An empty array [].

"answer": An array of strings containing the correct list items.

"explanation": A specific, factual explanation drawn directly from the text outlining why these items are grouped.${sourceSection}`;
}

export function openAiChoiceModal(config, fileName) {
    if (elements.aiChoiceSummaryBadges) {
        const mcCount = config.mc !== undefined ? config.mc : (config.mcCount !== undefined ? config.mcCount : 0);
        const tfCount = config.tf !== undefined ? config.tf : (config.tfCount !== undefined ? config.tfCount : 0);
        const idCount = config.id || 0;
        const enCount = config.en || 0;
        const timeBadge = config.isTimed ? formatTime(config.totalTime) : 'Untimed';
        const attemptsBadge = config.isAttemptLimited ? `${config.maxAttempts} Attempts` : 'Unlimited Attempts';
        const typeBadge = config.difficulty === 'custom' 
            ? `Custom (${config.customTypeShort || 'MIX'})`
            : `${(config.difficulty || 'Easy').charAt(0).toUpperCase() + (config.difficulty || 'Easy').slice(1)}`;
        
        elements.aiChoiceSummaryBadges.innerHTML = `
            <span class="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg font-semibold">${config.count || 10} Questions</span>
            <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg font-medium">${typeBadge}</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${mcCount} MC • ${tfCount} T/F • ${idCount} ID • ${enCount} EN</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${timeBadge}</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${attemptsBadge}</span>
            <span class="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg truncate max-w-[200px]" title="${fileName || 'Quiz'}">${fileName || 'Quiz'}</span>
        `;
    }

    const cooldownWarning = getGenerationCooldownWarning();
    const nodalBtn = elements.aiChoiceNodalBtn;
    if (nodalBtn) {
        let badge = document.getElementById('ai-choice-cooldown-badge');
        if (cooldownWarning) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'ai-choice-cooldown-badge';
                badge.className = 'mt-1 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-300 text-[11px] font-medium flex items-center gap-1.5';
                nodalBtn.appendChild(badge);
            }
            badge.innerHTML = `<svg class="w-3.5 h-3.5 flex-shrink-0 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${cooldownWarning}</span>`;
            badge.classList.remove('hidden');
        } else if (badge) {
            badge.classList.add('hidden');
        }
    }

    if (elements.aiChoiceModal) {
        elements.aiChoiceModal.classList.remove('hidden');
        pushSubState('#ai-choice');
    }
}

export function closeAiChoiceModal(fromPopState = false, skipHistoryBack = false) {
    clearSubState('#ai-choice');
    closeModalWithAnimation(elements.aiChoiceModal, () => {
        if (!fromPopState && !skipHistoryBack && window.location.hash === '#ai-choice') {
            window.history.back();
        }
    });
}

export function openAiPromptModal(config, fileName, showNotice = false) {
    state.aiPromptShowNotice = !!showNotice;
    const noticeEl = elements.aiServiceNotice || document.getElementById('ai-service-notice');
    if (noticeEl) {
        noticeEl.classList.toggle('hidden', !showNotice);
    }

    const promptText = buildQuizSystemPrompt(config, fileName, state.fileContent);
    
    if (elements.aiPromptTextarea) {
        elements.aiPromptTextarea.value = promptText;
    }
    
    if (elements.aiPromptSummaryBadges) {
        const mcCount = config.mc !== undefined ? config.mc : (config.mcCount !== undefined ? config.mcCount : 0);
        const tfCount = config.tf !== undefined ? config.tf : (config.tfCount !== undefined ? config.tfCount : 0);
        const idCount = config.id || 0;
        const enCount = config.en || 0;
        const timeBadge = config.isTimed ? formatTime(config.totalTime) : 'Untimed';
        const attemptsBadge = config.isAttemptLimited ? `${config.maxAttempts} Attempts` : 'Unlimited Attempts';
        const typeBadge = config.difficulty === 'custom' 
            ? `Custom (${config.customTypeShort || 'MIX'})`
            : `${(config.difficulty || 'Easy').charAt(0).toUpperCase() + (config.difficulty || 'Easy').slice(1)}`;
        
        elements.aiPromptSummaryBadges.innerHTML = `
            <span class="px-2.5 py-1 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg font-semibold">${config.count || 10} Questions</span>
            <span class="px-2.5 py-1 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg font-medium">${typeBadge}</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${mcCount} MC • ${tfCount} T/F • ${idCount} ID • ${enCount} EN</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${timeBadge}</span>
            <span class="px-2.5 py-1 bg-gray-700 text-gray-300 border border-gray-600 rounded-lg">${attemptsBadge}</span>
            <span class="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg truncate max-w-[200px]" title="${fileName || 'Quiz'}">${fileName || 'Quiz'}</span>
        `;
    }

    if (elements.copyAiPromptBtnText) {
        elements.copyAiPromptBtnText.textContent = 'Copy Prompt';
    }

    if (elements.aiPromptModal) {
        elements.aiPromptModal.classList.remove('hidden');
        if (window.location.hash === '#ai-choice') {
            clearSubState('#ai-choice');
            replaceSubState('#ai-prompt');
        } else {
            pushSubState('#ai-prompt');
        }
    }
}

export function closeAiPromptModal(fromPopState = false) {
    clearSubState('#ai-prompt');
    closeModalWithAnimation(elements.aiPromptModal, () => {
        if (!fromPopState && window.location.hash === '#ai-prompt') {
            window.history.back();
        }
    });
}

export function openImportChoiceModal(fromPopState = false) {
    const modal = elements.importChoiceModal || document.getElementById('import-choice-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    if (!fromPopState) {
        pushSubState('#import-choice');
    }
}

export function closeImportChoiceModal(fromPopState = false) {
    const modal = elements.importChoiceModal || document.getElementById('import-choice-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    clearSubState('#import-choice');
    closeModalWithAnimation(modal, () => {
        if (!fromPopState && window.location.hash === '#import-choice') {
            window.history.back();
        }
    });
}

export function openPasteJsonModal(fromPopState = false) {
    const modal = elements.pasteJsonModal || document.getElementById('paste-json-modal');
    const textarea = elements.pasteJsonTextarea || document.getElementById('paste-json-textarea');
    if (!modal) return;
    if (textarea) textarea.value = '';
    modal.classList.remove('hidden');
    if (!fromPopState) {
        if (window.location.hash === '#ai-prompt') {
            clearSubState('#ai-prompt');
            replaceSubState('#paste-json');
        } else {
            pushSubState('#paste-json');
        }
    }
    setTimeout(() => {
        textarea?.focus();
    }, 100);
}

export function closePasteJsonModal(fromPopState = false) {
    const modal = elements.pasteJsonModal || document.getElementById('paste-json-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    clearSubState('#paste-json');
    closeModalWithAnimation(modal, () => {
        if (!fromPopState && window.location.hash === '#paste-json') {
            window.history.back();
        }
    });
}

export function initializeAudio() {
    try {
        if (typeof Tone !== 'undefined') {
            state.correctSound = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 } }).toDestination();
            state.incorrectSound = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.3, release: 1 } }).toDestination();
        } else {
            console.warn('Tone.js not loaded.');
        }
    } catch (e) {
        console.warn('Audio init failed.', e);
    }
}

export function attachAuthHandlers() {
    // 1. Home Screen Auth Button (Shows as Popup)
    if (authBtn) {
        authBtn.onclick = async () => {
            // Defensive Guard: Catch offline button clicks if script failed to mount
            if (typeof puter === 'undefined') {
                showToast('Authentication unavailable offline.', 4000, 'warning');
                return;
            }
            if (!await confirmLeaveCustomizeIfActive()) return;
            if (!puter.auth.isSignedIn()) {
                try {
                    // 1. Wait for the user to finish logging in
                    await puter.auth.signIn();
                    
                    // 2. Wait for the UI to update with their username and credits
                    await updateAuthUI(); 
                    
                    // 3. Immediately pull their saved quizzes from the cloud!
                    syncHistoryWithCloud(); 
                    
                } catch (e) {
                    console.error("Sign in failed", e);
                }
            } else {
                // If they are already signed in, just open the popup dashboard
                openAccountAsModal();
            }
        };
    }

    // 2. Nav Bar Account Buttons (Shows as Full Page)
    const desktopNavAccount = document.getElementById('desktop-nav-account-btn');
    const mobileNavAccount = document.getElementById('mobile-menu-account-btn');
    
    if (desktopNavAccount) {
        desktopNavAccount.onclick = async () => {
            if (!await confirmLeaveCustomizeIfActive()) return;
            await openAccountAsView();
        };
    }
    if (mobileNavAccount) {
        mobileNavAccount.onclick = async () => {
            if (!await confirmLeaveCustomizeIfActive()) {
                return;
            }
            closeModalWithAnimation(elements.mobileMenuModal, async () => {
                await openAccountAsView();
            });
        };
    }

    // 3. Existing action buttons inside the card
    if (saveDisplayNameBtn) saveDisplayNameBtn.onclick = saveDisplayName;
    
    if (buyCreditsBtn) {
        buyCreditsBtn.onclick = () => {
            window.open('https://puter.com/billing', '_blank');
            showToast('Opening the credits purchase page...', 2500);
        };
    }
    
    if (logoutBtn) logoutBtn.onclick = handleLogout;

    // 4. Smart Close Button for the Card
    if (closeAccountBtn) {
        closeAccountBtn.onclick = closeAccountHandler;
    }

    // 5. NEW: Login Button inside the Logged-Out Account View
    const accountLoginBtn = document.getElementById('account-login-btn');
    if (accountLoginBtn) {
        accountLoginBtn.onclick = async () => {
            try {
                await puter.auth.signIn();
                await updateAuthUI(); 
                syncHistoryWithCloud();
                await populateAccountData(); // Refresh the account view immediately
            } catch (e) {
                console.error("Sign in failed", e);
            }
        };
    }

    // 6. Reduce Motion Toggles (Website-wide accessibility setting)
    const reduceMotionToggle = document.getElementById('reduce-motion-toggle');
    if (reduceMotionToggle) {
        reduceMotionToggle.onchange = (e) => {
            setReduceMotion(e.target.checked);
        };
    }
    const reduceMotionToggleLoggedOut = document.getElementById('reduce-motion-toggle-logged-out');
    if (reduceMotionToggleLoggedOut) {
        reduceMotionToggleLoggedOut.onchange = (e) => {
            setReduceMotion(e.target.checked);
        };
    }
}

export function initializeAppState() {
    state.generationLog = getLocalGenerationLog();
    refreshHistory();
    handleDifficultyChange();
    handleTimeToggle();
    handleAttemptToggle();
    setReduceMotion(localStorage.getItem('nodal_reduce_motion') === 'true');
    updateResumeButtonVisibility();
}

/**
 * Authoritative controller for Resume Previous Quiz button visibility.
 * Strictly hides resumeQuizBtn whenever customizing documents or editing history,
 * and reveals it only on start view when an active in-progress quiz exists.
 */
export function updateResumeButtonVisibility() {
    if (!elements.resumeQuizBtn) return;

    const customizeSection = document.getElementById('customize-section');
    const customizeContent = document.getElementById('customize-content');
    const isCustomizeOpen = (customizeSection && !customizeSection.classList.contains('hidden')) ||
                            (customizeContent && !customizeContent.classList.contains('hidden')) ||
                            (state.currentFiles && state.currentFiles.length > 0) ||
                            (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0) ||
                            state.activeSubState === '#customize';

    const isEditOpen = state.isCustomizingHistory || state.activeSubState === '#edit';

    if (isCustomizeOpen || isEditOpen) {
        elements.resumeQuizBtn.classList.add('hidden');
        return;
    }

    // Only show on home/start view if valid progress exists
    const saved = state.savedProgress || (function() {
        try {
            const raw = localStorage.getItem(constants.IN_PROGRESS_QUIZ_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    })();

    if (saved?.questions?.length && (saved.shuffledIndexPos < saved.shuffledIndices?.length || saved.inSkippedRound)) {
        state.savedProgress = saved;
        elements.resumeQuizBtn.classList.remove('hidden');
        elements.resumeQuizBtn.textContent = `Resume: ${saved.fileName || 'Quiz'} (${saved.answeredIndices?.length || 0}/${saved.questions.length})`;
    } else {
        elements.resumeQuizBtn.classList.add('hidden');
    }
}

export function prepareSavedProgress() {
    try {
        const saved = localStorage.getItem(IN_PROGRESS_QUIZ_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data?.questions?.length && (data.shuffledIndexPos < data.shuffledIndices?.length || data.inSkippedRound)) {
                state.savedProgress = data;
            } else {
                clearInProgressQuiz();
            }
        }
    } catch (e) {
        console.error('Could not read progress', e);
        clearInProgressQuiz();
    }
    updateResumeButtonVisibility();
}

export function clearInProgressQuiz() {
    localStorage.removeItem(IN_PROGRESS_QUIZ_KEY);
    state.savedProgress = null;
    updateResumeButtonVisibility();
}

export function saveInProgressQuiz(data) {
    if (!data || data.shuffledIndexPos === undefined) {
        clearInProgressQuiz();
        return;
    }
    data.answeredIndices = Array.from(state.answeredOriginalIndices);
    data.skippedIndices = Array.from(state.skippedOriginalIndices);
    try {
        localStorage.setItem(IN_PROGRESS_QUIZ_KEY, JSON.stringify(data));
        state.savedProgress = data;
    } catch (e) {
        console.error('Save failed', e);
    }
}

// ==========================================
// SHARE GATEWAY MODAL LOGIC
// ==========================================

export function updateShareLinkDisplay(quiz, forceFormat = null) {
    if (!quiz || !quiz.share) return;
    
    const shortUrl = quiz.share.shortUrl;
    const fullUrl = quiz.share.fullShareUrl || quiz.share.shareUrl;
    const input = elements.shareLinkInput || document.getElementById('share-link-input');
    const badge = elements.shareLinkTypeBadge || document.getElementById('share-link-type-badge');
    const textEl = elements.shareLinkTypeText || document.getElementById('share-link-type-text');
    const toggleBtn = elements.toggleShareLinkFormatBtn || document.getElementById('toggle-share-link-format-btn');

    // Determine target format
    let showShort = true;
    if (forceFormat === 'full') {
        showShort = false;
    } else if (forceFormat === 'short') {
        showShort = true;
    } else {
        // Default: prefer shortUrl if available, otherwise fullUrl
        showShort = !!shortUrl;
    }

    if (showShort && shortUrl) {
        if (input) input.value = shortUrl;
        if (badge) {
            badge.className = 'text-[11px] text-emerald-400 flex items-center gap-1 font-medium';
            badge.classList.remove('hidden');
        }
        if (textEl) textEl.textContent = 'Short Link';
        if (toggleBtn) {
            toggleBtn.textContent = 'Show Full Link';
            toggleBtn.classList.remove('hidden');
        }
    } else {
        if (input) input.value = fullUrl || 'Link unavailable. Please generate again.';
        if (badge) {
            badge.className = 'text-[11px] text-blue-400 flex items-center gap-1 font-medium';
            badge.classList.remove('hidden');
        }
        if (textEl) textEl.textContent = 'Full Link';
        if (toggleBtn) {
            if (shortUrl) {
                toggleBtn.textContent = 'Show Short Link';
                toggleBtn.classList.remove('hidden');
            } else {
                toggleBtn.classList.add('hidden');
            }
        }
    }
}

export function toggleShareLinkFormat() {
    const key = state.currentShareQuizKey;
    const quiz = state.quizHistory && state.quizHistory[key];
    if (!quiz || !quiz.share) return;

    const currentVal = (elements.shareLinkInput || document.getElementById('share-link-input'))?.value;
    const shortUrl = quiz.share.shortUrl;

    if (shortUrl && currentVal === shortUrl) {
        updateShareLinkDisplay(quiz, 'full');
    } else {
        updateShareLinkDisplay(quiz, 'short');
    }
}

export function openShareModal(quizKey) {
    state.currentShareQuizKey = quizKey;
    const quiz = state.quizHistory[quizKey];
    
    // Show the modal backdrop
    elements.shareModal.classList.remove('hidden');
    
    // Check if this quiz is already shared
    if (quiz && quiz.share && quiz.share.isShared) {
        // Populate the existing share details with short/full format handling
        updateShareLinkDisplay(quiz);
        
        // Calculate days remaining
        if (quiz.share.expiryTimestamp) {
            const daysLeft = Math.ceil((quiz.share.expiryTimestamp - Date.now()) / (1000 * 60 * 60 * 24));
            elements.shareExpiryDisplay.textContent = daysLeft > 0 ? `Active for ${daysLeft} more days` : 'Expired';
            elements.shareExpiryDisplay.className = daysLeft > 0 ? 'text-xs text-blue-300 mt-1' : 'text-xs text-red-400 mt-1 font-bold';
        }
        
        navigateToShareStep('manage');
    } else {
        // Not shared yet, show the main menu
        navigateToShareStep('menu');
    }
}

export function closeShareModal(fromPopState = false) {
    clearSubState('#share');
    clearSubState('#share-config');
    clearSubState('#share-live');
    clearSubState('#share-manage');

    closeModalWithAnimation(elements.shareModal, () => {
        const shareOverlay = document.getElementById('share-modal-overlay');
        if (shareOverlay) {
            shareOverlay.classList.add('hidden');
        }
        
        if (!fromPopState && window.location.hash.startsWith('#share')) {
            if (state.shareOriginView === 'history-fullscreen') {
                window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
                showView('history-fullscreen', false);
            } else {
                window.history.back();
            }
        } else if (fromPopState && state.shareOriginView === 'history-fullscreen' && (!window.location.hash || window.location.hash === '#home' || window.location.hash === '#history')) {
            window.history.replaceState({ view: 'history-fullscreen' }, '', '#history');
            showView('history-fullscreen', false);
        }
    });
}

export function navigateToShareStep(step, pushHash = true) {
    state.activeShareStep = step;
    
    // Hide all step containers
    elements.shareStepMenu.classList.add('hidden');
    elements.shareStepConfig.classList.add('hidden');
    elements.shareStepManage.classList.add('hidden');
    
    // Show the requested step and manage the Back button visibility
    let targetHash = '#share';
    if (step === 'menu') {
        elements.shareStepMenu.classList.remove('hidden');
        elements.shareBackBtn.classList.add('hidden'); // No back button on main menu
        targetHash = '#share';
    } else if (step === 'config') {
        elements.shareStepConfig.classList.remove('hidden');
        elements.shareBackBtn.classList.remove('hidden');
        targetHash = '#share-config';
    } else if (step === 'manage') {
        elements.shareStepManage.classList.remove('hidden');
        elements.shareBackBtn.classList.remove('hidden');
        targetHash = '#share-live';
    }

    if (pushHash && window.location.hash !== targetHash) {
        pushSubState(targetHash);
    }
}

// ==========================================
// ISOLATED EXPORT LOGIC
// ==========================================

export function exportQuizAsJSON(quizKey) {
    const quiz = state.quizHistory[quizKey];
    if (!quiz) return;
    
    try {
        const takes = getQuizTakes(quizKey) || [];
        const exportData = {
            fileName: quiz.fileName,
            config: quiz.config,
            questions: quiz.questions,
            takes: takes
        };
        
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${quiz.fileName || 'my-quiz'}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        
        showToast('Quiz exported to your device!', 3000, 'success');
    } catch (err) {
        console.error('Export Error:', err);
        showToast('Failed to export quiz.', 3000, 'error');
    }
}

// ==========================================
// STARTUP WELCOME MODAL CONTROLLER
// ==========================================
export function initWelcomeModal() {
    const isDismissed = localStorage.getItem(constants.WELCOME_DISMISSED_KEY);
    
    // Safety check: if user already dismissed it permanently, do nothing
    if (isDismissed === 'true') return;

    const { welcomeModal, welcomeCloseBtn, welcomeCheckbox } = elements;

    if (welcomeModal && welcomeCloseBtn) {
        // Render modal overlay panel layout active
        welcomeModal.classList.remove('hidden');

        welcomeCloseBtn.onclick = () => {
            // If the "don't show again" checkbox is ticked, save preference permanently
            if (welcomeCheckbox && welcomeCheckbox.checked) {
                localStorage.setItem(constants.WELCOME_DISMISSED_KEY, 'true');
            }
            closeModalWithAnimation(welcomeModal);
        };
    }
}

// ==========================================
// MOBILE HISTORY ACTIONS SUBMENU MODAL
// ==========================================
export async function openHistoryActionsModal(quizKey, pushHash = true) {
    if (!elements.historyActionsModal) return;

    const { isQuizAvailableOffline, updateHistorySubmenuOfflineButton } = await import('./quiz/quizOffline.js');
    if (!navigator.onLine && !isQuizAvailableOffline(quizKey).available) {
        showToast('This quiz is not available offline. Please connect to the internet or download it for offline use.', 4000, 'error');
        return;
    }

    state.activeHistoryMenuKey = quizKey;
    state.lastHistoryMenuKey = quizKey;
    state.historyMenuOriginHash = window.location.hash || '#history';
    const db = getQuizDB();
    const item = db[quizKey];
    const title = (item && item.fileName) ? item.fileName : (quizKey ? quizKey.replace(/_/g, ' ') : 'Quiz Options');
    if (elements.historySubmenuQuizTitle) {
        elements.historySubmenuQuizTitle.textContent = title;
    }
    updateHistorySubmenuOfflineButton(quizKey);
    elements.historyActionsModal.classList.remove('hidden');
    if (pushHash) {
        pushSubState('#history-actions', { quizKey, view: 'history-fullscreen' });
    } else {
        state.activeSubState = '#history-actions';
        state.authorizedSubStates = state.authorizedSubStates || new Set();
        state.authorizedSubStates.add('#history-actions');
    }
}

export function closeHistoryActionsModal(isFromPopState = false, popHistory = true) {
    if (!elements.historyActionsModal || elements.historyActionsModal.classList.contains('hidden')) return;
    clearSubState('#history-actions');
    const originHash = state.historyMenuOriginHash || '#history';

    closeModalWithAnimation(elements.historyActionsModal, () => {
        if (!isFromPopState && window.location.hash === '#history-actions') {
            if (popHistory) {
                window.history.back();
            } else {
                window.history.replaceState({ view: hashToView(originHash) }, '', originHash);
            }
        }
    });
}

// ==========================================
// SHARED QUIZ HELPERS & ACTION MODAL
// ==========================================

export function areQuizQuestionsMatching(questionsA, questionsB) {
    if (!Array.isArray(questionsA) || !Array.isArray(questionsB)) return false;
    if (questionsA.length !== questionsB.length || questionsA.length === 0) return false;
    for (let i = 0; i < questionsA.length; i++) {
        const a = questionsA[i];
        const b = questionsB[i];
        if (!a || !b) return false;
        if (a.question?.trim() !== b.question?.trim()) return false;
        if (a.type !== b.type) return false;
    }
    return true;
}

export function extractShareId(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        let targetUrl = url;
        const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
        const u = new URL(url, origin);
        if (u.searchParams.has('share')) {
            targetUrl = u.searchParams.get('share') || '';
        }
        const parsed = new URL(targetUrl, origin);
        const uid = parsed.searchParams.get('uid');
        if (uid) return uid;
        const token = parsed.searchParams.get('token');
        if (token) return token;
        const last = parsed.pathname.split('/').filter(Boolean).pop();
        if (last && last !== 'token-read' && last !== 'read') {
            return last;
        }
        return '';
    } catch {
        const clean = url.split('/').filter(Boolean).pop()?.split('?')[0];
        if (clean && clean !== 'token-read' && clean !== 'read') {
            return clean;
        }
        return '';
    }
}

export function normalizeShareUrl(url) {
    if (!url || typeof url !== 'string') return '';
    try {
        const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : 'http://localhost';
        const u = new URL(url, origin);
        if (u.searchParams.has('share')) {
            return u.searchParams.get('share') || '';
        }
        return u.href;
    } catch {
        return url;
    }
}

export function findExactQuizForSharedLink(shareId, shareUrl) {
    if (!state.quizHistory || typeof state.quizHistory !== 'object') return null;

    const invalidIds = ['token-read', 'read', 'undefined', 'null', ''];
    const targetId = shareId && !invalidIds.includes(shareId) ? shareId : extractShareId(shareUrl);
    const targetNormUrl = normalizeShareUrl(shareUrl);

    const entries = Object.entries(state.quizHistory);

    for (const [key, quiz] of entries) {
        if (!quiz) continue;

        // Auto-heal legacy generic 'token-read' / 'read' from prior bug
        if (quiz.sourceShareId && invalidIds.includes(quiz.sourceShareId)) {
            const repaired = extractShareId(quiz.sourceShareUrl);
            if (repaired) {
                quiz.sourceShareId = repaired;
            } else {
                delete quiz.sourceShareId;
            }
            saveQuizToDB(key, quiz);
        }

        // 1. Direct ID matches (guarded against invalid/generic strings like 'token-read')
        if (targetId) {
            if (quiz.sourceShareId && !invalidIds.includes(quiz.sourceShareId) && quiz.sourceShareId === targetId) {
                return { key, quiz };
            }
            if (quiz.share) {
                if (quiz.share.shareId && !invalidIds.includes(quiz.share.shareId) && quiz.share.shareId === targetId) {
                    return { key, quiz };
                }
                if (quiz.share.uid && quiz.share.uid === targetId) {
                    return { key, quiz };
                }
            }
        }

        // 2. Normalized URL comparison
        if (targetNormUrl) {
            if (quiz.sourceShareUrl && normalizeShareUrl(quiz.sourceShareUrl) === targetNormUrl) {
                return { key, quiz };
            }
            if (quiz.share) {
                if (quiz.share.shareUrl && normalizeShareUrl(quiz.share.shareUrl) === targetNormUrl) {
                    return { key, quiz };
                }
                if (quiz.share.publicUrl && normalizeShareUrl(quiz.share.publicUrl) === targetNormUrl) {
                    return { key, quiz };
                }
            }
        }

        // 3. Compare extracted unique IDs from saved URLs
        if (targetId) {
            if (quiz.sourceShareUrl && extractShareId(quiz.sourceShareUrl) === targetId) {
                return { key, quiz };
            }
            if (quiz.share && quiz.share.shareUrl && extractShareId(quiz.share.shareUrl) === targetId) {
                return { key, quiz };
            }
        }
    }

    return null;
}

export function findExistingQuizForSharedLink(shareId, shareUrl, questions = null) {
    // 1. Check for exact match first
    const exactMatch = findExactQuizForSharedLink(shareId, shareUrl);
    if (exactMatch) return exactMatch;

    // 2. Fallback content match (questions equality)
    if (!state.quizHistory || typeof state.quizHistory !== 'object') return null;
    const entries = Object.entries(state.quizHistory);

    if (Array.isArray(questions) && questions.length > 0) {
        for (const [key, quiz] of entries) {
            if (!quiz) continue;
            if (areQuizQuestionsMatching(quiz.questions, questions)) {
                // Link valid sourceShareId if missing or previously generic
                const invalidIds = ['token-read', 'read', 'undefined', 'null', ''];
                const validId = shareId && !invalidIds.includes(shareId) ? shareId : extractShareId(shareUrl);
                if (validId && (!quiz.sourceShareId || invalidIds.includes(quiz.sourceShareId))) {
                    quiz.sourceShareId = validId;
                    if (shareUrl) quiz.sourceShareUrl = shareUrl;
                    saveQuizToDB(key, quiz);
                }
                return { key, quiz };
            }
        }
    }

    return null;
}

export function openSharedQuizModal() {
    if (!elements.sharedQuizModal || !state.pendingSharedQuiz) return;
    const { questions, config, fileName, isAlreadySaved, existingQuiz } = state.pendingSharedQuiz;

    // Determine which quiz data should be displayed.
    // If the quiz is already saved, prefer the saved quiz's metadata.
    const sourceQuiz = isAlreadySaved && existingQuiz ? existingQuiz : null;

    // Title
    const title = sourceQuiz?.fileName
        || (sourceQuiz?.config && sourceQuiz.config.quizTitle)
        || fileName
        || (config && config.quizTitle)
        || 'Shared Quiz';

    // Config for mode display – prefer the saved config when available.
    const displayConfig = sourceQuiz?.config || config || {};

    // Question count – use the saved quiz's questions when we have them.
    const count = sourceQuiz?.questions?.length ?? (Array.isArray(questions) ? questions.length : 0);

    // Difficulty / mode label.
    const mode = (displayConfig && displayConfig.difficulty)
        ? (displayConfig.difficulty === 'custom' && displayConfig.customTypeShort
            ? displayConfig.customTypeShort.toUpperCase()
            : displayConfig.difficulty.toUpperCase())
        : 'Mixed Mode';
    
    if (elements.sharedQuizTitle) {
        elements.sharedQuizTitle.textContent = title;
    }
    if (elements.sharedQuizMeta) {
        elements.sharedQuizMeta.textContent = `${count} Questions • ${mode}`;
    }

    // Dynamic UI states based on whether the quiz is already saved in the user's account
    if (elements.sharedQuizBadge) {
        if (isAlreadySaved) {
            elements.sharedQuizBadge.classList.remove('hidden');
        } else {
            elements.sharedQuizBadge.classList.add('hidden');
        }
    }
    if (elements.sharedQuizSubheading) {
        if (isAlreadySaved) {
            elements.sharedQuizSubheading.textContent = 'This quiz is already saved in your library.';
            elements.sharedQuizSubheading.className = 'text-xs text-emerald-400 mt-1 font-medium';
        } else {
            elements.sharedQuizSubheading.textContent = 'A practice quiz has been shared with you.';
            elements.sharedQuizSubheading.className = 'text-xs text-gray-400 mt-1';
        }
    }
    if (elements.sharedQuizSaveText) {
        if (isAlreadySaved) {
            elements.sharedQuizSaveText.textContent = 'Already in Library';
        } else {
            elements.sharedQuizSaveText.textContent = 'Save for Later';
        }
    }

    elements.sharedQuizModal.classList.remove('hidden');
    pushSubState('#shared-quiz');
}

export function closeSharedQuizModal(isFromPopState = false, popHistory = true) {
    if (!elements.sharedQuizModal || elements.sharedQuizModal.classList.contains('hidden')) return;
    clearSubState('#shared-quiz');
    state.pendingSharedQuiz = null;

    closeModalWithAnimation(elements.sharedQuizModal, () => {
        if (!isFromPopState && window.location.hash === '#shared-quiz') {
            if (popHistory) {
                window.history.back();
            } else {
                window.history.replaceState({ view: 'start' }, '', '#home');
            }
        }
    });
}

// Keep history section responsive layout classes synced on viewport change
if (typeof window !== 'undefined' && window.matchMedia) {
    window.matchMedia('(min-width: 768px)').addEventListener('change', () => {
        const section = elements.historySection || document.getElementById('history-section');
        if (section) {
            if (!section.classList.contains('hidden')) section.classList.add('hidden');
            if (!section.classList.contains('md:block')) section.classList.add('md:block');
        }
    });
}