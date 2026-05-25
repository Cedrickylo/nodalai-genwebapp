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
    cancelConfirmBtn
} = elements;

const { DB_NAME, CLOUD_SYNC_KEY, IN_PROGRESS_QUIZ_KEY, GENERATION_LOG_LOCAL_KEY, GENERATION_LOG_CLOUD_KEY, GENERATION_WINDOW_MS, MAX_GENERATIONS_PER_WINDOW, MIN_QUIZ_QUESTIONS, MAX_QUIZ_QUESTIONS } = constants;

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

// --- Consolidated Toggle Functions ---

export function handleTimeToggle() {
    // Show/hide the entire options container
    timeLimitOptions.classList.toggle('hidden', !timeLimitToggle.checked);
    
    if (timeLimitToggle.checked) {
        handleTimePresetChange(); // Show specific sub-option if enabled
    } else {
        customTimeInputContainer.classList.add('hidden');
    }
}

export function handleAttemptToggle() {
    // Show/hide the attempt limit container based on checkbox state
    attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
}

export function handleDifficultyChange() {
    // Look up live difficulty radio inputs directly from the current active DOM layout
    const activeRadio = document.querySelector('input[name="difficulty"]:checked');
    const customOptionsDiv = document.getElementById('custom-options');
    
    if (activeRadio && customOptionsDiv) {
        // Safely toggle the visibility state of custom mix menus without crashing
        if (activeRadio.value === 'custom') {
            customOptionsDiv.classList.remove('hidden');
        } else {
            customOptionsDiv.classList.add('hidden');
        }
    }
}

