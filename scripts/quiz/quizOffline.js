import { elements, state, constants } from '../state.js';
import { getEncryptedStorageItem, setEncryptedStorageItem } from './quizCrypto.js';
import {
    showView,
    showToast,
    customConfirm,
    formatTime,
    getQuizTakes,
    setupScrollReactiveHeader,
    pushSubState,
    clearSubState,
    closeModalWithAnimation,
    getQuizTypeLabel,
    getActiveViewId
} from '../helpers.js';
import { handleHistoryClick } from './quizHistory.js';

/**
 * Checks if the current user is authenticated with a Puter account.
 * @returns {boolean}
 */
export function isPuterSignedIn() {
    return typeof puter !== 'undefined' && !!window.puter?.auth?.isSignedIn?.();
}

/**
 * Retrieves the offline downloads registry from localStorage.
 * @returns {Record<string, { quizKey: string, fileName: string, downloadedAt: number, expiresAt: number, sizeBytes: number, isManual: boolean, isOptedOut?: boolean }>}
 */
export function getOfflineDownloads() {
    try {
        const dbKey = constants.OFFLINE_DOWNLOADS_DB_KEY || 'nodal_offline_downloads_v1';
        return getEncryptedStorageItem(dbKey, {});
    } catch (e) {
        console.error('[QuizOffline] Failed to parse offline downloads:', e);
        return {};
    }
}

/**
 * Persists the offline downloads registry to localStorage.
 * @param {Record<string, any>} downloads
 */
export function saveOfflineDownloads(downloads) {
    try {
        const dbKey = constants.OFFLINE_DOWNLOADS_DB_KEY || 'nodal_offline_downloads_v1';
        setEncryptedStorageItem(dbKey, downloads);
    } catch (e) {
        console.error('[QuizOffline] Failed to save offline downloads:', e);
    }
}

/**
 * Formats a byte number to a human-readable KB or MB string.
 * @param {number} bytes
 * @returns {string}
 */
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
 * Calculates the exact storage consumption in bytes for a quiz and its statistics takes.
 * @param {string} quizKey
 * @param {Array|Record<string, Array>} [cachedTakes=null] - Optional pre-fetched takes array or takes database to prevent redundant decryptions
 * @returns {{ totalBytes: number, quizBytes: number, takesBytes: number, totalFormatted: string, quizFormatted: string, takesFormatted: string }}
 */
export function calculateQuizStorageBytes(quizKey, cachedTakes = null) {
    const quiz = (state.quizHistory && state.quizHistory[quizKey]) || {};
    const takes = cachedTakes !== null
        ? (Array.isArray(cachedTakes) ? cachedTakes : (cachedTakes[quizKey] || []))
        : (getQuizTakes(quizKey) || []);

    const quizStr = JSON.stringify(quiz);
    const takesStr = JSON.stringify(takes);

    const encoder = new TextEncoder();
    const quizBytes = encoder.encode(quizStr).length;
    const takesBytes = encoder.encode(takesStr).length;
    const totalBytes = quizBytes + takesBytes;

    return {
        totalBytes,
        quizBytes,
        takesBytes,
        totalFormatted: formatBytes(totalBytes),
        quizFormatted: formatBytes(quizBytes),
        takesFormatted: formatBytes(takesBytes)
    };
}

/**
 * Formats remaining milliseconds into human-readable duration (e.g., '6 days', '14 hours').
 * @param {number} ms
 * @returns {string}
 */
