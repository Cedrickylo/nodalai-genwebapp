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

export async function handleHistoryClick(e) {
    // Find the closest button element, even if the user clicked the inner SVG icon or text span
    const btn = e.target.closest('button');
    if (!btn) return;

    const key = btn.dataset.key;
    const action = btn.dataset.action;
    const quizData = state.quizHistory[key];
    if (!quizData) return;

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
        state.currentQuizConfig = quizData.config;
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
        state.customizingQuizData = { ...quizData, key };
        setupCustomizeView(quizData.config, quizData.fileName);
        showView('start');
    } else if (action === 'share') {
        // Store the key of the quiz we are currently interacting with
        state.currentShareQuizKey = key;
        
        // Open the share modal seamlessly
        openShareModal(key);
    }
}
