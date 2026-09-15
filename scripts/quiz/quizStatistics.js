import { elements, state, constants } from '../state.js';
import { showView, getQuizTakes } from '../helpers.js';
import { updateStatisticsOfflineBar } from './quizOffline.js';

/**
 * Opens the dedicated Statistics view for a specific quiz
 * @param {string} quizKey - Unique identifier of the quiz in history
 * @param {boolean} pushHash - Whether to push the #statistics hash into history
 */
export function openQuizStatistics(quizKey, pushHash = true, origin = null) {
    if (!quizKey) return;
    state.currentStatsQuizKey = quizKey;
    try {
        localStorage.setItem('nodal_last_stats_key', quizKey);
    } catch (e) {}
    if (origin) {
        state.statisticsOrigin = origin;
        state.navRootOrigin = origin;
    } else if (!state.statisticsOrigin) {
        state.statisticsOrigin = state.navRootOrigin || 'history';
    }
    renderQuizStatistics(quizKey);
    if (pushHash) {
        if (window.location.hash !== '#statistics') {
            const stateObj = { 
                view: 'statistics', 
                quizKey: quizKey, 
                origin: state.statisticsOrigin, 
                fromApp: true 
            };
            if (window.location.hash === '#history-actions') {
                window.history.replaceState(stateObj, '', '#statistics');
            } else {
                window.history.pushState(stateObj, '', '#statistics');
            }
        }
        showView('statistics', false);
    } else {
        showView('statistics', false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Renders metrics, chart overview, and completed takes table for the quiz
 * @param {string} quizKey - Quiz key to render statistics for
 */
export function renderQuizStatistics(quizKey) {
    const db = state.quizHistory || {};
    const quizData = db[quizKey] || {};
    const title = quizData.fileName || (quizKey ? quizKey.replace(/_/g, ' ') : 'Quiz Statistics');

    if (elements.statisticsTitle) {
        elements.statisticsTitle.textContent = `${title} - Statistics`;
    }

    const originLabel = state.statisticsOrigin === 'home' ? 'Home' : (state.statisticsOrigin === 'downloads' ? 'Downloads' : 'History');
    if (elements.statsCrumbHistory) {
        elements.statsCrumbHistory.textContent = originLabel;
    }
    if (elements.reviewCrumbHistory) {
        elements.reviewCrumbHistory.textContent = originLabel;
    }

    updateStatisticsOfflineBar(quizKey);

    const takes = getQuizTakes(quizKey) || [];
    const takeCount = takes.length;

    if (elements.statisticsTakeCountBadge) {
        elements.statisticsTakeCountBadge.textContent = `${takeCount} ${takeCount === 1 ? 'Take' : 'Takes'}`;
    }

    // Compute metrics
    let avgPerc = 0;
    let bestScore = 0;
    let bestTakeNum = 1;
    let latestDate = 'None';

    if (takeCount > 0) {
        let totalPerc = 0;
        takes.forEach((t, idx) => {
            const perc = typeof t.percentage === 'number' ? t.percentage : 0;
            totalPerc += perc;
            if (perc >= bestScore) {
                bestScore = perc;
                bestTakeNum = t.takeNumber || (idx + 1);
            }
        });
        avgPerc = Math.round(totalPerc / takeCount);

        const lastTake = takes[takes.length - 1];
        latestDate = lastTake.formattedDate || (lastTake.completedAt ? new Date(lastTake.completedAt).toLocaleDateString() : 'Recent');
    }

    // Render Metrics Cards
    if (elements.statisticsSummary) {
        const avgColor = avgPerc >= 80 ? 'text-emerald-400' : avgPerc >= 60 ? 'text-amber-400' : 'text-rose-400';
        const bestColor = bestScore >= 80 ? 'text-emerald-400' : bestScore >= 60 ? 'text-amber-400' : 'text-rose-400';

        elements.statisticsSummary.innerHTML = `
            <div class="stat-metric-card">
                <div class="flex items-center justify-between text-gray-400 text-xs mb-1">
                    <span>Total Retakes</span>
                    <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                </div>
                <div class="text-2xl font-bold text-white">${takeCount}</div>
                <div class="text-[11px] text-gray-400 mt-1">${takeCount === 0 ? 'No takes recorded' : 'Completed sessions'}</div>
            </div>

            <div class="stat-metric-card">
                <div class="flex items-center justify-between text-gray-400 text-xs mb-1">
                    <span>Average Score</span>
                    <svg class="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                </div>
                <div class="text-2xl font-bold ${avgColor}">${takeCount > 0 ? `${avgPerc}%` : '--'}</div>
                <div class="text-[11px] text-gray-400 mt-1">Across all retakes</div>
            </div>

            <div class="stat-metric-card">
                <div class="flex items-center justify-between text-gray-400 text-xs mb-1">
                    <span>Best Score</span>
                    <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>
                </div>
                <div class="text-2xl font-bold ${bestColor}">${takeCount > 0 ? `${bestScore}%` : '--'}</div>
                <div class="text-[11px] text-gray-400 mt-1">${takeCount > 0 ? `Achieved on Take #${bestTakeNum}` : 'No takes yet'}</div>
            </div>

            <div class="stat-metric-card">
                <div class="flex items-center justify-between text-gray-400 text-xs mb-1">
                    <span>Latest Session</span>
                    <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <div class="text-sm font-semibold text-white truncate mt-1" title="${latestDate}">${latestDate}</div>
                <div class="text-[11px] text-gray-400 mt-1">Last completed</div>
            </div>
        `;
    }

    // Render Takes Table / List
    if (elements.statisticsTakesList) {
        if (takeCount === 0) {
            elements.statisticsTakesList.innerHTML = `
                <div class="p-8 text-center text-gray-400 space-y-3">
                    <div class="w-12 h-12 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto text-blue-400">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                    </div>
                    <p class="text-sm font-medium text-gray-300">No completed takes recorded yet</p>
                    <p class="text-xs text-gray-500 max-w-sm mx-auto">Complete this quiz to record your test scores and review every answer with explanations here.</p>
                </div>
            `;
            return;
        }

        // Show newest takes first, but maintain original Take #
        const reversedTakes = [...takes].reverse();

        const rowsHtml = reversedTakes.map((take) => {
            const perc = typeof take.percentage === 'number' ? take.percentage : Math.round((take.score / (take.totalQuestions || 1)) * 100);
            const percBadgeClass = perc >= 80 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : perc >= 60 
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30';

            const scoreDisplay = `${take.score || 0} / ${take.totalQuestions || 0}`;
            const dateDisplay = take.formattedDate || (take.completedAt ? new Date(take.completedAt).toLocaleString() : 'N/A');

            return `
                <div class="p-3.5 sm:p-4 hover:bg-gray-800/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3" data-take-id="${take.id}">
                    <div class="flex items-center gap-3 min-w-0">
                        <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
                            #${take.takeNumber || 1}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-2">
                                <span class="text-sm font-semibold text-white">Take #${take.takeNumber || 1}</span>
                                <span class="text-xs font-semibold px-2 py-0.5 rounded-full ${percBadgeClass}">${perc}%</span>
                            </div>
                            <p class="text-xs text-gray-400 mt-0.5">${dateDisplay}</p>
                        </div>
                    </div>

                    <div class="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pl-13 sm:pl-0">
                        <div class="text-right">
                            <span class="text-xs text-gray-400 block sm:hidden">Score:</span>
                            <span class="text-sm font-mono font-bold text-gray-200">${scoreDisplay}</span>
                        </div>
                        <button class="review-take-btn bg-teal-600/90 hover:bg-teal-600 text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm" data-take-id="${take.id}">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                            </svg>
                            <span>Review</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        elements.statisticsTakesList.innerHTML = rowsHtml;

        // Wire up Review buttons
        elements.statisticsTakesList.querySelectorAll('.review-take-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const takeId = btn.dataset.takeId;
                const foundTake = takes.find(t => t.id === takeId);
                if (foundTake) {
                    openTestReview(foundTake, 'statistics');
                }
            });
        });
    }
}