export function formatTimeLeft(ms) {
    if (ms <= 0) return 'Expired';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 1) {
        return `${days} days`;
    } else if (days === 1) {
        return hours > 0 ? `1 day ${hours}h` : '1 day';
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${Math.max(1, minutes)}m`;
    }
}

/**
 * Checks whether a quiz is available for offline usage based on the 1-week retention policy.
 * - Manual download active (expires 7 days from download)
 * - Auto-offline active (created/imported < 7 days ago and not opted out)
 * @param {string} quizKey
 * @param {Record<string, any>} [cachedDownloads=null] - Optional pre-fetched downloads registry to prevent repeated decryptions
 * @returns {{ available: boolean, isManual?: boolean, isAuto?: boolean, expiresAt?: number, downloadedAt?: number, remainingMs?: number, formattedTimeLeft?: string, sizeBytes?: number }}
 */
export function isQuizAvailableOffline(quizKey, cachedDownloads = null) {
    if (!quizKey || !isPuterSignedIn()) return { available: false, remainingMs: 0 };

    const downloads = cachedDownloads || getOfflineDownloads();
    const record = downloads[quizKey];
    const now = Date.now();

    // Explicit opt-out flag (user manually clicked remove on an auto-offline quiz)
    if (record && record.isOptedOut) {
        return { available: false, remainingMs: 0 };
    }

    // 1. Check if active manual download exists
    if (record && record.expiresAt && record.expiresAt > now && !record.isOptedOut) {
        const remainingMs = record.expiresAt - now;
        return {
            available: true,
            isManual: true,
            isAuto: false,
            expiresAt: record.expiresAt,
            downloadedAt: record.downloadedAt,
            remainingMs,
            formattedTimeLeft: formatTimeLeft(remainingMs),
            sizeBytes: record.sizeBytes || 0
        };
    }

    // 2. Check 1-week auto-offline window (< 7 days from creation/import)
    const quiz = state.quizHistory && state.quizHistory[quizKey];
    if (quiz && quiz.timestamp) {
        const expiryMs = constants.OFFLINE_EXPIRATION_MS || (7 * 24 * 60 * 60 * 1000);
        const autoExpiresAt = quiz.timestamp + expiryMs;
        if (autoExpiresAt > now) {
            const remainingMs = autoExpiresAt - now;
            return {
                available: true,
                isManual: false,
                isAuto: true,
                expiresAt: autoExpiresAt,
                downloadedAt: quiz.timestamp,
                remainingMs,
                formattedTimeLeft: formatTimeLeft(remainingMs),
                sizeBytes: record?.sizeBytes || 0
            };
        }
    }

    return { available: false, remainingMs: 0 };
}

/**
 * Prunes expired offline downloads according to the 1-week retention rule.
 * @returns {string[]} List of quiz keys whose offline access has expired
 */
export function pruneExpiredOfflineDownloads() {
    const downloads = getOfflineDownloads();
    const now = Date.now();
    let modified = false;
    const expiredKeys = [];

    for (const [key, record] of Object.entries(downloads)) {
        if (record.expiresAt && record.expiresAt <= now) {
            delete downloads[key];
            expiredKeys.push(key);
            modified = true;
        }
    }

    if (modified) {
        saveOfflineDownloads(downloads);
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
                type: 'PRUNE_EXPIRED_QUIZZES',
                expiredKeys
            });
        }
    }

    return expiredKeys;
}

/**
 * Downloads a quiz and its statistics for 1 week of offline use.
 * @param {string} quizKey
 * @param {(progress: number) => void} [onProgress]
 * @returns {Promise<{ quizKey: string, expiresAt: number, sizeBytes: number }>}
 */
export async function downloadQuizForOffline(quizKey, onProgress) {
    if (!isPuterSignedIn()) {
        showToast('Offline downloading is not available when signed out. Your quizzes are already stored locally.', 4000, 'info');
        throw new Error('Offline downloading is disabled for signed-out accounts.');
    }

    const quiz = state.quizHistory && state.quizHistory[quizKey];
    if (!quiz) throw new Error('Quiz not found in history');

    const takes = getQuizTakes(quizKey) || [];
    const storageInfo = calculateQuizStorageBytes(quizKey);

    // Simulate progress steps
    const setProg = (p) => {
        if (onProgress) onProgress(p);
        if (elements.offlineModalProgressBar) {
            elements.offlineModalProgressBar.style.width = `${p}%`;
        }
    };

    setProg(15);
    await new Promise((r) => setTimeout(r, 120));
    setProg(55);
    await new Promise((r) => setTimeout(r, 150));
    setProg(90);
    await new Promise((r) => setTimeout(r, 100));

    const now = Date.now();
    const expiryMs = constants.OFFLINE_EXPIRATION_MS || (7 * 24 * 60 * 60 * 1000);
    const expiresAt = now + expiryMs;

    const record = {
        quizKey,
        fileName: quiz.fileName || 'Untitled Quiz',
        downloadedAt: now,
        expiresAt,
        sizeBytes: storageInfo.totalBytes,
        isManual: true,
        isOptedOut: false
    };

    const downloads = getOfflineDownloads();
    downloads[quizKey] = record;
    saveOfflineDownloads(downloads);

    // Send payload to Service Worker for dedicated offline caching
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'CACHE_OFFLINE_QUIZ',
            quizKey,
            quizData: quiz,
            takesData: takes,
            expiresAt
        });
    }

    setProg(100);
    await new Promise((r) => setTimeout(r, 100));

    return record;
}

/**
 * Removes a quiz and its cached statistics from offline storage.
 * @param {string} quizKey
 */
export async function removeQuizFromOffline(quizKey) {
    const downloads = getOfflineDownloads();
    // Mark opted-out so auto 7-day window doesn't immediately bring it back
    downloads[quizKey] = {
        quizKey,
        isOptedOut: true,
        expiresAt: 0
    };
    saveOfflineDownloads(downloads);

    // Notify Service Worker to purge synthetic offline responses
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'REMOVE_OFFLINE_QUIZ',
            quizKey
        });
    }
}

/**
 * Renews the 1-week offline timer for an already downloaded quiz.
 * @param {string} quizKey
 * @returns {Promise<{ quizKey: string, expiresAt: number }>}
 */
export async function renewQuizOfflineAccess(quizKey) {
    if (!isPuterSignedIn()) {
        showToast('Offline downloading is not available when signed out. Your quizzes are already stored locally.', 4000, 'info');
        throw new Error('Offline downloading is disabled for signed-out accounts.');
    }
    return downloadQuizForOffline(quizKey);
}

/**
 * Compiles the active offline downloads registry for migration/export.
 * Ensures all quizzes currently available offline (both manual downloads and auto-offline retention)
 * are accurately counted and formatted for export bundles.
 * @returns {Record<string, { quizKey: string, fileName: string, downloadedAt: number, expiresAt: number, sizeBytes: number, isManual: boolean, isOptedOut: boolean }>}
 */
export function getExportableOfflineDownloads() {
    let quizDb = state.quizHistory;
    if (!quizDb || Object.keys(quizDb).length === 0) {
        try {
            quizDb = getEncryptedStorageItem(constants.DB_NAME, {});
        } catch (e) {}
    }
    quizDb = quizDb || {};

    const rawDownloads = getOfflineDownloads();
    const activeDownloads = {};
    const now = Date.now();
    const expiryMs = constants.OFFLINE_EXPIRATION_MS || (7 * 24 * 60 * 60 * 1000);

    // 1. Include all explicitly registered downloads that are active and not opted out
    for (const [key, record] of Object.entries(rawDownloads)) {
        if (record && !record.isOptedOut && record.expiresAt && record.expiresAt > now) {
            activeDownloads[key] = record;
        }
    }

    // 2. Include all quizzes in history that are currently available offline
    for (const [key, quiz] of Object.entries(quizDb)) {
        const offlineInfo = isQuizAvailableOffline(key);
        if (offlineInfo.available && !activeDownloads[key]) {
            const storage = calculateQuizStorageBytes(key);
            activeDownloads[key] = {
                quizKey: key,
                fileName: quiz.fileName || 'Untitled Quiz',
                downloadedAt: offlineInfo.downloadedAt || quiz.timestamp || now,
                expiresAt: offlineInfo.expiresAt || ((quiz.timestamp || now) + expiryMs),
                sizeBytes: storage.totalBytes,
                isManual: !!offlineInfo.isManual,
                isOptedOut: false
            };
        }
    }

    return activeDownloads;
}

/**
 * Opens the Offline Download & Management Modal for a quiz.
 * @param {string} quizKey
 */
export function openOfflineModal(quizKey, pushHash = true) {
    if (!quizKey || !elements.offlineModal) return;

    if (!isPuterSignedIn()) {
        showToast('Offline downloads are only needed for cloud-synced Puter accounts. Your quizzes are already stored on this device.', 4500, 'info');
        return;
    }

    state.activeOfflineModalKey = quizKey;
    state.lastHistoryMenuKey = quizKey;
    const quiz = (state.quizHistory && state.quizHistory[quizKey]) || {};
    const title = quiz.fileName || 'Quiz Details';

    if (elements.offlineModalQuizTitle) {
        elements.offlineModalQuizTitle.textContent = title;
    }

    const storage = calculateQuizStorageBytes(quizKey);
    if (elements.offlineModalStorageSize) {
        elements.offlineModalStorageSize.textContent = `${storage.totalFormatted} (Quiz: ${storage.quizFormatted}, Stats: ${storage.takesFormatted})`;
    }

    // Reset progress container
    if (elements.offlineModalProgressContainer) {
        elements.offlineModalProgressContainer.classList.add('hidden');
    }
    if (elements.offlineModalProgressBar) {
        elements.offlineModalProgressBar.style.width = '0%';
    }

    refreshOfflineModalContent(quizKey);

    elements.offlineModal.classList.remove('hidden');
    if (pushHash) {
        pushSubState('#offline-modal', { quizKey, view: getActiveViewId() });
    } else {
        state.activeSubState = '#offline-modal';
        state.authorizedSubStates = state.authorizedSubStates || new Set();
        state.authorizedSubStates.add('#offline-modal');
    }
}

/**
 * Updates the modal UI based on whether the quiz is currently available offline.
 * @param {string} quizKey
 */
export function refreshOfflineModalContent(quizKey) {
    const status = isQuizAvailableOffline(quizKey);

    if (elements.offlineModalStatusBadge) {
        if (status.available) {
            elements.offlineModalStatusBadge.textContent = 'Available Offline';
            elements.offlineModalStatusBadge.className = 'px-2.5 py-0.5 rounded-full font-semibold text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
        } else {
            elements.offlineModalStatusBadge.textContent = 'Not Downloaded';
            elements.offlineModalStatusBadge.className = 'px-2.5 py-0.5 rounded-full font-semibold text-xs bg-gray-700/60 text-gray-400 border border-gray-600/40';
        }
    }

    if (elements.offlineModalExpiry) {
        if (status.available && status.expiresAt) {
            const expDate = new Date(status.expiresAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            elements.offlineModalExpiry.textContent = `${expDate} (${status.formattedTimeLeft} remaining)`;
            elements.offlineModalExpiry.className = 'font-medium text-emerald-400';
        } else {
            elements.offlineModalExpiry.textContent = '7 days from download';
            elements.offlineModalExpiry.className = 'font-medium text-amber-300';
        }
    }

    // Configure buttons:
    // If available: download button is replaced by "Delete from Offline Downloads" (and "Renew for 1 Week")
    // If not available: download button is displayed ("Download for Offline Use"), and Renew & Delete buttons are hidden.
    if (status.available) {
        if (elements.offlineModalDownloadBtn) {
            elements.offlineModalDownloadBtn.classList.add('hidden');
        }
        if (elements.offlineModalRenewBtn) {
            elements.offlineModalRenewBtn.classList.remove('hidden');
            elements.offlineModalRenewBtn.textContent = 'Renew for 1 Week';
        }
        if (elements.offlineModalRemoveBtn) {
            elements.offlineModalRemoveBtn.classList.remove('hidden');
            elements.offlineModalRemoveBtn.textContent = 'Delete from Offline Downloads';
        }
    } else {
        if (elements.offlineModalDownloadBtn) {
            elements.offlineModalDownloadBtn.classList.remove('hidden');
            elements.offlineModalDownloadBtn.textContent = 'Download for Offline Use';
            elements.offlineModalDownloadBtn.className = 'w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold rounded-xl text-center text-sm transition-colors cursor-pointer shadow-md';
        }
        if (elements.offlineModalRenewBtn) {
            elements.offlineModalRenewBtn.classList.add('hidden');
        }
        if (elements.offlineModalRemoveBtn) {
            elements.offlineModalRemoveBtn.classList.add('hidden');
        }
    }
}

/**
 * Closes the Offline Download Modal.
 * @param {boolean} isFromPopState
 * @param {boolean} popHistory
 */
export function closeOfflineModal(isFromPopState = false, popHistory = true) {
    if (!elements.offlineModal || elements.offlineModal.classList.contains('hidden')) return;

    clearSubState('#offline-modal');

    closeModalWithAnimation(elements.offlineModal, () => {
        if (popHistory && !isFromPopState && window.location.hash === '#offline-modal') {
            window.history.back();
        }
        state.activeOfflineModalKey = null;
    });
}

/**
 * Dynamically updates the Offline button inside the Options modal (#history-actions-modal).
 * @param {string} quizKey
 */
export function updateHistorySubmenuOfflineButton(quizKey) {
    if (!elements.historySubmenuOfflineBtn) return;

    // If not signed in to Puter, hide the offline button completely (all quizzes are stored locally)
    if (!isPuterSignedIn()) {
        elements.historySubmenuOfflineBtn.classList.add('hidden');
        return;
    }

    elements.historySubmenuOfflineBtn.classList.remove('hidden');

    const status = isQuizAvailableOffline(quizKey);

    if (status.available) {
        if (elements.historySubmenuOfflineText) {
            elements.historySubmenuOfflineText.textContent = 'Offline Download Status';
            elements.historySubmenuOfflineText.className = 'block text-sm font-semibold text-emerald-200';
        }
        if (elements.historySubmenuOfflineSubtext) {
            elements.historySubmenuOfflineSubtext.textContent = `Expires in ${status.formattedTimeLeft} • Tap to manage or delete`;
            elements.historySubmenuOfflineSubtext.className = 'block text-xs text-emerald-300/70';
        }
        if (elements.historySubmenuOfflineIconContainer) {
            elements.historySubmenuOfflineIconContainer.className = 'p-2.5 bg-emerald-500/20 text-emerald-400 rounded-lg flex-shrink-0';
            elements.historySubmenuOfflineIconContainer.innerHTML = `
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
            `;
        }
        elements.historySubmenuOfflineBtn.className = 'w-full flex items-center gap-3.5 p-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/50 text-left transition-colors cursor-pointer';
    } else {
        if (elements.historySubmenuOfflineText) {
            elements.historySubmenuOfflineText.textContent = 'Download for Offline Use';
            elements.historySubmenuOfflineText.className = 'block text-sm font-semibold text-cyan-200';
        }
        if (elements.historySubmenuOfflineSubtext) {
            elements.historySubmenuOfflineSubtext.textContent = 'Download quiz & stats for 1 week offline use';
            elements.historySubmenuOfflineSubtext.className = 'block text-xs text-cyan-300/70';
        }
        if (elements.historySubmenuOfflineIconContainer) {
            elements.historySubmenuOfflineIconContainer.className = 'p-2.5 bg-cyan-500/20 text-cyan-400 rounded-lg flex-shrink-0';
            elements.historySubmenuOfflineIconContainer.innerHTML = `
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            `;
        }
        elements.historySubmenuOfflineBtn.className = 'w-full flex items-center gap-3.5 p-3 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/50 text-left transition-colors cursor-pointer';
    }
}

/**
 * Updates the Offline status bar inside the Quiz Statistics view.
 * @param {string} quizKey
 */
export function updateStatisticsOfflineBar(quizKey) {
    if (!elements.statisticsOfflineBar) return;

    // If not signed in to Puter, hide the offline bar completely (all quizzes are stored locally)
    if (!isPuterSignedIn()) {
        elements.statisticsOfflineBar.classList.add('hidden');
        return;
    }

    elements.statisticsOfflineBar.classList.remove('hidden');

    const status = isQuizAvailableOffline(quizKey);

    if (elements.statisticsOfflineStatusText) {
        elements.statisticsOfflineStatusText.textContent = status.available ? 'Available Offline' : 'Not Available Offline';
        elements.statisticsOfflineStatusText.className = status.available ? 'text-emerald-300 font-semibold block truncate' : 'text-gray-300 font-medium block truncate';
    }

    if (elements.statisticsOfflineSubtext) {
        if (status.available) {
            elements.statisticsOfflineSubtext.textContent = `Expires in ${status.formattedTimeLeft} • Saved with statistics`;
            elements.statisticsOfflineSubtext.className = 'text-emerald-400/80 text-[11px] block truncate';
        } else {
            elements.statisticsOfflineSubtext.textContent = 'Download quiz & retakes to practice without internet';
            elements.statisticsOfflineSubtext.className = 'text-gray-400 text-[11px] block truncate';
        }
    }

    if (elements.statisticsOfflineManageBtn) {
        elements.statisticsOfflineManageBtn.textContent = status.available ? 'Manage Offline' : 'Make Offline';
        elements.statisticsOfflineManageBtn.className = status.available
            ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 transition-colors cursor-pointer flex-shrink-0'
            : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 border border-cyan-500/40 transition-colors cursor-pointer flex-shrink-0';
    }
}

/**
 * Reveals the lazy skeleton placeholder while downloads data is processing.
 */
export function showDownloadsSkeleton() {
    const skeleton = elements.downloadsSkeleton || document.getElementById('downloads-skeleton');
    const list = elements.downloadsList || document.getElementById('downloads-list');
    if (skeleton) skeleton.classList.remove('hidden');
    if (list) list.classList.add('hidden');
}

/**
 * Hides the lazy skeleton placeholder and reveals the populated downloads container.
 */
export function hideDownloadsSkeleton() {
    const skeleton = elements.downloadsSkeleton || document.getElementById('downloads-skeleton');
    const list = elements.downloadsList || document.getElementById('downloads-list');
    if (skeleton) skeleton.classList.add('hidden');
    if (list) list.classList.remove('hidden');
}

/**
 * Renders the full Downloads page (#downloads-view) with active offline quizzes.
 * @param {boolean} pushHash - Whether to push the #downloads hash to browser history
 */
export function renderDownloadsView(pushHash = true) {
    const container = elements.downloadsList || document.getElementById('downloads-list');
    if (!container) return;

    pruneExpiredOfflineDownloads();
    showView('downloads', pushHash);

    const retentionInfo = document.getElementById('downloads-retention-info');

    // Signed-Out State: Display Local Device Mode Notice
    if (!isPuterSignedIn()) {
        hideDownloadsSkeleton();
        if (retentionInfo) {
            retentionInfo.classList.add('hidden');
        }

        if (elements.downloadsStorageBadge) {
            elements.downloadsStorageBadge.textContent = 'Local Storage Active';
            elements.downloadsStorageBadge.className = 'text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 justify-self-end whitespace-nowrap';
        }

        container.innerHTML = `
            <div class="bg-gray-800/90 border border-gray-700/80 rounded-2xl p-6 sm:p-8 text-center max-w-xl mx-auto space-y-5 shadow-xl">
                <div class="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-950/40">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                    </svg>
                </div>
                <div class="space-y-2">
                    <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>Signed Out • Local Device Mode</span>
                    </div>
                    <h3 class="text-xl sm:text-2xl font-bold text-white tracking-tight">Offline Downloads Not Needed</h3>
                    <p class="text-sm text-gray-300 leading-relaxed max-w-md mx-auto">
                        While signed out, all your quizzes, questions, and statistics are stored directly on this device and are <strong>always accessible offline</strong> without needing to be downloaded.
                    </p>
                    <p class="text-xs text-gray-400 leading-relaxed max-w-md mx-auto pt-1">
                        Offline downloading is exclusively used by cloud-synced Puter accounts to selectively cache remote library quizzes for offline practice.
                    </p>
                </div>
                <div class="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                    <button id="downloads-goto-history-btn" class="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors shadow-md flex items-center justify-center gap-2 cursor-pointer">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>View All Quizzes in History</span>
                    </button>
                    <button id="downloads-signin-puter-btn" class="w-full sm:w-auto px-5 py-2.5 bg-gray-700/80 hover:bg-gray-700 text-gray-200 text-sm font-semibold rounded-xl border border-gray-600 transition-colors flex items-center justify-center gap-2 cursor-pointer">
                        <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"></path></svg>
                        <span>Sign In with Puter</span>
                    </button>
                </div>
            </div>
        `;

        const gotoHistoryBtn = document.getElementById('downloads-goto-history-btn');
        if (gotoHistoryBtn) {
            gotoHistoryBtn.onclick = () => {
                showView('history-fullscreen');
            };
        }

        const signinPuterBtn = document.getElementById('downloads-signin-puter-btn');
        if (signinPuterBtn) {
            signinPuterBtn.onclick = async () => {
                const { loginToPuter } = await import('../helpers.js');
                loginToPuter();
            };
        }

        setupScrollReactiveHeader('downloads');
        return;
    }

    // Signed-In State: Reveal 1-week retention notice and render downloads list
    if (retentionInfo) {
        retentionInfo.classList.remove('hidden');
    }

    const cachedDownloads = getOfflineDownloads();
    const cachedTakesDb = getQuizTakes() || {};
    const db = state.quizHistory || {};
    const offlineQuizzes = [];
    let totalBytesAll = 0;

    for (const [key, quiz] of Object.entries(db)) {
        const offlineInfo = isQuizAvailableOffline(key, cachedDownloads);
        if (offlineInfo.available) {
            const storage = calculateQuizStorageBytes(key, cachedTakesDb[key] || []);
            totalBytesAll += storage.totalBytes;
            offlineQuizzes.push({
                key,
                quiz,
                offlineInfo,
                storage
            });
        }
    }

    // Update storage badge in header
    if (elements.downloadsStorageBadge) {
        elements.downloadsStorageBadge.textContent = formatBytes(totalBytesAll);
        elements.downloadsStorageBadge.className = 'text-xs font-semibold px-2 sm:px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 justify-self-end whitespace-nowrap';
    }

    // Sort by expiration ascending (expiring soonest on top)
    offlineQuizzes.sort((a, b) => (a.offlineInfo.expiresAt || 0) - (b.offlineInfo.expiresAt || 0));

    container.innerHTML = '';

    if (offlineQuizzes.length === 0) {
        hideDownloadsSkeleton();
        container.innerHTML = `
            <div class="text-center py-12 px-4 space-y-3">
                <div class="p-3 bg-cyan-500/10 text-cyan-400 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                    <svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </div>
                <h3 class="text-base font-bold text-gray-200">No Offline Downloads</h3>
                <p class="text-xs text-gray-400 max-w-sm mx-auto">You don't have any quizzes saved for offline use yet. In History, open Quiz Options on any quiz and tap "Make Available Offline" to access it without an internet connection.</p>
            </div>
        `;
        setupScrollReactiveHeader('downloads');
        return;
    }

    offlineQuizzes.forEach(({ key, quiz, offlineInfo, storage }) => {
        const item = document.createElement('div');
        item.className = 'offline-card-item p-3 sm:p-4 bg-gray-700/50 rounded-xl flex justify-between items-center gap-2 border border-gray-600/50';

        const config = quiz.config || {};
        const tInfo = formatTime(config.totalTime);
        const typeLabel = getQuizTypeLabel(config, quiz.questions);
        const diffName = config.difficulty || (config.customType === 'mixed' ? 'custom' : 'easy');
        const diffTxt = `(${diffName})`;

        const remainingMs = offlineInfo.remainingMs || 0;
        const daysLeft = Math.floor(remainingMs / (24 * 60 * 60 * 1000));
        let badgeClass = 'expiry-badge-fresh';
        if (daysLeft < 1) {
            badgeClass = 'expiry-badge-critical';
        } else if (daysLeft <= 3) {
            badgeClass = 'expiry-badge-warning';
        }

        const expiryBadgeHTML = `
            <span class="expiry-badge ${badgeClass}" title="Expires in ${offlineInfo.formattedTimeLeft}">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                <span>Expires in ${offlineInfo.formattedTimeLeft}</span>
            </span>
        `;

        const titleHtml = `
            <div class="offline-header-row mb-1">
                <p class="offline-quiz-title font-semibold text-sm truncate min-w-0 text-white flex-shrink" title="${quiz.fileName || 'Untitled'}">
                    ${quiz.fileName || 'Untitled'}
                </p>
                <div class="offline-chips-group">
                    ${expiryBadgeHTML}
                    <span class="offline-pill" title="Total offline storage: Quiz + statistics">
                        ${storage.totalFormatted}
                    </span>
                </div>
            </div>
        `;

        item.innerHTML = `
            <div class="flex-grow min-w-0 mr-4 overflow-hidden offline-card-content flex flex-col justify-center">
                ${titleHtml}
                <p class="offline-meta-row text-xs text-gray-400 truncate">${config.count || 0} Qs (${typeLabel}) ${diffTxt} ${tInfo} • Saved with statistics</p>
            </div>
            <!-- Mobile 2-button layout: Stacked Load on top, Option button with text below -->
            <div class="flex flex-col md:hidden flex-shrink-0 gap-1.5 items-stretch min-w-[70px]">
                <button class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-1.5 px-2.5 rounded inline-flex items-center justify-center gap-1 transition-colors cursor-pointer w-full" data-key="${key}" data-action="load" title="Load Quiz">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
                    <span>Load</span>
                </button>
                <button class="bg-gray-700/90 hover:bg-gray-700 text-gray-200 text-xs font-semibold py-1 px-2 rounded inline-flex items-center justify-center gap-1 border border-gray-600/60 transition-colors cursor-pointer w-full" data-key="${key}" data-action="history-submenu" title="Quiz Options" aria-label="Quiz Options">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2"/>
                        <circle cx="12" cy="12" r="2"/>
                        <circle cx="12" cy="19" r="2"/>
                    </svg>
                    <span>Option</span>
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

    hideDownloadsSkeleton();
    container.onclick = handleHistoryClick;
    setupScrollReactiveHeader('downloads');
    setupDownloadsResizeObserver(container);
    requestAnimationFrame(() => {
        checkOfflineChipsFit();
    });
}

