import { elements, state, constants } from '../state.js';
import { setEncryptedStorageItem, exportDecryptedQuizJSON } from './quizCrypto.js';
import {
    showView,
    showToast,
    customConfirm,
    setupCustomizeView,
    saveQuizToDB,
    refreshHistory,
    syncHistoryWithCloud,
    closeShareModal,
    openShareModal,
    navigateToShareStep,
    formatTime,
    exportQuizAsJSON,
    setupScrollReactiveHeader,
    setHistoryVisibility,
    pushSubState,
    getActiveViewId,
    showLoadingOverlay,
    hideLoadingOverlay,
    deleteQuizPermanently,
    extractShareId,
    getQuizTakes,
    getQuizTypeLabel,
    formatQuizMetadata,
    initMetadataAutoScroll,
    updateShareLinkDisplay,
    viewToHash
} from '../helpers.js';
import { isQuizAvailableOffline, isPuterSignedIn, getOfflineDownloads } from './quizOffline.js';

const {
    historyList
} = elements;

export function exportQuiz() {
    if (state.questions.length === 0) return;
    exportQuizFromHistory({ questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig }, state.currentQuizKey);
}

export function exportQuizFromHistory(data, key) {
    try {
        const takes = key ? (getQuizTakes(key) || []) : [];
        exportDecryptedQuizJSON(data, key, takes);
        showToast('Exported!');
    } catch (e) {
        console.error('Export fail:', e);
        showToast('Export failed.', 3000, 'error');
    }
}

