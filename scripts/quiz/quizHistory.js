import { elements, state, constants } from '../state.js';
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
    exportQuizAsJSON
} from '../helpers.js';

const {
    historyList
} = elements;

export function exportQuiz() {
    if (state.questions.length === 0) return;
    exportQuizFromHistory({ questions: state.questions, fileName: state.currentFileName, config: state.currentQuizConfig }, state.currentQuizKey);
}

export function exportQuizFromHistory(data, key) {
    try {
        const exportPayload = {
            quizId: key || CryptoJS.SHA256(JSON.stringify(data.questions) + JSON.stringify(data.config) + data.fileName).toString(),
            fileName: data.fileName,
            config: data.config,
            questions: data.questions
        };
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const name = (data.fileName || 'quiz').replace(/\.[^/.]+$/, '');
        link.download = `quiz-${name}.json`;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Exported!');
    } catch (e) {
        console.error('Export fail:', e);
        showToast('Export failed.', 3000, 'error');
    }
}

export async function generateShareableLink(quizKey) {
    const quiz = state.quizHistory[quizKey];
    if (!quiz) return;

    // Cache original loading template messages so we can restore them later
    const originalTitle = elements.loadingTitle ? elements.loadingTitle.textContent : 'Generating Quiz...';
    const originalMessage = elements.loadingMessage ? elements.loadingMessage.textContent : 'Contacting AI...';

    try {
        // Hide the modal immediately so it doesn't block the loader screen
        if (elements.shareModal) {
            elements.shareModal.classList.add('hidden');
        }

        // Trigger the loading view screen and display custom sharing context text
        showView('loading');
        if (elements.loadingTitle) elements.loadingTitle.textContent = 'Link Share Creation';
        if (elements.loadingMessage) elements.loadingMessage.textContent = 'Please wait, generating link...';

        // Get expiry duration from the dropdown
        const days = parseInt(elements.shareExpirySelect.value);
        const expiryTimestamp = Date.now() + (days * 24 * 60 * 60 * 1000);
        
        // Prepare payload with metadata
        const shareId = 'quiz-' + Math.random().toString(36).substring(2, 10) + '.json';
        const sharePayload = { 
            n: quiz.fileName, 
            c: quiz.config, 
            q: quiz.questions,
            expiryTimestamp: expiryTimestamp
        };
        
        // Save to Puter filesystem
        await puter.fs.write(shareId, JSON.stringify(sharePayload));
        
        // Generate public access URL
        const publicUrl = await puter.fs.getReadURL(shareId);
        const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(publicUrl)}`;
        
        // Update local state and commit persistence matrices
        quiz.share = {
            isShared: true,
            shareId: shareId,
            shareUrl: shareUrl,
            expiryTimestamp: expiryTimestamp
        };
        // Updates individual quiz timestamp for sync tracking
        quiz.timestamp = Date.now();

        localStorage.setItem(constants.DB_NAME, JSON.stringify(state.quizHistory));
        localStorage.setItem(constants.DB_NAME + '_ts', Date.now().toString());
        
        // Sync history changes with Puter cloud profiles
        await syncHistoryWithCloud();
        refreshHistory();
        
        // Populate management fields for Step 2 UI view transition
        elements.shareLinkInput.value = shareUrl;
        elements.shareExpiryDisplay.textContent = `Expires in ${days} days`;
        elements.shareExpiryDisplay.className = 'text-xs text-blue-300 mt-1';
        
        // Re-reveal the share modal now that the link text is ready!
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
        navigateToShareStep('manage');
        showToast('Link generated!', 3000, 'success');
        
    } catch (err) {
        console.error('Generation Error:', err);
        showToast('Failed to generate link.', 4000, 'error');
        // Bring back the menu if an error occurs so the user isn't stuck
        if (elements.shareModal) {
            elements.shareModal.classList.remove('hidden');
        }
    } finally {
        // Clean up the text configurations so standard AI generations don't show the share notice
        if (elements.loadingTitle) elements.loadingTitle.textContent = originalTitle;
        if (elements.loadingMessage) elements.loadingMessage.textContent = originalMessage;
        
        // Return background view focus back to main dashboard layer
        showView('start');
    }
}

// import { state } from '../state.js';
// import { showView, setupCustomizeView, exportQuizAsJSON } from '../helpers.js';
// import { resumeQuiz } from './fileHandling.js';

import { state } from '../state.js';
import { showView, setupCustomizeView, exportQuizAsJSON } from '../helpers.js';

export function handleHistoryClick(event) {
    const targetButton = event.target.closest('button');
    if (!targetButton) return;

    const quizKey = targetButton.getAttribute('data-key');
    const action = targetButton.getAttribute('data-action');
    if (!quizKey || !action) return;

    const selectedQuiz = state.quizHistory[quizKey];
    if (!selectedQuiz) return;

    switch (action) {
        case 'load':
            state.questions = selectedQuiz.questions;
            state.currentQuizConfig = { ...selectedQuiz.config };
            state.currentFileName = selectedQuiz.fileName;
            state.currentQuizKey = quizKey;
            
            // Fires interactive active session frame launch directly 
            import('./quizExecution.js').then(module => {
                module.startQuiz();
            });
            break;

        case 'customize':
            state.isCustomizingHistory = true;
            state.customizingQuizKey = quizKey;
            state.customizingQuizData = selectedQuiz;

            // Updates settings input data with selected configurations
            setupCustomizeView(selectedQuiz.config, selectedQuiz.fileName);
            showView('start');
            
            // Unfolds presentation panel
            const panel = document.getElementById('customize-content');
            if (panel) panel.classList.remove('hidden');
            break;

        case 'share':
            if (typeof exportQuizAsJSON === 'function') {
                exportQuizAsJSON(quizKey);
            }
            break;
    }
}

export function showAllHistoryFullScreen() {
    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    // Explicit lookup targeting the exact container ID declared in the DOM template architecture
    const container = document.getElementById('history-full-list');
    if (!container) return;
    container.innerHTML = '';

    if (sorted.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-500 text-center">No saved quizzes.</p>`;
        // Corrected destination ID matching the view element property definition keys
        showView('history-fullscreen-view');
        return;
    }

    sorted.forEach(([key, data]) => {
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

        const isShared = data.share && data.share.isShared;
        const shareIconHTML = isShared ? `
            <span class="text-blue-400 bg-blue-500/10 p-1 rounded inline-flex items-center flex-shrink-0" title="Currently sharing via link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </span>
        ` : '';

        const titleHtml = `
            <div class="flex items-center gap-2 min-w-0 mb-1 w-full">
                <p class="font-semibold text-sm truncate min-w-0" title="${data.fileName || 'Untitled'}">
                    ${data.fileName || 'Untitled'}
                </p>
                ${shareIconHTML}
            </div>
        `;

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

        container.appendChild(item);
    });

    container.onclick = handleHistoryClick;
    showView('history-fullscreen-view');
}