/**
 * Opens detailed test review for a specific completed take
 * @param {Object} takeData - Take record containing questions, answers, order
 * @param {string} origin - 'statistics' or 'results'
 * @param {boolean} pushHash - Whether to push the #review hash
 */
export function openTestReview(takeData, origin = 'statistics', pushHash = true) {
    if (!takeData) return;
    state.currentReviewTake = takeData;
    state.reviewOrigin = origin;
    try {
        sessionStorage.setItem('nodal_last_review_take', JSON.stringify(takeData));
    } catch (e) {}

    // Breadcrumb visibility rule:
    // If opened from results screen, hide breadcrumbs bar; if from stats, show breadcrumbs
    if (elements.reviewBreadcrumbs) {
        if (origin === 'results') {
            elements.reviewBreadcrumbs.classList.add('hidden');
        } else {
            elements.reviewBreadcrumbs.classList.remove('hidden');
        }
    }

    renderTestReview(takeData);
    if (pushHash) {
        if (window.location.hash !== '#review') {
            window.history.pushState({ 
                view: 'review', 
                quizKey: state.currentStatsQuizKey, 
                takeData: takeData, 
                origin: origin, 
                fromApp: true 
            }, '', '#review');
        }
        showView('review', false);
    } else {
        showView('review', false);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Renders the Google/MS Forms style test review with user choices, correct answers & explanations
 * @param {Object} takeData - Take record
 */
export function renderTestReview(takeData) {
    const totalQ = takeData.totalQuestions || (takeData.questions ? takeData.questions.length : 0);
    const score = typeof takeData.score === 'number' ? takeData.score : 0;
    const perc = typeof takeData.percentage === 'number' ? takeData.percentage : Math.round((score / (totalQ || 1)) * 100);
    const quizName = takeData.fileName || 'Quiz';
    const dateStr = takeData.formattedDate || (takeData.completedAt ? new Date(takeData.completedAt).toLocaleString() : 'Recent');
    const takeNum = takeData.takeNumber || 1;

    // Render Take Score Summary Banner
    if (elements.reviewTakeSummaryBanner) {
        const percColor = perc >= 80 ? 'text-emerald-400' : perc >= 60 ? 'text-amber-400' : 'text-rose-400';
        const msg = perc >= 90 ? 'Outstanding!' : perc >= 75 ? 'Great Performance!' : perc >= 50 ? 'Good Effort.' : 'Keep Practicing!';

        elements.reviewTakeSummaryBanner.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div class="space-y-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="px-2.5 py-0.5 rounded-md bg-blue-500/20 text-blue-300 font-bold text-xs border border-blue-500/30">Take #${takeNum}</span>
                        <h3 class="text-base sm:text-lg font-bold text-white leading-tight">${quizName}</h3>
                    </div>
                    <p class="text-xs text-gray-400 flex items-center gap-1.5">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        <span>Completed on ${dateStr}</span>
                    </p>
                </div>

                <div class="flex items-center gap-3 bg-gray-800/80 px-4 py-2.5 rounded-xl border border-gray-700/80 self-stretch sm:self-auto justify-between sm:justify-end">
                    <div class="text-right">
                        <div class="text-xs text-gray-400 font-medium">${msg}</div>
                        <div class="text-lg font-extrabold ${percColor}">${score} / ${totalQ} (${perc}%)</div>
                    </div>
                    <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${perc >= 80 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : perc >= 60 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'}">
                        ${perc >= 80 ? '✓' : perc >= 60 ? '•' : '✕'}
                    </div>
                </div>
            </div>
        `;
    }

    // Render Question Review Cards in display order
    if (elements.reviewQuestionsContainer) {
        const questions = takeData.questions || [];
        const userAnswers = takeData.userAnswers || [];
        const displayOrder = (Array.isArray(takeData.displayOrder) && takeData.displayOrder.length === questions.length)
            ? takeData.displayOrder
            : questions.map((_, idx) => idx);

        const optionsMap = takeData.shuffledOptionsMap || {};

        const questionsHtml = displayOrder.map((origIdx, displayIdx) => {
            const qData = questions[origIdx];
            if (!qData) return '';

            const userAnsObj = userAnswers.find(a => a.originalIndex === origIdx);
            const isCorrect = userAnsObj ? !!userAnsObj.isCorrect : false;
            const qType = (qData.type || 'multiple-choice').toLowerCase();
            const isTF = qType === 'true-or-false' || qType === 'tf' || (
                Array.isArray(qData?.options) &&
                qData.options.length === 2 &&
                qData.options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase()))
            );

            // Question Type Label
            let typeLabel = 'Multiple Choice';
            if (isTF) typeLabel = 'True / False';
            else if (qType === 'identification' || qType === 'id') typeLabel = 'Identification';
            else if (qType === 'enumeration' || qType === 'en') typeLabel = 'Enumeration';

            // User Answer Text formatting
            let userAnsRaw = userAnsObj ? userAnsObj.userAnswer : null;
            let corrAnsRaw = qData.answer;

            // Options list for multiple-choice / true-or-false
            let choicesHtml = '';
            if (qType === 'multiple-choice' || qType === 'true-or-false') {
                const options = optionsMap[origIdx] || qData.options || (qType === 'true-or-false' ? ['True', 'False'] : []);
                
                choicesHtml = `
                    <div class="space-y-2 mt-3.5">
                        ${options.map(opt => {
                            const isUserChoice = (userAnsRaw !== null && userAnsRaw !== undefined) && 
                                (String(userAnsRaw).trim().toLowerCase() === String(opt).trim().toLowerCase());
                            const isCorrectChoice = (corrAnsRaw !== null && corrAnsRaw !== undefined) && 
                                (String(corrAnsRaw).trim().toLowerCase() === String(opt).trim().toLowerCase());

                            let choiceClass = 'review-choice-neutral';
                            let badgeHtml = '';

                            if (isCorrectChoice && isUserChoice) {
                                choiceClass = 'review-choice-correct';
                                badgeHtml = `
                                    <span class="review-badge review-badge-user-correct">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        <span>Your Answer (Correct)</span>
                                    </span>
                                `;
                            } else if (isCorrectChoice) {
                                choiceClass = 'review-choice-correct';
                                badgeHtml = `
                                    <span class="review-badge review-badge-correct-answer">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                        <span>Correct Answer</span>
                                    </span>
                                `;
                            } else if (isUserChoice) {
                                choiceClass = 'review-choice-incorrect';
                                badgeHtml = `
                                    <span class="review-badge review-badge-user-wrong">
                                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                        <span>Your Answer</span>
                                    </span>
                                `;
                            }

                            return `
                                <div class="review-choice ${choiceClass}">
                                    <span class="font-medium">${opt}</span>
                                    ${badgeHtml}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `;
            } else if (qType === 'identification') {
                const userText = userAnsRaw !== null && userAnsRaw !== undefined && userAnsRaw !== '' ? userAnsRaw : 'No answer provided';
                const corrText = corrAnsRaw || 'N/A';

                choicesHtml = `
                    <div class="mt-3.5 space-y-2.5">
                        <div class="p-3 rounded-lg border ${isCorrect ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-rose-500/60 bg-rose-950/20'}">
                            <span class="text-xs text-gray-400 block mb-1">Your Answer:</span>
                            <span class="font-mono text-sm font-semibold ${isCorrect ? 'text-emerald-300' : 'text-rose-300'}">${userText}</span>
                        </div>
                        ${!isCorrect ? `
                            <div class="p-3 rounded-lg border border-emerald-500/50 bg-emerald-950/20">
                                <span class="text-xs text-gray-400 block mb-1">Correct Answer:</span>
                                <span class="font-mono text-sm font-semibold text-emerald-300">${corrText}</span>
                            </div>
                        ` : ''}
                    </div>
                `;
            } else if (qType === 'enumeration') {
                const userList = Array.isArray(userAnsRaw) ? userAnsRaw : (userAnsRaw ? [userAnsRaw] : []);
                const corrList = Array.isArray(corrAnsRaw) ? corrAnsRaw : (corrAnsRaw ? [corrAnsRaw] : []);

                choicesHtml = `
                    <div class="mt-3.5 space-y-2.5">
                        <div class="p-3 rounded-lg border ${isCorrect ? 'border-emerald-500/60 bg-emerald-950/20' : 'border-rose-500/60 bg-rose-950/20'}">
                            <span class="text-xs text-gray-400 block mb-1">Your Answers:</span>
                            <div class="flex flex-wrap gap-1.5 mt-1">
                                ${userList.length > 0 ? userList.map(item => `
                                    <span class="px-2 py-0.5 rounded text-xs font-mono font-medium ${isCorrect ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}">${item}</span>
                                `).join('') : '<span class="text-xs text-gray-400 italic">No answers provided</span>'}
                            </div>
                        </div>
                        ${!isCorrect ? `
                            <div class="p-3 rounded-lg border border-emerald-500/50 bg-emerald-950/20">
                                <span class="text-xs text-gray-400 block mb-1">Expected Answers:</span>
                                <div class="flex flex-wrap gap-1.5 mt-1">
                                    ${corrList.map(item => `
                                        <span class="px-2 py-0.5 rounded text-xs font-mono font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">${item}</span>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }

            // Explanation card
            const explanationHtml = qData.explanation ? `
                <div class="mt-4 p-3.5 rounded-xl bg-gray-900/60 border border-gray-700/60">
                    <div class="flex items-center gap-1.5 text-xs font-semibold text-blue-400 mb-1">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        <span>Explanation</span>
                    </div>
                    <p class="text-xs sm:text-sm text-gray-300 leading-relaxed">${qData.explanation}</p>
                </div>
            ` : '';

            return `
                <div class="bg-gray-800/80 border ${isCorrect ? 'border-emerald-500/30' : 'border-rose-500/30'} rounded-2xl p-4 sm:p-5 shadow-md">
                    <div class="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-gray-700/50">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-bold text-sm sm:text-base text-white">Q${displayIdx + 1}</span>
                            <span class="text-[11px] font-medium px-2 py-0.5 rounded-md bg-gray-700 text-gray-300 border border-gray-600/60">${typeLabel}</span>
                        </div>
                        <div class="flex items-center">
                            ${isCorrect ? `
                                <span class="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Correct (+1)</span>
                                </span>
                            ` : `
                                <span class="inline-flex items-center gap-1 text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-full">
                                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    <span>Incorrect (0/1)</span>
                                </span>
                            `}
                        </div>
                    </div>

                    <p class="text-sm sm:text-base font-semibold text-gray-200 mt-2">${qData.question}</p>

                    ${choicesHtml}
                    ${explanationHtml}
                </div>
            `;
        }).join('');

        elements.reviewQuestionsContainer.innerHTML = questionsHtml;
    }
}

/**
 * Initializes navigation listeners for Statistics and Review pages
 */
export function initQuizStatisticsListeners() {
    const handleStatsBack = async () => {
        if (state.statisticsOrigin === 'home') {
            showView('start');
        } else if (state.statisticsOrigin === 'downloads') {
            showView('downloads');
        } else {
            const { showAllHistoryFullScreen } = await import('./quizHistory.js');
            showAllHistoryFullScreen();
        }
    };

    const handleStatsBackClick = () => {
        if (window.history.length > 1 && window.location.hash === '#statistics') {
            window.history.back();
        } else {
            handleStatsBack();
        }
    };

    // Statistics Back Button -> returns to origin (Home, Downloads, or History)
    if (elements.statisticsBackBtn) {
        elements.statisticsBackBtn.addEventListener('click', handleStatsBackClick);
    }

    // Statistics Crumb History -> returns to origin
    if (elements.statsCrumbHistory) {
        elements.statsCrumbHistory.addEventListener('click', handleStatsBackClick);
    }

    const handleReviewBackClick = () => {
        try { sessionStorage.removeItem('nodal_last_review_take'); } catch (e) {}
        if (window.history.length > 1 && window.location.hash === '#review') {
            window.history.back();
        } else if (state.reviewOrigin === 'results') {
            showView('results');
        } else {
            openQuizStatistics(state.currentStatsQuizKey, false, state.statisticsOrigin);
        }
    };

    // Review Back Button -> returns to Statistics or Results depending on origin
    if (elements.reviewBackBtn) {
        elements.reviewBackBtn.addEventListener('click', handleReviewBackClick);
    }

    // Review Breadcrumbs: History crumb -> returns to origin
    if (elements.reviewCrumbHistory) {
        elements.reviewCrumbHistory.addEventListener('click', () => {
            if (window.history.length > 2 && window.location.hash === '#review') {
                window.history.go(-2);
            } else {
                handleStatsBack();
            }
        });
    }

    // Review Breadcrumbs: Statistics crumb -> returns to Statistics
    if (elements.reviewCrumbStats) {
        elements.reviewCrumbStats.addEventListener('click', handleReviewBackClick);
    }
}
