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

        const cleanup = () => {
            confirmModal.classList.add('hidden');
            acceptConfirmBtn.removeEventListener('click', onAccept);
            cancelConfirmBtn.removeEventListener('click', onCancel);
        };

        const onAccept = () => { cleanup(); resolve(true); };
        const onCancel = () => { cleanup(); resolve(false); };

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
}

export function handleAttemptToggle() {
    // Show/hide the attempt limit container based on checkbox state
    attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
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
    // Determine if the user is completely offline/logged out OR system reports offline status
    const isOffline = !navigator.onLine || !window.puter || !puter.auth.isSignedIn();
    const finalStatus = isOffline ? 'offline' : status;

    // 1. Target Global Sync Buttons (Using Class to hit both Home and Full views)
    const globalSyncBtns = document.querySelectorAll('.global-sync-btn');
    globalSyncBtns.forEach(btn => {
        const done = btn.querySelector('.sync-icon-done');
        const load = btn.querySelector('.sync-icon-loading');
        const offline = btn.querySelector('.sync-icon-offline');

        if (done) done.classList.toggle('hidden', finalStatus !== 'synced');
        if (load) load.classList.toggle('hidden', finalStatus !== 'syncing');
        if (offline) offline.classList.toggle('hidden', finalStatus !== 'offline');
    });

    // 2. Target Quiz View Sync Indicator
    const quizDone = document.querySelector('#quiz-sync-indicator .sync-icon-done');
    const quizLoad = document.querySelector('#quiz-sync-indicator .sync-icon-loading');
    const quizOffline = document.querySelector('#quiz-sync-indicator .sync-icon-offline');

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

    try {
        let combinedCloudItems = {};

        // Ensure state.deletedQuizKeys is populated
        state.deletedQuizKeys = state.deletedQuizKeys || JSON.parse(localStorage.getItem('nodal_deleted_quiz_keys') || '{}');

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
                        if (!combinedCloudItems[k] || (v.timestamp || 0) > (combinedCloudItems[k].timestamp || 0)) {
                            combinedCloudItems[k] = v;
                        }
                    }
                }
                if (parsedPrimary && parsedPrimary.deletedKeys && typeof parsedPrimary.deletedKeys === 'object') {
                    Object.assign(state.deletedQuizKeys, parsedPrimary.deletedKeys);
                }
            } catch (ePrimary) {
                // Primary file not created yet or read issue
            }

            try {
                const fsItemBackup = await puter.fs.read(PUTER_FS_BACKUP_FILE);
                const parsedBackup = await parsePuterFSFile(fsItemBackup);
                if (parsedBackup && parsedBackup.items) {
                    for (const [k, v] of Object.entries(parsedBackup.items)) {
                        if (!combinedCloudItems[k] || (v.timestamp || 0) > (combinedCloudItems[k].timestamp || 0)) {
                            combinedCloudItems[k] = v;
                        }
                    }
                }
                if (parsedBackup && parsedBackup.deletedKeys && typeof parsedBackup.deletedKeys === 'object') {
                    Object.assign(state.deletedQuizKeys, parsedBackup.deletedKeys);
                }
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
            if (combinedCloudItems[delKey] && (combinedCloudItems[delKey].timestamp || 0) <= delTime) {
                delete combinedCloudItems[delKey];
            }
            if (localItems[delKey] && (localItems[delKey].timestamp || 0) <= delTime) {
                delete localItems[delKey];
            }
        }

        // 5. Merge all keys across all cloud items and local items
        const allKeys = new Set([...Object.keys(combinedCloudItems), ...Object.keys(localItems)]);

        for (const key of allKeys) {
            if (state.deletedQuizKeys[key] && Math.max(combinedCloudItems[key]?.timestamp || 0, localItems[key]?.timestamp || 0) <= state.deletedQuizKeys[key]) {
                continue;
            }
            const cloudQuiz = combinedCloudItems[key];
            const localQuiz = localItems[key];
            
            if (cloudQuiz && localQuiz) {
                if ((cloudQuiz.timestamp || 0) >= (localQuiz.timestamp || 0)) {
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

        const now = Date.now();

        // 6. Push structural modifications back to core state pointers & localStorage
        state.quizHistory = mergedItems; 
        localStorage.setItem(DB_NAME, JSON.stringify(mergedItems));
        localStorage.setItem(DB_NAME + '_ts', now.toString());

        const payloadString = JSON.stringify({ 
            items: mergedItems, 
            deletedKeys: state.deletedQuizKeys,
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
    }
}

export async function deleteQuizPermanently(key) {
    if (!key) return;
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

export function getGenerationCooldownInfo(log = state.generationLog || []) {
    const pruned = pruneGenerationLog(log);
    const used = pruned.length;
    const remaining = Math.max(0, MAX_GENERATIONS_PER_WINDOW - used);
    const nextAvailableAt = remaining > 0 ? 0 : (pruned[0] || Date.now()) + GENERATION_WINDOW_MS;
    const now = Date.now();
    return {
        used,
        remaining,
        nextAvailableInMs: Math.max(0, nextAvailableAt - now),
        isAllowed: remaining > 0
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
    if (puter.auth.isSignedIn()) {
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
    modalCooldownPanel.classList.remove('hidden');
    if (info.isAllowed) {
        modalCooldownStatus.textContent = `${info.remaining} / ${MAX_GENERATIONS_PER_WINDOW} available`;
        modalCooldownStatus.className = 'text-sm font-bold text-green-400';
        modalCooldownDetail.textContent = `You can generate ${info.remaining} more quiz${info.remaining === 1 ? '' : 'zes'} in the next 3 hours.`;
    } else {
        modalCooldownStatus.textContent = 'Cooldown active';
        modalCooldownStatus.className = 'text-sm font-bold text-yellow-400';
        modalCooldownDetail.textContent = `Next generation available in ${formatMsDuration(info.nextAvailableInMs)}.`;
    }
}

export function getGenerationCooldownWarning() {
    if (!state.generationLog || state.generationLog.length === 0) {
        return null;
    }

    // Sort the log so the latest generation event timestamp is last
    const sortedLog = [...state.generationLog].sort((a, b) => a - b);
    const lastGenerationTime = sortedLog[sortedLog.length - 1];
    
    const now = Date.now();
    const threeMinutesMs = 3 * 60 * 1000; // 3 minutes in milliseconds
    const timeElapsed = now - lastGenerationTime;

    // RULE 1: Strict 3-minute cooldown since the last creation
    if (timeElapsed < threeMinutesMs) {
        const remainingMs = threeMinutesMs - timeElapsed;
        const remainingMinutes = Math.floor(remainingMs / 60000);
        const remainingSeconds = Math.ceil((remainingMs % 60000) / 1000);
        
        if (remainingMinutes > 0) {
            return `Please wait ${remainingMinutes}m ${remainingSeconds}s before generating another quiz.`;
        }
        return `Please wait ${remainingSeconds} seconds before generating another quiz.`;
    }

    // RULE 2: Fallback to your sliding multi-generation block window (Optional)
    const activeLogsInWindow = sortedLog.filter(timestamp => (now - timestamp) < constants.GENERATION_WINDOW_MS);
    if (activeLogsInWindow.length >= constants.MAX_GENERATIONS_PER_WINDOW) {
        return `Hourly rate limit reached. You can make ${constants.MAX_GENERATIONS_PER_WINDOW} quizzes every 3 hours.`;
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

export async function openAccountAsModal() {
    // Show the small title card header when operating inside the floating overlay
    const cardHeader = document.getElementById('account-card-header');
    if (cardHeader) cardHeader.classList.remove('hidden');

    elements.accountModalOverlay.appendChild(elements.accountCard);
    elements.accountModalOverlay.classList.remove('hidden');
    pushSubState('#account-modal');
    await populateAccountData();
}

// Function for Nav Bar buttons (Shows as Full Page Dashboard)
export async function openAccountAsView() {
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

        // CRITICAL FIX: Only poll profile parameters from cloud if online
        if (navigator.onLine) {
            try {
                const user = await puter.auth.getUser();
                username = user.username || 'Unknown';
                uuid = user.uuid || user.id || user.accountId || 'Unknown';
                email = user.email || (user.sessionId ? `Session ${user.sessionId}` : 'Not available');
            } catch (uErr) {
                console.warn("Failed to fetch user data from cloud:", uErr);
                username = localStorage.getItem('nodal_cached_username') || 'Account User';
                uuid = 'Offline Mode';
                email = 'Offline Mode';
            }
        } else {
            username = localStorage.getItem('nodal_cached_username') || 'Account User';
            uuid = 'Offline Mode';
            email = 'Offline Mode';
        }

        if (elements.modalUsername) elements.modalUsername.textContent = username;
        if (document.getElementById('modal-account-id')) document.getElementById('modal-account-id').textContent = uuid;
        if (document.getElementById('modal-email')) document.getElementById('modal-email').textContent = email;

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
        if (document.getElementById('modal-storage-label')) {
            document.getElementById('modal-storage-label').textContent = navigator.onLine ? 'Free' : 'Offline';
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
    // If it's inside the modal overlay, just hide the modal
    if (elements.accountCard.parentElement?.id === 'account-modal-overlay') {
        clearSubState('#account-modal');
        elements.accountModalOverlay.classList.add('hidden');
        if (!fromPopState && window.location.hash === '#account-modal') {
            window.history.back();
        }
    } else {
        // If it's inside the view, go back to start screen
        showView('start');
    }
}

export function showToast(message, duration = 3000, type = 'success') {
    if (state.toastTimeout) {
        clearTimeout(state.toastTimeout);
    }
    toastMessageEl.textContent = message;
    toastEl.classList.remove('hidden', 'bg-green-600', 'bg-red-600', 'bg-yellow-600');
    toastEl.classList.add(type === 'error' ? 'bg-red-600' : type === 'warning' ? 'bg-yellow-600' : 'bg-green-600');
    state.toastTimeout = setTimeout(() => {
        toastEl.classList.add('hidden');
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
        overlay.classList.add('hidden');
    }
}

export function updateNavHighlights(activeKey) {
    // 1. Update Mobile Nav
    if (elements.mobileNavHomeBtn) {
        elements.mobileNavHomeBtn.classList.toggle('text-white', activeKey === 'home');
        elements.mobileNavHomeBtn.classList.toggle('bg-blue-600', activeKey === 'home');
        elements.mobileNavHomeBtn.classList.toggle('text-gray-300', activeKey !== 'home');
    }
    if (elements.mobileNavHistoryBtn) {
        elements.mobileNavHistoryBtn.classList.toggle('text-white', activeKey === 'history');
        elements.mobileNavHistoryBtn.classList.toggle('bg-blue-600', activeKey === 'history');
        elements.mobileNavHistoryBtn.classList.toggle('text-gray-300', activeKey !== 'history');
    }

    // --- NEW: Track if current layout is nested inside the Mobile Menu overlay drawer ---
    const isMenuPage = ['help', 'about', 'account'].includes(activeKey);
    if (elements.mobileNavMenuBtn) {
        elements.mobileNavMenuBtn.classList.toggle('text-white', isMenuPage);
        elements.mobileNavMenuBtn.classList.toggle('bg-blue-600', isMenuPage);
        elements.mobileNavMenuBtn.classList.toggle('text-gray-300', !isMenuPage);
    }

    // --- NEW: Active context highlights directly on buttons inside the open Modal list ---
    if (elements.mobileMenuHelpBtn) {
        elements.mobileMenuHelpBtn.classList.toggle('text-white', activeKey === 'help');
        elements.mobileMenuHelpBtn.classList.toggle('bg-blue-600', activeKey === 'help');
        elements.mobileMenuHelpBtn.classList.toggle('bg-gray-700/30', activeKey !== 'help');
        elements.mobileMenuHelpBtn.classList.toggle('text-gray-300', activeKey !== 'help');
    }
    if (elements.mobileMenuAboutBtn) {
        elements.mobileMenuAboutBtn.classList.toggle('text-white', activeKey === 'about');
        elements.mobileMenuAboutBtn.classList.toggle('bg-blue-600', activeKey === 'about');
        elements.mobileMenuAboutBtn.classList.toggle('bg-gray-700/30', activeKey !== 'about');
        elements.mobileMenuAboutBtn.classList.toggle('text-gray-300', activeKey !== 'about');
    }
    if (elements.mobileMenuAccountBtn) {
        elements.mobileMenuAccountBtn.classList.toggle('text-white', activeKey === 'account');
        elements.mobileMenuAccountBtn.classList.toggle('bg-blue-600', activeKey === 'account');
        elements.mobileMenuAccountBtn.classList.toggle('bg-gray-700/30', activeKey !== 'account');
        elements.mobileMenuAccountBtn.classList.toggle('text-gray-300', activeKey !== 'account');
    }

    // 2. Update Desktop Nav
    const map = {
        home: elements.desktopNavHomeBtn,
        history: elements.desktopNavHistoryBtn,
        help: elements.desktopNavHelpBtn,
        about: elements.desktopNavAboutBtn,
        account: elements.desktopNavAccountBtn
    };

    Object.keys(map).forEach(key => {
        const btn = map[key];
        if (btn) {
            btn.classList.toggle('text-white', key === activeKey);
            btn.classList.toggle('bg-blue-600', key === activeKey);
            btn.classList.toggle('text-gray-300', key !== activeKey);
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
        }
    };

    const config = configMap[viewId];
    if (!config) return;

    const header = document.querySelector(config.headerSelector);
    const sentinel = document.getElementById(config.sentinelId);
    if (!header || !sentinel) return;

    const existingObserver = scrollReactiveHeaderObservers.get(viewId);
    if (existingObserver) existingObserver.disconnect();

    header.classList.remove('is-stuck');

    const observer = new IntersectionObserver(([entry]) => {
        header.classList.toggle('is-stuck', !entry.isIntersecting);
    }, { threshold: 0 });

    observer.observe(sentinel);
    scrollReactiveHeaderObservers.set(viewId, observer);
}

export function viewToHash(viewId) {
    switch (viewId) {
        case 'start': return '#home';
        case 'history-fullscreen': return '#history';
        case 'help': return '#help';
        case 'about': return '#about';
        case 'account': return '#account';
        case 'quiz': return '#quiz';
        case 'results': return '#results';
        case 'loading': return '#loading';
        default: return '#home';
    }
}

export function hashToView(hash) {
    const cleanHash = (hash || '').replace(/^#/, '').toLowerCase();
    switch (cleanHash) {
        case 'home':
        case '': return 'start';
        case 'history': return 'history-fullscreen';
        case 'help': return 'help';
        case 'about': return 'about';
        case 'account': return 'account';
        case 'quiz': return 'quiz';
        case 'results': return 'results';
        case 'loading': return 'loading';
        default: return 'start';
    }
}

export const SUB_STATE_HASHES = [
    '#customize',
    '#edit',
    '#ai-prompt',
    '#account-modal',
    '#share',
    '#share-config',
    '#share-live',
    '#share-manage',
    '#history-actions',
    '#shared-quiz'
];

export function pushSubState(hash) {
    if (!SUB_STATE_HASHES.includes(hash)) return;
    state.activeSubState = hash;
    state.authorizedSubStates = state.authorizedSubStates || new Set();
    state.authorizedSubStates.add(hash);
    if (window.location.hash !== hash) {
        window.history.pushState({ view: 'start', subState: hash, fromApp: true }, '', hash);
    }
}

export function clearSubState(hash) {
    if (state.authorizedSubStates) {
        state.authorizedSubStates.delete(hash);
    }
    if (state.activeSubState === hash) {
        state.activeSubState = null;
    }
}

export function isSubStateAuthorized(hash) {
    if (!SUB_STATE_HASHES.includes(hash)) return true;
    if (!state.authorizedSubStates || !state.authorizedSubStates.has(hash)) return false;

    // Prerequisite context checks for privacy and state safety
    if (hash === '#customize') {
        return (state.currentFiles && state.currentFiles.length > 0) || (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0);
    }
    if (hash === '#edit') {
        return !!state.isCustomizingHistory && !!state.customizingQuizData;
    }
    if (hash === '#ai-prompt') {
        return elements.aiPromptModal && !elements.aiPromptModal.classList.contains('hidden');
    }
    if (hash === '#account-modal') {
        return elements.accountModalOverlay && !elements.accountModalOverlay.classList.contains('hidden');
    }
    if (hash.startsWith('#share')) {
        const shareModal = document.getElementById('share-modal');
        return shareModal && !shareModal.classList.contains('hidden');
    }
    if (hash === '#history-actions') {
        return elements.historyActionsModal && !elements.historyActionsModal.classList.contains('hidden');
    }
    if (hash === '#shared-quiz') {
        return elements.sharedQuizModal && !elements.sharedQuizModal.classList.contains('hidden');
    }
    return true;
}

export function getActiveViewId() {
    for (const [id, el] of Object.entries(elements.views)) {
        if (el && el.classList.contains('active')) return id;
    }
    return 'start';
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
    }

    // 3. Automatically highlight the correct nav button!
    let navKey = id;
    if (id === 'start') navKey = 'home';
    if (id === 'history-fullscreen') navKey = 'history';
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
        const currentViewId = getActiveViewId();

        // 0. DIRECT URL ACCESS GUARD
        // Privacy & integrity check: disallow opening sub-states/modals by typing the # tag directly in address bar
        if (SUB_STATE_HASHES.includes(targetHash) && !isSubStateAuthorized(targetHash)) {
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

        // 3. AI Prompt Modal Dismiss
        if (elements.aiPromptModal && !elements.aiPromptModal.classList.contains('hidden')) {
            if (targetHash !== '#ai-prompt') {
                closeAiPromptModal(true);
                if (targetHash === '#customize' || targetHash === '#edit') {
                    return;
                }
            }
        }

        // 4. Account Modal Overlay Dismiss
        if (elements.accountModalOverlay && !elements.accountModalOverlay.classList.contains('hidden')) {
            if (targetHash !== '#account-modal') {
                elements.accountModalOverlay.classList.add('hidden');
                clearSubState('#account-modal');
                if (targetHash === '#home') return;
            }
        }

        // 5. Mobile Menu Dismiss
        if (elements.mobileMenuModal && !elements.mobileMenuModal.classList.contains('hidden')) {
            elements.mobileMenuModal.classList.add('hidden');
        }

        // 5a. History Actions Submenu Modal Dismiss
        if (elements.historyActionsModal && !elements.historyActionsModal.classList.contains('hidden')) {
            if (targetHash !== '#history-actions') {
                closeHistoryActionsModal(true);
                if (targetHash === '#history') {
                    const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
                    showAllHistoryFullScreen(false);
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

        // 7. Document Upload Customization Screen (#customize)
        const isCustomizingDocs = (state.activeSubState === '#customize') || 
            (!state.isCustomizingHistory && ((state.currentFiles && state.currentFiles.length > 0) || (typeof state.fileContent === 'string' && state.fileContent.trim().length > 0)));
        if (isCustomizingDocs) {
            if (targetHash !== '#customize') {
                window.history.pushState({ view: 'start', subState: '#customize', fromApp: true }, '', '#customize');
                const confirmed = await customConfirm(
                    'Are you sure you want to cancel quiz generation and return to the home screen? Any selected documents will be cleared.',
                    'Cancel Quiz Generation',
                    'Yes, Return Home',
                    'Stay Here',
                    true
                );
                if (confirmed) {
                    clearSubState('#customize');
                    const { resetApp } = await import('./quiz/quizUtils.js');
                    resetApp(true);
                    window.history.replaceState({ view: 'start' }, '', '#home');
                    showToast('Quiz generation cancelled.', 2000, 'info');
                }
                return;
            }
        }

        // 8. History Quiz Edit Mode (#edit)
        const isCustomizingHist = (state.activeSubState === '#edit') || state.isCustomizingHistory;
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

        // 9. Standard View Navigation (#home, #history, #help, #about, #account, #results)
        const targetViewId = hashToView(targetHash);
        showView(targetViewId, false);

        if (targetViewId === 'start') {
            refreshHistory();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (targetViewId === 'history-fullscreen') {
            const { showAllHistoryFullScreen } = await import('./quiz/quizHistory.js');
            showAllHistoryFullScreen(false);
        } else if (targetViewId === 'account') {
            openAccountAsView();
        }

    } finally {
        isPopStateHandling = false;
    }
}

export function initRouter() {
    // Reset to home view and nav highlights on fresh load or page refresh
    window.history.replaceState({ view: 'start' }, '', '#home');
    showView('start', false);
    updateNavHighlights('home');

    window.addEventListener('popstate', handlePopState);
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

export function refreshHistory() {
    const isCustomizing = state.isCustomizingHistory || (state.currentFiles && state.currentFiles.length > 0) || !document.getElementById('customize-content')?.classList.contains('hidden');
    if (isCustomizing) {
        setHistoryVisibility(false);
    } else {
        setHistoryVisibility(true);
    }

    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    // 1. CLEAR BOTH CONTAINERS
    if (elements.historyList) elements.historyList.innerHTML = '';
    
    const fullContainer = elements.historyFullList || document.getElementById('history-full-list');
    if (fullContainer) fullContainer.innerHTML = '';
    
    // Handle empty state
    if (sorted.length === 0) {
        const noQuizzesHTML = `<p class="text-sm text-gray-500 text-center">No saved quizzes.</p>`;
        if (elements.historyList) elements.historyList.innerHTML = noQuizzesHTML;
        if (fullContainer) fullContainer.innerHTML = noQuizzesHTML;
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
        
        let diffTxt = config.difficulty ? `(${config.difficulty}` : '(';
        if (config.difficulty === 'custom' && config.customTypeShort) {
            diffTxt += `: ${config.customTypeShort})`;
        } else if (config.difficulty) {
            diffTxt += ')';
        } else {
            diffTxt += `${config.type || 'mixed'})`;
        }
        
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
                <p class="text-xs text-gray-400 truncate">${config.count || 0} Qs ${diffTxt} ${tInfo} ${attInfo} ${summaryInfo}</p>
            </div>
            <!-- Mobile 2-button layout: 3-dot Options (Submenu) and Load -->
            <div class="flex md:hidden flex-shrink-0 gap-1.5 items-center">
                <button class="bg-gray-700/90 hover:bg-gray-700 text-gray-200 p-1.5 rounded-lg inline-flex items-center justify-center border border-gray-600/60 transition-colors" data-key="${key}" data-action="history-submenu" title="Quiz Options" aria-label="Quiz Options">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                    </svg>
                </button>
                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2.5 rounded inline-flex items-center justify-center gap-1 transition-colors" data-key="${key}" data-action="load" title="Load Quiz">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
            </div>
            <!-- Desktop buttons: Share, Edit, Load, Delete -->
            <div class="hidden md:flex flex-shrink-0 gap-1 sm:gap-2"> 
                <button class="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="share" title="Share / Export">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    <span>Share</span>
                </button>
                <button class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="customize" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"/></svg>
                    <span>Edit</span>
                </button>
                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="load" title="Load">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
                ${showDelete ? `
                <button class="bg-red-600/80 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 sm:px-2.5 rounded inline-flex items-center justify-center gap-1 transition-colors" data-key="${key}" data-action="delete" title="Delete Quiz">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    <span>Delete</span>
                </button>
                ` : ''}
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
        manualReveal: elements.manualRevealToggle ? elements.manualRevealToggle.checked : false,
        randomizeQuestions: elements.shuffleQuestionsToggle ? elements.shuffleQuestionsToggle.checked : true,
        randomizeChoices: elements.shuffleChoicesToggle ? elements.shuffleChoicesToggle.checked : true,
        allowChangeSelection: elements.allowChangeToggle ? elements.allowChangeToggle.checked : false
    };
}

export function hasUnsavedChanges() {
    if (!state.isCustomizingHistory) return false;
    const current = getCustomizeState();
    return current.name !== state.initialCustomizeState.name ||
        current.timeLimit !== state.initialCustomizeState.timeLimit ||
        current.timePreset !== state.initialCustomizeState.timePreset ||
        current.customTime !== state.initialCustomizeState.customTime ||
        current.attemptLimit !== state.initialCustomizeState.attemptLimit ||
        current.attempts !== state.initialCustomizeState.attempts ||
        current.summaryOnly !== state.initialCustomizeState.summaryOnly ||
        current.uiMode !== state.initialCustomizeState.uiMode;
}

export function setupCustomizeView(config, name) {
    state.isCustomizingHistory = true;
    renameContainer.classList.remove('hidden');
    editQuizNameInput.value = name || '';

    startSubtitle.textContent = `Customizing: "${name || 'quiz'}" (Options only)`;
    generateQuizBtn.textContent = 'Start Customized Quiz';
    cancelCustomizeBtn.classList.remove('hidden');
    deleteCustomizeBtn.classList.remove('hidden');
    fileActionsDiv.classList.add('hidden');

    elements.resumeQuizBtn.classList.add('hidden');

    customizeSection.classList.remove('hidden');
    customizeContent.classList.remove('hidden');
    customizeToggleIcon.classList.add('rotate-180');

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
    if (customOptionsDiv) customOptionsDiv.classList.add('hidden');

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
        summaryOnlyToggle.checked = !!config.showAnswersInSummaryOnly;
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
    
    if (elements.manualRevealToggle) {
        elements.manualRevealToggle.checked = config.manualReveal || false;
    }
    if (elements.shuffleQuestionsToggle) elements.shuffleQuestionsToggle.checked = config.randomizeQuestions !== false;
    if (elements.shuffleChoicesToggle) elements.shuffleChoicesToggle.checked = config.randomizeChoices !== false;

    if (elements.allowChangeToggle) {
        elements.allowChangeToggle.checked = config.allowChangeSelection || false;
    }

    validateAllInputs();
    state.initialCustomizeState = getCustomizeState();
}



export function handleTimePresetChange() {
    const sel = document.querySelector('input[name="time_preset"]:checked').value;
    customTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
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

    // --- NESTED NEIGHBOR DEPENDENCY AND CLEARANCE CONTROLLERS ---
    
    // 1. Manage Parental Layout Rules for Summary Only vs Manual Reveal Toggles
    const manualRevealContainer = document.getElementById('manual-reveal-container');
    if (summaryOnlyToggle.checked) {
        if (manualRevealContainer) manualRevealContainer.classList.remove('hidden');
        if (elements.manualRevealToggle) elements.manualRevealToggle.disabled = false;
    } else {
        if (manualRevealContainer) manualRevealContainer.classList.add('hidden');
        if (elements.manualRevealToggle) {
            elements.manualRevealToggle.checked = false;
            elements.manualRevealToggle.disabled = true;
        }
    }

    // 2. Choice-Swapping settings panel (Always unlocked and enabled)
    const allowChangeToggleEl = document.getElementById('allow-change-toggle');
    const allowChangeContainer = document.getElementById('allow-change-container');
    if (allowChangeToggleEl) allowChangeToggleEl.disabled = false;
    if (allowChangeContainer) allowChangeContainer.classList.remove('opacity-50', 'pointer-events-none');

    // 3. Evaluate Verification Bounds on Timed Quiz Variations
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

    const sourceSection = fileContent && fileContent.trim().length > 0 
        ? `\n\n----------------------------------------\nSource Text / Reviewer:\n${fileContent.trim()}`
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

questions (Multiple Choice - True/False): Format each object as follows:

"type": "multiple-choice"

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

export function openAiPromptModal(config, fileName) {
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
        pushSubState('#ai-prompt');
    }
}

export function closeAiPromptModal(fromPopState = false) {
    clearSubState('#ai-prompt');
    if (elements.aiPromptModal) {
        elements.aiPromptModal.classList.add('hidden');
    }
    if (!fromPopState && window.location.hash === '#ai-prompt') {
        window.history.back();
    }
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
        desktopNavAccount.onclick = openAccountAsView;
    }
    if (mobileNavAccount) {
        mobileNavAccount.onclick = openAccountAsView;
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
}

export function initializeAppState() {
    refreshHistory();
    handleDifficultyChange();
    handleTimeToggle();
    handleAttemptToggle();

    updateNavHighlights('home');
}

export function prepareSavedProgress() {
    try {
        const saved = localStorage.getItem(IN_PROGRESS_QUIZ_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            if (data?.questions?.length && (data.shuffledIndexPos < data.shuffledIndices?.length || data.inSkippedRound)) {
                state.savedProgress = data;
                elements.resumeQuizBtn.classList.remove('hidden');
                elements.resumeQuizBtn.textContent = `Resume: ${data.fileName || 'Quiz'} (${data.answeredIndices?.length || 0}/${data.questions.length})`;
            } else {
                clearInProgressQuiz();
            }
        }
    } catch (e) {
        console.error('Could not read progress', e);
        clearInProgressQuiz();
    }
}

export function clearInProgressQuiz() {
    localStorage.removeItem(IN_PROGRESS_QUIZ_KEY);
    state.savedProgress = null;
    elements.resumeQuizBtn.classList.add('hidden');
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

export function openShareModal(quizKey) {
    state.currentShareQuizKey = quizKey;
    const quiz = state.quizHistory[quizKey];
    
    // Show the modal backdrop
    elements.shareModal.classList.remove('hidden');
    
    // Check if this quiz is already shared
    if (quiz && quiz.share && quiz.share.isShared) {
        // Populate the existing share details
        elements.shareLinkInput.value = quiz.share.shareUrl || 'Link unavailable. Please generate again.';
        
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

    // 1. Hide the modal container
    if (elements.shareModal) {
        elements.shareModal.classList.add('hidden');
    }

    // 2. IMPORTANT: If you have an overlay div (the dark background), 
    // make sure it is hidden too, or it will block the entire page.
    const shareOverlay = document.getElementById('share-modal-overlay'); // Adjust ID as needed
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
        const exportData = {
            fileName: quiz.fileName,
            config: quiz.config,
            questions: quiz.questions
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
            welcomeModal.classList.add('hidden');
        };
    }
}

// ==========================================
// MOBILE HISTORY ACTIONS SUBMENU MODAL
// ==========================================
export function openHistoryActionsModal(quizKey) {
    if (!elements.historyActionsModal) return;
    state.activeHistoryMenuKey = quizKey;
    state.historyMenuOriginHash = window.location.hash || '#history';
    const db = getQuizDB();
    const item = db[quizKey];
    const title = (item && item.fileName) ? item.fileName : (quizKey ? quizKey.replace(/_/g, ' ') : 'Quiz Options');
    if (elements.historySubmenuQuizTitle) {
        elements.historySubmenuQuizTitle.textContent = title;
    }
    elements.historyActionsModal.classList.remove('hidden');
    pushSubState('#history-actions');
}

export function closeHistoryActionsModal(isFromPopState = false, popHistory = true) {
    if (!elements.historyActionsModal || elements.historyActionsModal.classList.contains('hidden')) return;
    elements.historyActionsModal.classList.add('hidden');
    clearSubState('#history-actions');
    const originHash = state.historyMenuOriginHash || '#history';
    state.activeHistoryMenuKey = null;

    if (!isFromPopState && window.location.hash === '#history-actions') {
        if (popHistory) {
            window.history.back();
        } else {
            window.history.replaceState({ view: hashToView(originHash) }, '', originHash);
        }
    }
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
    elements.sharedQuizModal.classList.add('hidden');
    clearSubState('#shared-quiz');
    state.pendingSharedQuiz = null;

    if (!isFromPopState && window.location.hash === '#shared-quiz') {
        if (popHistory) {
            window.history.back();
        } else {
            window.history.replaceState({ view: 'start' }, '', '#home');
        }
    }
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