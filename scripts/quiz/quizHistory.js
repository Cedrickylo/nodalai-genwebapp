// quizHistory.js - Standalone Quiz History View Management Module
import { state } from '../state.js';
import { showView, setupCustomizeView, exportQuizAsJSON, formatTime } from '../helpers.js';

export function showAllHistoryFullScreen() {
    const db = state.quizHistory;
    const sorted = Object.entries(db).sort(([, a], [, b]) => b.timestamp - a.timestamp);
    
    const container = document.getElementById('history-full-list');
    if (!container) return;
    container.innerHTML = '';

    if (sorted.length === 0) {
        container.innerHTML = `<p class="text-sm text-gray-500 text-center">No saved quizzes.</p>`;
        showView('history-fullscreen');
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

        item.innerHTML = `
            <div class="flex-grow min-w-0 mr-4 overflow-hidden">
                <div class="flex items-center gap-2 min-w-0 mb-1 w-full">
                    <p class="font-semibold text-sm truncate min-w-0" title="${data.fileName || 'Untitled'}">
                        ${data.fileName || 'Untitled'}
                    </p>
                    ${shareIconHTML}
                </div>
                <p class="text-xs text-gray-400 truncate">${data.config.count || 0} Qs ${diffTxt} ${tInfo} ${attInfo} ${summaryInfo}</p>
            </div>
            <div class="flex-shrink-0 flex gap-1 sm:gap-2"> 
                <button class="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold py-1 px-2 sm:px-3 rounded inline-flex items-center justify-center gap-1" data-key="${key}" data-action="share" title="Share">
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

    showView('history-fullscreen');
}

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
            
            import('./quizExecution.js').then(module => {
                module.startQuiz();
            });
            break;

        case 'customize':
            state.isCustomizingHistory = true;
            state.customizingQuizKey = quizKey;
            state.customizingQuizData = selectedQuiz;

            setupCustomizeView(selectedQuiz.config, selectedQuiz.fileName);
            showView('start');
            
            const panel = document.getElementById('customize-content');
            if (panel) panel.classList.remove('hidden');
            break;

        case 'share':
            exportQuizAsJSON(quizKey);
            break;
    }
}