let downloadsResizeObserver = null;
let lastContainerWidth = 0;

/**
 * Checks whether any card in the offline downloads table cannot fit its title and chips on row 1.
 * If ANY card overflows, the entire table shifts chips to row 2 and quiz info to row 3 in unity.
 */
export function checkOfflineChipsFit() {
    const container = elements.downloadsList || document.getElementById('downloads-list');
    if (!container) return;

    const cards = container.querySelectorAll('.offline-card-item');
    if (cards.length === 0) {
        container.classList.remove('table-chips-stacked');
        return;
    }

    let shouldStack = false;

    for (const card of cards) {
        const content = card.querySelector('.offline-card-content');
        const title = card.querySelector('.offline-quiz-title');
        const chips = card.querySelector('.offline-chips-group');

        if (!content || !title || !chips) continue;

        const availableWidth = content.clientWidth;
        if (availableWidth <= 0) continue;

        const titleWidth = title.scrollWidth;
        const chipsWidth = chips.offsetWidth;
        const gap = 8;
        const marginBuffer = 6;

        if ((titleWidth + chipsWidth + gap + marginBuffer) > availableWidth) {
            shouldStack = true;
            break;
        }
    }

    const currentlyStacked = container.classList.contains('table-chips-stacked');
    if (shouldStack !== currentlyStacked) {
        container.classList.toggle('table-chips-stacked', shouldStack);
    }
}

