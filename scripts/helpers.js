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
    clearHistoryBtn,
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
        const cloudRaw = await puter.kv.get(CLOUD_SYNC_KEY);
        const cloudData = cloudRaw ? JSON.parse(cloudRaw) : { items: {}, updatedAt: 0 };
        const localUpdatedAt = parseInt(localStorage.getItem(DB_NAME + '_ts') || '0');

        if (localUpdatedAt > cloudData.updatedAt) {
            await puter.kv.set(CLOUD_SYNC_KEY, JSON.stringify({ items: state.quizHistory, updatedAt: localUpdatedAt }));
        } else if (cloudData.updatedAt > localUpdatedAt) {
            state.quizHistory = cloudData.items;
            localStorage.setItem(DB_NAME, JSON.stringify(state.quizHistory));
            localStorage.setItem(DB_NAME + '_ts', cloudData.updatedAt.toString());
            refreshHistory();
        }
        if (manual) showToast('Done syncing!');
    } catch (e) {
        console.error('Sync error', e);
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
    const info = getGenerationCooldownInfo();
    if (info.isAllowed) return null;
    return `Maximum of ${MAX_GENERATIONS_PER_WINDOW} quizzes generated in ${Math.floor(GENERATION_WINDOW_MS / 3600000)} hours. Next allowed generation in ${formatMsDuration(info.nextAvailableInMs)}.`;
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

        state.quizHistory[key] = { questions: data.questions, fileName: finalName, config: data.config, timestamp: Date.now() };
        localStorage.setItem(DB_NAME, JSON.stringify(state.quizHistory));
        localStorage.setItem(DB_NAME + '_ts', Date.now().toString());
        syncHistoryWithCloud();
        return true;
    } catch (e) {
        console.error('Save DB fail', e);
        statusMessage.textContent = 'Err saving history.';
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
    historyList.innerHTML = '';
    if (sorted.length === 0) {
        historyList.innerHTML = `<p class="text-sm text-gray-500 text-center">No saved quizzes.</p>`;
        clearHistoryBtn.classList.add('hidden');
        return;
    }
    clearHistoryBtn.classList.remove('hidden');
    sorted.forEach(([key, data]) => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-700/50 rounded-lg flex justify-between items-center';
        const tInfo = formatTime(data.config.totalTime);
        let diffTxt = data.config.difficulty ? `(${data.config.difficulty}` : '(`';
        if (data.config.difficulty === 'custom' && data.config.customTypeShort) {
            diffTxt += `: ${data.config.customTypeShort})`;
        } else if (data.config.difficulty) {
            diffTxt += ')';
        } else {
            diffTxt += `${data.config.type || 'mixed'})`;
        }
        const attInfo = data.config.isAttemptLimited ? `(${data.config.maxAttempts} att)` : '';
        const summaryInfo = data.config.showAnswersInSummaryOnly ? '(Summ Only)' : '';
        item.innerHTML = `
                    <div class="flex-grow mr-2 overflow-hidden">
                        <p class="font-semibold text-sm truncate" title="${data.fileName || 'Untitled'}">${data.fileName || 'Untitled'}</p>
                        <p class="text-xs text-gray-400">${data.config.count || 0} Qs ${diffTxt} ${tInfo} ${attInfo} ${summaryInfo}</p>
                    </div>
                    <div class="flex-shrink-0 flex gap-1 sm:gap-2"> 
                        <button class="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded" data-key="${key}" data-action="share" title="Share Link">Share</button>
                        <button class="bg-yellow-600 hover:bg-yellow-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded" data-key="${key}" data-action="customize" title="Customize">Cust</button>
                        <button class="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded" data-key="${key}" data-action="export" title="Export">Export</button>
                        <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded" data-key="${key}" data-action="load" title="Load">Load</button>
                    </div>`;        
        historyList.appendChild(item);
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

export function setupCustomizeView(config, name) {
    state.isCustomizingHistory = true;
    renameContainer.classList.remove('hidden');
    editQuizNameInput.value = name || '';

    startSubtitle.textContent = `Customizing: "${name || 'quiz'}" (Options only)`;
    generateQuizBtn.textContent = 'Start Customized Quiz';
    cancelCustomizeBtn.classList.remove('hidden');
    fileActionsDiv.classList.add('hidden');

    elements.resumeQuizBtn.classList.add('hidden');

    customizeSection.classList.remove('hidden');
    customizeContent.classList.remove('hidden');
    customizeToggleIcon.classList.add('rotate-180');

    questionCountInput.value = config.count || 10;
    questionCountInput.readOnly = true;
    questionCountInput.classList.add('locked-input');
    document.getElementById('question-count-group')?.querySelector('label')?.classList.add('locked-label');
    
    const diffValue = config.difficulty || 'easy';
    difficultyRadios.forEach(radio => {
        radio.checked = radio.value === diffValue;
        radio.disabled = true;
        radio.closest('div')?.querySelector('label')?.classList.add('locked-label');
    });
    
    if (diffValue === 'custom') {
        customOptionsDiv.classList.remove('hidden');
        const customType = config.customType || 'mixed';
        customQuestionTypeSelect.value = customType;
        customQuestionTypeSelect.disabled = true;
        customQuestionTypeSelect.classList.add('locked-input');
        customTypeGroup.querySelector('label').classList.add('locked-label');
        if (customType === 'mixed') {
            customMixedCountsDiv.classList.remove('hidden');
            document.getElementById('mc-count').value = config.mc || 0;
            document.getElementById('id-count').value = config.id || 0;
            document.getElementById('en-count').value = config.en || 0;
            customCountInputs.forEach(input => {
                input.readOnly = true;
                input.classList.add('locked-input');
                input.closest('div')?.querySelector('label')?.classList.add('locked-label');
            });
            customTotalFeedback.textContent = 'Counts match total.';
            customTotalFeedback.className = 'text-xs text-center mt-3 h-4 text-green-400';
        } else {
            customMixedCountsDiv.classList.add('hidden');
        }
    } else {
        customOptionsDiv.classList.add('hidden');
    }

    timeLimitToggle.checked = config.isTimed || false;
    handleTimeToggle();
    if (config.isTimed) {
        const totalMinutes = config.totalTime / 60;
        let foundPreset = false;
        timePresetRadios.forEach(radio => {
            if (radio.value !== 'custom' && parseInt(radio.value, 10) === totalMinutes) {
                radio.checked = true;
                foundPreset = true;
            }
        });
        if (!foundPreset) {
            document.getElementById('time-custom').checked = true;
            customTimeLimitInput.value = totalMinutes;
        }
        handleTimePresetChange();
    } else {
        document.getElementById('time-10m').checked = true;
        handleTimePresetChange();
    }
    
    attemptLimitToggle.checked = config.isAttemptLimited || false;
    attemptLimitInput.value = config.maxAttempts || 3;

    validateAllInputs();
}

export function handleTimeToggle() {
    timeLimitOptions.classList.toggle('hidden', !timeLimitToggle.checked);
    if (timeLimitToggle.checked) {
        handleTimePresetChange();
    } else {
        customTimeInputContainer.classList.add('hidden');
    }
}

export function handleTimePresetChange() {
    const sel = document.querySelector('input[name="time_preset"]:checked').value;
    customTimeInputContainer.classList.toggle('hidden', sel !== 'custom');
}

export function handleAttemptToggle() {
    attemptLimitOptions.classList.toggle('hidden', !attemptLimitToggle.checked);
}

export function handleDifficultyChange() {
    const selected = document.querySelector('input[name="difficulty"]:checked')?.value;
    const isCustom = selected === 'custom';
    customOptionsDiv.classList.toggle('hidden', !isCustom);
    if (isCustom) {
        handleCustomTypeChange();
    } else {
        customMixedCountsDiv.classList.add('hidden');
    }
    validateAllInputs();
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
    let enabled = (hasSource || hasCustomize) && totalCount > 0;

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
    saveDisplayNameBtn.onclick = saveDisplayName;
    buyCreditsBtn.onclick = () => {
        window.open('https://puter.com/billing', '_blank');
        showToast('Opening the credits purchase page...', 2500);
    };
    logoutBtn.onclick = handleLogout;
    closeAccountModal.onclick = closeAccountModalHandler;
}

export function initializeAppState() {
    refreshHistory();
    handleDifficultyChange();
    handleTimePresetChange();
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