export async function handleLogout() {
    const isConfirmed = await customConfirm('Are you sure you want to log out?', 'Sign Out', 'Sign Out', 'Cancel', true);
    if (isConfirmed) {
        // 1. Sign out of Puter
        await puter.auth.signOut();
        accountModal.classList.add('hidden');
        
        // --- NEW CLEANUP LOGIC ---
        // 2. Wipe the saved data from the browser's Local Storage
        localStorage.removeItem(constants.DB_NAME); 
        localStorage.removeItem(constants.IN_PROGRESS_QUIZ_KEY);
        
        // 3. Clear the active history from the live state
        state.quizHistory = {};
        
        // 4. Update the UI to reflect empty history and reset the view
        refreshHistory();
        clearInProgressQuiz(); // Hides any "Resume Quiz" buttons
        showView('start');     // Kicks the user back to the main screen
        // -------------------------

        // 5. Update Auth buttons and notify user
        updateAuthUI();
        showToast('Logged out successfully and cleared local history');
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

export function setSyncing(isSyncing) {
    [globalSyncDone, quizSyncDone].forEach(el => el?.classList.toggle('hidden', isSyncing));
    [globalSyncLoad, quizSyncLoad].forEach(el => el?.classList.toggle('hidden', !isSyncing));
}

export async function syncHistoryWithCloud(manual = false) {
    if (!puter.auth.isSignedIn()) {
        if (manual) showToast('Sign in to Puter to sync history.', 4000, 'warning');
        return;
    }
    
    if (manual) showToast('Started syncing...');
    setSyncing(true);

    try {
        // 1. Get Cloud Data
        const cloudRaw = await puter.kv.get(CLOUD_SYNC_KEY);
        const cloudData = cloudRaw ? JSON.parse(cloudRaw) : { items: {}, updatedAt: 0 };

        // 2. Get Local Data
        const localItems = JSON.parse(localStorage.getItem(DB_NAME) || '{}');
        
// 3. MERGE: Quiz-by-quiz timestamp comparison (Last-Write-Wins)
const mergedItems = {};

// Combine all unique quiz keys from both cloud and local history
const allKeys = new Set([...Object.keys(cloudData.items), ...Object.keys(localItems)]);

for (const key of allKeys) {
    const cloudQuiz = cloudData.items[key];
    const localQuiz = localItems[key];
    
    if (cloudQuiz && localQuiz) {
        // Both exist, choose the version with the newer internal timestamp
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

        // 4. Update State and LocalStorage
        state.quizHistory = mergedItems;
        localStorage.setItem(DB_NAME, JSON.stringify(mergedItems));
        localStorage.setItem(DB_NAME + '_ts', now.toString());

        // 5. Push the unified history back to the Cloud
        await puter.kv.set(CLOUD_SYNC_KEY, JSON.stringify({ 
            items: mergedItems, 
            updatedAt: now 
        }));

        refreshHistory();
        if (manual) showToast('Done syncing!');
    } catch (e) {
        console.error('Sync error', e);
        showToast('Sync failed. Please check your connection.', 3000, 'error');
    } finally {
        setSyncing(false);
    }
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
    if (!puter.auth.isSignedIn()) {
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
    const signedIn = puter.auth.isSignedIn();

    if (signedIn) {
        const customName = await puter.kv.get('custom_display_name');
        authBtnText.textContent = customName || 'Account';
        authBtn.classList.remove('bg-blue-600');
        authBtn.classList.add('bg-green-600');
        await syncHistoryWithCloud();
        await loadGenerationCooldownState();
    } else {
        authBtnText.textContent = 'Puter Login';
        authBtn.classList.remove('bg-green-600');
        authBtn.classList.add('bg-blue-600');
    }
}

export async function openAccountModal() {
    const user = await puter.auth.getUser();
    modalUsername.textContent = user.username || 'Unknown';
    modalAccountId.textContent = user.uuid || user.id || user.accountId || 'Unknown';
    modalEmail.textContent = user.email
        ? user.email
        : user.sessionId
            ? `Session ${user.sessionId}`
            : user.accountId || user.uuid || user.id || 'Not available';

    let creditLabel = 'Balance unavailable';
    let progressWidth = 40;
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

    modalCredits.textContent = creditLabel;
    creditProgress.style.width = `${progressWidth}%`;

    const showCredits = isUsingPuterAI();
    modalCreditPanel.classList.toggle('hidden', !showCredits);
    modalStoragePanel.classList.remove('hidden');
    modalStorageLabel.textContent = 'Free';

    const customName = await puter.kv.get('custom_display_name');
    displayNameInput.value = customName || '';
    authBtnText.textContent = customName || 'Account';

    await refreshCooldownPanel();
    accountModal.classList.remove('hidden');
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

export function closeAccountModalHandler() {
    accountModal.classList.add('hidden');
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

export function showView(id) {
    Object.values(views).forEach(v => { if (v) v.classList.remove('active'); });
    if (views[id]) views[id].classList.add('active');
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
        let finalName = data.fileName || 'Untitled Quiz';
        const existingEntries = Object.entries(state.quizHistory);
        let counter = 2;
        const baseName = finalName.replace(/\.[^/.]+$/, '');

        while (existingEntries.some(([k, v]) => k !== key && v.fileName === finalName)) {
            finalName = `${counter} ${baseName}`;
            counter++;
        }

        // GET EXISTING DATA FIRST
        const existingQuiz = state.quizHistory[key] || {};

        // MERGE: Keep old 'share' data, update the rest
        state.quizHistory[key] = {
            ...existingQuiz, // Preserve existing 'share' object if it exists
            questions: data.questions, 
            fileName: finalName, 
            config: data.config, 
            timestamp: Date.now() 
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
    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    elements.historyList.innerHTML = '';
    
    if (sorted.length === 0) {
        elements.historyList.innerHTML = `<p class="text-sm text-gray-500 text-center">No saved quizzes.</p>`;
        elements.showAllHistoryBtn?.classList.add('hidden');
        return;
    }

    // If on desktop (>= 768px) only show the 3 most recent items in the compact history list
    const isDesktop = window.innerWidth >= 768;
    const displayItems = isDesktop ? sorted.slice(0, 3) : sorted;

    // Show the "Show All" button only on desktop when there are more than 3 items
    if (isDesktop && sorted.length > 3) {
        elements.showAllHistoryBtn?.classList.remove('hidden');
    } else {
        elements.showAllHistoryBtn?.classList.add('hidden');
    }

    displayItems.forEach(([key, data]) => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-700/50 rounded-lg flex justify-between items-center';
        
        const tInfo = formatTime(data.config.totalTime);
        let diffTxt = data.config.difficulty ? `(${data.config.difficulty}` : '(';
        if (data.config.difficulty === 'custom' && data.config.customTypeShort) {
            diffTxt += `: ${data.config.customTypeShort})`;
        } else if (data.config.difficulty) {
            diffTxt += ')';
        } else {
            diffTxt += `${data.config.type || 'mixed'})`;
        }
        
        const attInfo = data.config.isAttemptLimited ? `(${data.config.maxAttempts} att)` : '';
        const summaryInfo = data.config.showAnswersInSummaryOnly ? '(Summ Only)' : '';
        
        // 1. Check if the quiz is shared
        const isShared = data.share && data.share.isShared;
        const shareIconHTML = isShared ? `
            <span class="text-blue-400 bg-blue-500/10 p-1 rounded inline-flex items-center flex-shrink-0" title="Currently sharing via link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </span>
        ` : '';

        // 2. Build the title row (REMOVED max-w-[150px], ADDED dynamic flex sizing)
        const titleHtml = `
            <div class="flex items-center gap-2 min-w-0 mb-1 w-full">
                <p class="font-semibold text-sm truncate min-w-0" title="${data.fileName || 'Untitled'}">
                    ${data.fileName || 'Untitled'}
                </p>
                ${shareIconHTML}
            </div>
        `;

        // 3. Set the HTML
        item.innerHTML = `
            <div class="flex-grow min-w-0 mr-4 overflow-hidden">
                ${titleHtml}
                <p class="text-xs text-gray-400 truncate">${data.config.count || 0} Qs ${diffTxt} ${tInfo} ${attInfo} ${summaryInfo}</p>
            </div>
            <div class="flex-shrink-0 flex gap-1 sm:gap-2"> 
                <button class="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="share" title="Share / Export">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    <span class="hidden sm:inline">Share</span>
                </button>
                <button class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="customize" title="Edit">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19.5 3 21l1.5-4L16.5 3.5z"/></svg>
                    <span class="hidden sm:inline">Edit</span>
                </button>
                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="load" title="Load">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
            </div>
        `;      
        elements.historyList.appendChild(item);
    });
}

export function getCustomizeState() {
    let preset = '10';
    const selectedRadio = document.querySelector('input[name="time_preset"]:checked');
    if (selectedRadio) preset = selectedRadio.value;
    return {
        name: editQuizNameInput.value.trim(),
        timeLimit: timeLimitToggle.checked,
        timePreset: preset,
        customTime: parseInt(customTimeLimitInput.value, 10) || 15,
        attemptLimit: attemptLimitToggle.checked,
        attempts: parseInt(attemptLimitInput.value, 10) || 3,
        summaryOnly: summaryOnlyToggle.checked
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
        current.summaryOnly !== state.initialCustomizeState.summaryOnly;
}

export function setupCustomizeView(config, fileName) {
    if (!config) return;

    // 1. Restore question counts input smoothly
    const qCountInput = document.getElementById('question-count');
    if (qCountInput) qCountInput.value = config.count || 10;

    // 2. Restore title renaming fields safely
    const renameInput = document.getElementById('edit-quiz-name');
    if (renameInput) renameInput.value = fileName || '';

    // 3. Dynamically trace and select matching difficulty targets
    if (config.difficulty) {
        const targetRadio = document.querySelector(`input[name="difficulty"][value="${config.difficulty}"]`);
        if (targetRadio) {
            targetRadio.checked = true;
            // Fire the updated change checker to update custom fields layout positions
            handleDifficultyChange();
        }
    }

    // 4. Handle structural mixed categories layout fields
    const customTypeSelect = document.getElementById('custom-question-type');
    const customMixedCounts = document.getElementById('custom-mixed-counts');
    if (customTypeSelect) {
        customTypeSelect.value = config.customType || 'mixed';
        if (customMixedCounts) {
            customMixedCounts.classList.toggle('hidden', customTypeSelect.value !== 'mixed');
        }
    }

    // 5. Populate explicit custom category numbers safely if they exist
    const mcInput = document.getElementById('mc-count');
    const idInput = document.getElementById('id-count');
    const enInput = document.getElementById('en-count');
    if (mcInput) mcInput.value = config.mc || 0;
    if (idInput) idInput.value = config.id || 0;
    if (enInput) enInput.value = config.en || 0;

    // 6. Restore time limits configurations layout properties
    const timeToggle = document.getElementById('time-limit-toggle');
    const timeOptions = document.getElementById('time-limit-options');
    if (timeToggle) {
        timeToggle.checked = !!config.isTimedQuiz;
        if (timeOptions) timeOptions.classList.toggle('hidden', !timeToggle.checked);
    }

    // 7. Restore attempt settings cards parameters checks
    const attemptToggle = document.getElementById('attempt-limit-toggle');
    const attemptOptions = document.getElementById('attempt-limit-options');
    const attemptInput = document.getElementById('attempt-limit-input');
    if (attemptToggle) {
        attemptToggle.checked = !!config.isAttemptLimited;
        if (attemptOptions) attemptOptions.classList.toggle('hidden', !attemptToggle.checked);
        if (attemptInput && config.maxAttempts) attemptInput.value = config.maxAttempts;
    }

    // 8. Restore summary checkbox parameters values
    const summaryToggle = document.getElementById('summary-only-toggle');
    if (summaryToggle) summaryToggle.checked = !!config.showAnswersInSummaryOnly;
}



export function handleTimePresetChange() {
    const sel = document.querySelector('input[name="time_preset"]:checked').value;
    customTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
}



export function handleCustomTypeChange() {
    const selected = customQuestionTypeSelect.value;
    const showMixed = selected === 'mixed';
    customMixedCountsDiv.classList.toggle('hidden', !showMixed);
    validateAllInputs();
}

export function validateAllInputs() {
    const hasSource = typeof state.fileContent === 'string' && state.fileContent.trim().length > 0;
    const hasCustomize = !!state.customizingQuizData || state.isCustomizingHistory;
    const totalCount = parseInt(questionCountInput.value, 10) || 0;
    // Fix: If editing an existing quiz from history, bypass the count > 0 requirement
    let enabled = state.isCustomizingHistory ? hasCustomize : ((hasSource || hasCustomize) && totalCount > 0);

    // Fix: Wrap the question structure checks so they only run for NEW quizzes
    if (!state.isCustomizingHistory) {
        const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value;
        if (difficulty === 'custom') {
            const type = customQuestionTypeSelect.value;
            if (type === 'mixed') {
                const mc = parseInt(document.getElementById('mc-count').value, 10) || 0;
                const id = parseInt(document.getElementById('id-count').value, 10) || 0;
                const en = parseInt(document.getElementById('en-count').value, 10) || 0;
                enabled = enabled && mc + id + en === totalCount && totalCount > 0;
            }
        }
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

    generateQuizBtn.disabled = !enabled;
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
    // Safety check for the main login button
    if (authBtn) {
        authBtn.onclick = async () => {
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
                // If they are already signed in, just open the dashboard
                openAccountModal();
            }
        };
    }

    // Use optional chaining (?.) or conditional checks to prevent null execution crashes
    if (saveDisplayNameBtn) {
        saveDisplayNameBtn.onclick = saveDisplayName;
    }

    if (buyCreditsBtn) {
        buyCreditsBtn.onclick = () => {
            window.open('https://puter.com/billing', '_blank');
            showToast('Opening the credits purchase page...', 2500);
        };
    }

    if (logoutBtn) {
        logoutBtn.onclick = handleLogout;
    }

    if (closeAccountModal) {
        closeAccountModal.onclick = closeAccountModalHandler;
    }
}

export function initializeAppState() {
    refreshHistory();
    handleDifficultyChange();
    handleTimeToggle();
    handleAttemptToggle();
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

export function closeShareModal() {
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
    
    // 3. Reset any internal modal state
    console.log("Share modal closed and state reset.");
}

export function navigateToShareStep(step) {
    state.activeShareStep = step;
    
    // Hide all step containers
    elements.shareStepMenu.classList.add('hidden');
    elements.shareStepConfig.classList.add('hidden');
    elements.shareStepManage.classList.add('hidden');
    
    // Show the requested step and manage the Back button visibility
    if (step === 'menu') {
        elements.shareStepMenu.classList.remove('hidden');
        elements.shareBackBtn.classList.add('hidden'); // No back button on main menu
    } else if (step === 'config') {
        elements.shareStepConfig.classList.remove('hidden');
        elements.shareBackBtn.classList.remove('hidden');
    } else if (step === 'manage') {
        elements.shareStepManage.classList.remove('hidden');
        elements.shareBackBtn.classList.remove('hidden');
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