function setupDownloadsResizeObserver(container) {
    if (downloadsResizeObserver) {
        downloadsResizeObserver.disconnect();
    }
    if (typeof ResizeObserver !== 'undefined') {
        downloadsResizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const width = entry.contentRect.width;
                if (Math.abs(width - lastContainerWidth) > 1) {
                    lastContainerWidth = width;
                    checkOfflineChipsFit();
                }
            }
        });
        downloadsResizeObserver.observe(container);
    } else {
        window.addEventListener('resize', checkOfflineChipsFit, { passive: true });
    }
}

/**
 * Initializes all event listeners for offline modal buttons and manage triggers.
 */
export function initQuizOfflineListeners() {
    // 1. Modal Close Button
    if (elements.offlineModalCloseBtn) {
        elements.offlineModalCloseBtn.addEventListener('click', () => closeOfflineModal(false));
    }

    // 2. Download / Action Button in Modal
    if (elements.offlineModalDownloadBtn) {
        elements.offlineModalDownloadBtn.addEventListener('click', async () => {
            const key = state.activeOfflineModalKey;
            if (!key) return;

            const status = isQuizAvailableOffline(key);

            // If already downloaded: prompt with confirmation modal to remove from offline
            if (status.available) {
                const confirmed = await customConfirm(
                    'Remove this quiz and its statistics from offline use? It will no longer be accessible without an active internet connection.',
                    'Remove Offline Access',
                    'Remove',
                    'Keep Offline',
                    true
                );
                if (!confirmed) return;

                await removeQuizFromOffline(key);
                showToast('Removed from offline downloads.', 3000, 'info');
                refreshOfflineModalContent(key);
                updateHistorySubmenuOfflineButton(key);
                updateStatisticsOfflineBar(key);

                if (elements.views.downloads && elements.views.downloads.classList.contains('active')) {
                    renderDownloadsView(false);
                }
                return;
            }

            // Otherwise, perform the download
            try {
                if (elements.offlineModalProgressContainer) {
                    elements.offlineModalProgressContainer.classList.remove('hidden');
                }
                elements.offlineModalDownloadBtn.disabled = true;
                await downloadQuizForOffline(key);
                showToast('Quiz & statistics saved offline for 1 week!', 3000, 'success');
                refreshOfflineModalContent(key);
                updateHistorySubmenuOfflineButton(key);
                updateStatisticsOfflineBar(key);

                if (elements.views.downloads && elements.views.downloads.classList.contains('active')) {
                    renderDownloadsView(false);
                }
            } catch (err) {
                console.error('[QuizOffline] Download failed:', err);
                showToast('Failed to save quiz offline.', 3000, 'error');
            } finally {
                elements.offlineModalDownloadBtn.disabled = false;
                if (elements.offlineModalProgressContainer) {
                    elements.offlineModalProgressContainer.classList.add('hidden');
                }
            }
        });
    }

    // 3. Renew Button in Modal (+7 Days)
    if (elements.offlineModalRenewBtn) {
        elements.offlineModalRenewBtn.addEventListener('click', async () => {
            const key = state.activeOfflineModalKey;
            if (!key) return;

            try {
                if (elements.offlineModalProgressContainer) {
                    elements.offlineModalProgressContainer.classList.remove('hidden');
                }
                elements.offlineModalRenewBtn.disabled = true;
                await renewQuizOfflineAccess(key);
                showToast('Offline access renewed for 1 week!', 3000, 'success');
                refreshOfflineModalContent(key);
                updateHistorySubmenuOfflineButton(key);
                updateStatisticsOfflineBar(key);

                if (elements.views.downloads && elements.views.downloads.classList.contains('active')) {
                    renderDownloadsView(false);
                }
            } catch (err) {
                console.error('[QuizOffline] Renew failed:', err);
                showToast('Failed to renew offline access.', 3000, 'error');
            } finally {
                elements.offlineModalRenewBtn.disabled = false;
                if (elements.offlineModalProgressContainer) {
                    elements.offlineModalProgressContainer.classList.add('hidden');
                }
            }
        });
    }

    // 4. Remove Button in Modal (with customConfirm)
    if (elements.offlineModalRemoveBtn) {
        elements.offlineModalRemoveBtn.addEventListener('click', async () => {
            const key = state.activeOfflineModalKey;
            if (!key) return;

            const confirmed = await customConfirm(
                'Remove this quiz and its statistics from offline use? It will no longer be accessible without an active internet connection.',
                'Remove Offline Access',
                'Remove',
                'Keep Offline',
                true
            );
            if (!confirmed) return;

            await removeQuizFromOffline(key);
            showToast('Quiz and statistics removed from offline storage.', 3000, 'info');
            refreshOfflineModalContent(key);
            updateHistorySubmenuOfflineButton(key);
            updateStatisticsOfflineBar(key);

            if (elements.views.downloads && elements.views.downloads.classList.contains('active')) {
                renderDownloadsView(false);
            }
        });
    }

    // 5. Statistics Offline Manage Button
    if (elements.statisticsOfflineManageBtn) {
        elements.statisticsOfflineManageBtn.addEventListener('click', () => {
            if (state.currentStatsQuizKey) {
                openOfflineModal(state.currentStatsQuizKey);
            }
        });
    }
}