export async function generateShareableLink(quizKey) {
    if (!navigator.onLine) {
        showToast('Cannot generate a new share link while offline. Please connect to the internet.', 4000, 'warning');
        return;
    }
    const quiz = state.quizHistory[quizKey];
    if (!quiz) return;

    try {
        // Hide the modal immediately so it doesn't block the loader screen
        if (elements.shareModal) {
            elements.shareModal.classList.add('hidden');
        }

        showLoadingOverlay('Link Share Creation', 'Please wait, generating link...');

        // Get expiry duration from the dropdown
        const days = parseInt(elements.shareExpirySelect.value);
        const expiryTimestamp = Date.now() + (days * 24 * 60 * 60 * 1000);
        
        // Prepare payload with metadata
        const shareId = 'quiz-' + Math.random().toString(36).substring(2, 10) + '.json';
        const sharePayload = { 
            shareId: shareId,
            n: quiz.fileName, 
            c: quiz.config, 
            q: quiz.questions,
            expiryTimestamp: expiryTimestamp
        };
        
        // Save to Puter filesystem
        await puter.fs.write(shareId, JSON.stringify(sharePayload));
        
        // Generate public access URL
        const publicUrl = await puter.fs.getReadURL(shareId);
        const fullShareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(publicUrl)}`;
        
        // Attempt link shortening with graceful fallback
        let shortUrl = null;
        try {
            showLoadingOverlay('Link Share Creation', 'Creating compact short link...');
            const shortRes = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: fullShareUrl })
            });
            if (shortRes.ok) {
                const shortData = await shortRes.json();
                if (shortData && shortData.shortUrl && typeof shortData.shortUrl === 'string' && shortData.shortUrl.startsWith('http')) {
                    shortUrl = shortData.shortUrl;
                }
            }
        } catch (shortErr) {
            console.warn('[Share] Shortener request failed, falling back to full URL:', shortErr);
        }

        const activeShareUrl = shortUrl || fullShareUrl;

        // Update local state and commit persistence matrices
        quiz.share = {
            isShared: true,
            shareId: shareId,
            shareUrl: activeShareUrl,
            shortUrl: shortUrl,
            fullShareUrl: fullShareUrl,
            publicUrl: publicUrl,
            uid: extractShareId(publicUrl),
            expiryTimestamp: expiryTimestamp
        };
        // Updates individual quiz timestamp for sync tracking
        quiz.timestamp = Date.now();

        setEncryptedStorageItem(constants.DB_NAME, state.quizHistory);
        localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());
        
        // Sync history changes with Puter cloud profiles
        await syncHistoryWithCloud();
        refreshHistory();
        
        // Populate management fields for Step 2 UI view transition with short/full format support
        updateShareLinkDisplay(quiz);
        elements.shareExpiryDisplay.textContent = `Expires in ${days} days`;
        elements.shareExpiryDisplay.className = 'text-xs text-blue-300 mt-1';
        
        hideLoadingOverlay();

        // Re-reveal the share modal now that the link text is ready!
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
        navigateToShareStep('manage');
        showToast('Link generated!', 3000, 'success');
        
    } catch (err) {
        console.error('Generation Error:', err);
        hideLoadingOverlay();
        showToast('Failed to generate link.', 4000, 'error');
        // Bring back the menu if an error occurs so the user isn't stuck
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
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

    // Guard: For cloud-synced accounts, block history operations for non-downloaded quizzes while offline
    const { isQuizAvailableOffline, isPuterSignedIn } = await import('./quizOffline.js');
    if (!navigator.onLine && isPuterSignedIn() && !isQuizAvailableOffline(key).available) {
        showToast('This quiz is not available offline. Please connect to the internet or download it for offline use.', 4000, 'error');
        return;
    }

    if (action === 'history-submenu') {
        const { openHistoryActionsModal } = await import('../helpers.js');
        openHistoryActionsModal(key);
        return;
    }

    if (action === 'load') {
        if (state.savedProgress?.key === key && (state.savedProgress.shuffledIndexPos < state.savedProgress.shuffledIndices?.length || state.savedProgress.inSkippedRound)) {
            const doResume = await customConfirm(
                'Do you want to resume where you left off, or start over from the beginning?',
                'Resume Quiz',
                'Resume',
                'Start Over'
            );
            if (doResume) {
                const { resumeQuiz } = await import('./fileHandling.js');
                resumeQuiz(state.savedProgress);
                return;
            }
        }
        
        const { clearInProgressQuiz } = await import('../helpers.js');
        const { startQuiz } = await import('./quizExecution.js');
        
        clearInProgressQuiz();
        state.questions = quizData.questions;
        state.currentQuizConfig = { ...quizData.config };
        if (state.currentQuizConfig.manualReveal !== undefined) {
            if (state.currentQuizConfig.showAnswersInSummaryOnly === undefined) {
                state.currentQuizConfig.showAnswersInSummaryOnly = !!state.currentQuizConfig.manualReveal;
            }
            delete state.currentQuizConfig.manualReveal;
        }
        state.currentQuizKey = key;
        state.currentFileName = quizData.fileName;
        state.isTimedQuiz = state.currentQuizConfig.isTimed || false;
        state.totalQuizTime = state.currentQuizConfig.totalTime || 0;
        state.isAttemptLimited = state.currentQuizConfig.isAttemptLimited || false;
        state.maxAttempts = state.currentQuizConfig.maxAttempts || 3;
        elements.statusMessage.textContent = `Loaded "${state.currentFileName}".`;
        elements.statusMessage.className = 'text-center text-green-400 mt-4 text-sm h-5';
        startQuiz();
    } else if (action === 'export') {
        exportQuizFromHistory(quizData, key);
    } else if (action === 'customize') {
        state.editOriginView = getActiveViewId();
        state.customizingQuizData = { ...quizData, key, config: { ...quizData.config } };
        if (state.customizingQuizData.config.manualReveal !== undefined) {
            if (state.customizingQuizData.config.showAnswersInSummaryOnly === undefined) {
                state.customizingQuizData.config.showAnswersInSummaryOnly = !!state.customizingQuizData.config.manualReveal;
            }
            delete state.customizingQuizData.config.manualReveal;
        }
        setupCustomizeView(state.customizingQuizData.config, quizData.fileName);
        setHistoryVisibility(false);
        showView('start', false);
        pushSubState('#edit');
    } else if (action === 'share') {
        const originView = getActiveViewId();
        const originHash = window.location.hash || viewToHash(originView) || '#home';
        state.shareOriginView = originView;
        state.shareOriginHash = originHash;
        state.shareOriginScrollY = window.scrollY || document.documentElement.scrollTop || 0;
        // Store the key of the quiz we are currently interacting with
        state.currentShareQuizKey = key;
        
        // Open the share modal seamlessly for all users (JSON export is free, cloud link prompts sign-in)
        openShareModal(key);
    } else if (action === 'delete') {
        const confirmed = await customConfirm(
            'Delete this quiz from history? This action cannot be undone.',
            'Delete Quiz',
            'Delete',
            'Cancel',
            true
        );
        if (!confirmed) return;

        showLoadingOverlay('Deleting Quiz...', 'Removing quiz permanently...');
        try {
            await deleteQuizPermanently(key);
            showToast('Quiz deleted.', 3000, 'success');
        } catch (err) {
            console.error('Delete error:', err);
            showToast('Failed to delete quiz.', 3000, 'error');
        } finally {
            hideLoadingOverlay();
        }

        // Re-render fullscreen or inline history depending on current view
        if (getActiveViewId() === 'history-fullscreen') {
            showAllHistoryFullScreen(false);
        } else {
            refreshHistory();
        }
    }
}

export function showAllHistoryFullScreen(pushHash = true) {
    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    const container = elements.historyFullList || document.getElementById('history-full-list');
    if (!container) return;
    container.innerHTML = '';
    showView('history-fullscreen', pushHash);

    if (elements.historyFullscreenBackBtn) {
        if (state.historyOrigin === 'home-card') {
            elements.historyFullscreenBackBtn.classList.remove('hidden');
            elements.historyFullscreenBackBtn.classList.add('inline-flex');
        } else {
            elements.historyFullscreenBackBtn.classList.add('hidden');
            elements.historyFullscreenBackBtn.classList.remove('inline-flex');
        }
    }

    if (sorted.length === 0) {
        container.innerHTML = `
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
        setupScrollReactiveHeader('history-fullscreen');
        return;
    }

    const signedIn = isPuterSignedIn();
    const cachedDownloads = signedIn ? getOfflineDownloads() : null;

    sorted.forEach(([key, data]) => {
        const item = document.createElement('div');
        item.className = 'p-2 sm:p-3 bg-gray-700/50 rounded-lg flex justify-between items-center gap-2';
        
        // Add this fallback to prevent crashes from older quizzes
        const config = data.config || {};

        const isShared = data.share && data.share.isShared && (!data.share.expiryTimestamp || data.share.expiryTimestamp > Date.now());
        const shareIconHTML = isShared ? `
            <span class="text-blue-400 bg-blue-500/10 p-1 rounded inline-flex items-center flex-shrink-0" title="Currently sharing via link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </span>
        ` : '';

        const isAvailableOffline = signedIn ? isQuizAvailableOffline(key, cachedDownloads).available : true;
        const downloadIconHTML = isAvailableOffline ? `
            <span class="text-cyan-400 bg-cyan-500/10 p-1 rounded inline-flex items-center flex-shrink-0" title="${signedIn ? 'Available offline (Downloaded)' : 'Stored locally on this device (Available offline)'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </span>
        ` : '';

        const titleHtml = `
            <div class="flex items-center gap-2 min-w-0 mb-1 w-full">
                <p class="font-semibold text-sm truncate min-w-0" title="${data.fileName || 'Untitled'}">
                    ${data.fileName || 'Untitled'}
                </p>
                ${downloadIconHTML}
                ${shareIconHTML}
            </div>
        `;

        item.innerHTML = `
            <div class="flex-grow min-w-0 mr-4 overflow-hidden">
                ${titleHtml}
                <div class="quiz-metadata-scroll-wrapper relative overflow-hidden text-xs text-gray-400">
                    <div class="quiz-metadata-track flex items-center">
                        <span class="quiz-metadata-content whitespace-nowrap">${formatQuizMetadata(config, data.questions)}</span>
                    </div>
                </div>
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

        container.appendChild(item);
    });

    initMetadataAutoScroll(container);

    // Attach click handler for delegated actions inside full-list
    container.onclick = handleHistoryClick;

    setupScrollReactiveHeader('history-fullscreen');
}
