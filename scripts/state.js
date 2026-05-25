// state.js - Operational Configuration Constants and Memory State Hub
export const constants = {
    DB_NAME: 'AIQuizGeneratorDB_v4',
    CLOUD_SYNC_KEY: 'puter_quiz_sync_v4',
    IN_PROGRESS_QUIZ_KEY: 'AIQuizInProgress',
    MAX_GENERATION_ATTEMPTS: 5,
    MAX_GENERATIONS_PER_WINDOW: 5,
    GENERATION_WINDOW_MS: 3 * 60 * 60 * 1000,
    GENERATION_LOG_LOCAL_KEY: 'AIQuizGenerationLog',
    GENERATION_LOG_CLOUD_KEY: 'AIQuizGenerationLog_v1',
    MIN_QUIZ_QUESTIONS: 5,
    MAX_QUIZ_QUESTIONS: 100
};

// Safe conditional selector evaluation to prevent blocking initialization threads
const safeGet = (id) => document.getElementById(id) || document.createElement('div');

export const elements = {
    views: {
        get start() { return document.getElementById('start-view'); },
        get loading() { return document.getElementById('loading-view'); },
        get quiz() { return document.getElementById('quiz-view'); },
        get results() { return document.getElementById('results-view'); },
        get 'history-fullscreen'() { return document.getElementById('history-fullscreen-view'); },
        get help() { return document.getElementById('help-view'); },
        get about() { return document.getElementById('about-view'); }
    },
    get globalSyncDone() { return document.getElementById('sync-icon-done'); },
    get globalSyncLoad() { return document.getElementById('sync-icon-loading'); },
    get quizSyncDone() { return document.querySelector('#quiz-sync-indicator .sync-icon-done'); },
    get quizSyncLoad() { return document.querySelector('#quiz-sync-indicator .sync-icon-loading'); },
    get statusMessage() { return safeGet('status-message'); },
    get loadingTitle() { return safeGet('loading-title'); },
    get loadingMessage() { return safeGet('loading-message'); },
    get historyList() { return safeGet('history-list'); },
    get showAllHistoryBtn() { return safeGet('show-all-history-btn'); },
    get toastEl() { return safeGet('toast-notification'); },
    get toastMessageEl() { return safeGet('toast-message'); },
    get startSubtitle() { return safeGet('start-subtitle'); },
    get fileActionsDiv() { return safeGet('file-actions'); },
    get generateQuizBtn() { return safeGet('generate-quiz-btn'); },
    get resumeQuizBtn() { return safeGet('resume-quiz-btn'); },
    get customizeContent() { return safeGet('customize-content'); },
    get editQuizNameInput() { return safeGet('edit-quiz-name'); },
    get progressEl() { return safeGet('progress'); },
    get scoreEl() { return safeGet('score'); },
    get questionTextEl() { return safeGet('question-text'); },
    get answerAreaEl() { return safeGet('answer-area'); },
    get explanationAreaEl() { return safeGet('explanation-area'); },
    get timerDisplayEl() { return safeGet('timer-display'); },
    get attemptDisplayEl() { return safeGet('attempt-display'); },
    get nextQuestionBtn() { return safeGet('next-question-btn'); },
    get skipQuestionBtn() { return safeGet('skip-question-btn'); }
};

export const state = {
    fileContent: '',
    fileHash: '',
    questions: [],
    userAnswers: [],
    score: 0,
    shuffledIndices: [],
    currentQuizConfig: {},
    currentQuizKey: '',
    currentFileName: '',
    correctSound: null,
    incorrectSound: null,
    loadingInterval: null,
    toastTimeout: null,
    quizTimerInterval: null,
    quizHistory: JSON.parse(localStorage.getItem(constants.DB_NAME) || '{}'),
    generationLog: [],
    savedProgress: null,
    timeRemaining: 0,
    isTimedQuiz: false,
    totalQuizTime: 0,
    currentShuffledIndexPos: 0,
    answeredOriginalIndices: new Set(),
    skippedOriginalIndices: new Set(),
    currentSkippedItemIndex: 0,
    inSkippedRound: false,
    currentSkippedArray: [],
    isAttemptLimited: false,
    maxAttempts: 3,
    currentAttempts: 0,
    isCustomizingHistory: false,
    customizingQuizKey: null,
    customizingQuizData: null
};