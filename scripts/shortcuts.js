// shortcuts.js — Centralized keyboard shortcut manager

let shortcutsEnabled = true;
let overlayVisible = false;

const SHORTCUTS = [
    { key: '1-4', desc: 'Select answer (MC)', scope: 'quiz' },
    { key: 'A-D', desc: 'Select answer (MC)', scope: 'quiz' },
    { key: 'N / Enter', desc: 'Next question', scope: 'quiz' },
    { key: 'S', desc: 'Skip question', scope: 'quiz' },
    { key: 'R', desc: 'Reveal answer', scope: 'quiz' },
    { key: 'Esc', desc: 'Save & go home', scope: 'quiz' },
    { key: '?', desc: 'Show shortcuts', scope: 'global' },
    { key: 'H', desc: 'Go home', scope: 'global' },
    { key: 'G', desc: 'Focus generate', scope: 'global' },
];

export function initShortcuts() {
    document.addEventListener('keydown', handleKeydown);
}

export function disableShortcuts() {
    shortcutsEnabled = false;
}

export function enableShortcuts() {
    shortcutsEnabled = true;
}

function handleKeydown(e) {
    // Don't trigger shortcuts when typing in inputs
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;

    if (!shortcutsEnabled) return;

    const key = e.key.toLowerCase();

    // Global shortcuts
    if (key === '?' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        toggleOverlay();
        return;
    }

    // Only process other shortcuts if not in overlay
    if (overlayVisible && key !== 'escape' && key !== '?') return;

    // Close overlay on any key
    if (overlayVisible) {
        closeOverlay();
        return;
    }

    const isInQuiz = document.getElementById('quiz-view')?.classList.contains('active');
    const isInResults = document.getElementById('results-view')?.classList.contains('active');

    // Global shortcuts (work everywhere)
    if (key === 'h' && !e.ctrlKey && !e.metaKey && !isInQuiz) {
        e.preventDefault();
        import('./helpers.js').then(m => m.showView('start'));
        return;
    }

    if (key === 'g' && !e.ctrlKey && !e.metaKey && !isInQuiz) {
        e.preventDefault();
        const btn = document.getElementById('generate-quiz-btn');
        if (btn && !btn.disabled) btn.focus();
        return;
    }

    // Quiz-specific shortcuts
    if (isInQuiz) {
        handleQuizShortcut(key, e);
    }
}

function handleQuizShortcut(key, e) {
    // Answer selection: 1-4 or a-d
    if ((key >= '1' && key <= '4') || (key >= 'a' && key <= 'd')) {
        const idx = key >= '1' && key <= '4' ? parseInt(key) - 1 : key.charCodeAt(0) - 97;
        const buttons = document.querySelectorAll('#answer-area .option-btn, #answer-area button');
        if (buttons[idx]) {
            e.preventDefault();
            buttons[idx].click();
        }
        return;
    }

    // Next question: n or enter
    if (key === 'n' || (key === 'enter' && !e.shiftKey)) {
        const nextBtn = document.getElementById('next-question-btn');
        if (nextBtn && !nextBtn.classList.contains('hidden')) {
            e.preventDefault();
            nextBtn.click();
        }
        return;
    }

    // Skip question: s
    if (key === 's') {
        const skipBtn = document.getElementById('skip-question-btn');
        if (skipBtn && !skipBtn.classList.contains('hidden')) {
            e.preventDefault();
            skipBtn.click();
        }
        return;
    }

    // Reveal answer: r
    if (key === 'r') {
        const revealBtn = document.getElementById('reveal-answer-btn');
        if (revealBtn && !revealBtn.classList.contains('hidden')) {
            e.preventDefault();
            revealBtn.click();
        }
        return;
    }

    // Escape: save and go home
    if (key === 'escape') {
        const homeBtn = document.getElementById('home-btn');
        if (homeBtn) {
            e.preventDefault();
            homeBtn.click();
        }
        return;
    }
}

function toggleOverlay() {
    if (overlayVisible) {
        closeOverlay();
    } else {
        showOverlay();
    }
}

function showOverlay() {
    overlayVisible = true;
    let overlay = document.getElementById('shortcuts-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'shortcuts-overlay';
        overlay.className = 'fixed inset-0 z-[250] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        overlay.onclick = (e) => { if (e.target === overlay) closeOverlay(); };

        const isInQuiz = document.getElementById('quiz-view')?.classList.contains('active');
        const filtered = SHORTCUTS.filter(s => s.scope === 'global' || (s.scope === 'quiz' && isInQuiz));

        overlay.innerHTML = `
            <div class="bg-gray-800 w-full max-w-sm rounded-2xl shadow-2xl border border-gray-700 p-6">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-blue-400">Keyboard Shortcuts</h3>
                    <button onclick="document.getElementById('shortcuts-overlay').remove()" class="text-gray-400 hover:text-white">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
                <div class="space-y-2">
                    ${filtered.map(s => `
                        <div class="flex items-center justify-between py-1.5 border-b border-gray-700/50 last:border-0">
                            <span class="text-xs text-gray-400">${s.desc}</span>
                            <kbd class="px-2 py-0.5 bg-gray-700 rounded text-xs text-white font-mono border border-gray-600">${s.key}</kbd>
                        </div>
                    `).join('')}
                </div>
                <p class="text-[10px] text-gray-500 text-center mt-4">Press ? or Esc to close</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
}

function closeOverlay() {
    overlayVisible = false;
    const overlay = document.getElementById('shortcuts-overlay');
    if (overlay) overlay.remove();
}
