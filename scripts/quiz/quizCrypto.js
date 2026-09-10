/**
 * Nodal AI - Cryptographic Security & Quiz Data Encryption Module
 * Handles AES-256 encryption & decryption for local storage and cloud sync,
 * flexible import parsing (encrypted or raw text), decrypted human-readable exports,
 * and automated database migration with visual progress reporting.
 */

// ==================================================================
// CONSTANTS & KEYS
// ==================================================================
export const NODAL_STORAGE_AES_KEY = 'NodalAI_Secure_Quiz_Storage_2026_@cedrickylo';
export const NODAL_ENC_PREFIX = 'NODAL_ENC_v1:';
export const NODAL_ENCRYPTED_ENVELOPE_MAGIC = 'NODAL_ENCRYPTED_QUIZ_V1';

// Database keys that contain sensitive quiz data to be encrypted
const ENCRYPTED_STORAGE_KEYS = [
    'AIQuizGeneratorDB_v4',
    'nodal_quiz_takes_v1',
    'AIQuizInProgress',
    'nodal_offline_downloads_v1'
];

// ==================================================================
// CORE ENCRYPTION & DECRYPTION HELPERS
// ==================================================================

/**
 * Checks if a string or object has an encrypted format.
 * @param {any} raw 
 * @returns {boolean}
 */
export function isEncryptedData(raw) {
    if (typeof raw !== 'string') {
        if (raw && typeof raw === 'object' && raw.magic === NODAL_ENCRYPTED_ENVELOPE_MAGIC) {
            return true;
        }
        return false;
    }
    const trimmed = raw.trim();
    return (
        trimmed.startsWith(NODAL_ENC_PREFIX) ||
        trimmed.startsWith('U2FsdGVkX1') || // OpenSSL magic header used by CryptoJS
        trimmed.startsWith('{"magic":"' + NODAL_ENCRYPTED_ENVELOPE_MAGIC + '"') ||
        trimmed.startsWith('{"magic": "' + NODAL_ENCRYPTED_ENVELOPE_MAGIC + '"') ||
        trimmed.startsWith('NODAL_ENCRYPTED_BACKUP_V1:')
    );
}

/**
 * Encrypts arbitrary JavaScript data into a prefixed AES-256 ciphertext string.
 * @param {any} data - Object, array, or string to encrypt.
 * @param {string} [customKey] - Optional custom encryption key.
 * @returns {string} Prefixed ciphertext string (`NODAL_ENC_v1:<ciphertext>`)
 */
export function encryptQuizData(data, customKey = NODAL_STORAGE_AES_KEY) {
    if (typeof CryptoJS === 'undefined' || !CryptoJS.AES) {
        console.error('[Crypto] CryptoJS.AES is not available in environment.');
        return typeof data === 'string' ? data : JSON.stringify(data);
    }

    try {
        const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
        const ciphertext = CryptoJS.AES.encrypt(jsonString, customKey).toString();
        return `${NODAL_ENC_PREFIX}${ciphertext}`;
    } catch (err) {
        console.error('[Crypto] Encryption error:', err);
        return typeof data === 'string' ? data : JSON.stringify(data);
    }
}

/**
 * Safely decrypts an encrypted ciphertext string, or parses plain JSON if unencrypted.
 * Guaranteed not to throw: returns fallback if parsing/decryption fails.
 * @param {any} raw - Ciphertext string or raw JSON string.
 * @param {string} [customKey] - Optional custom encryption key.
 * @param {any} [fallback=null] - Fallback value on failure.
 * @returns {any} Decrypted/parsed data.
 */
export function decryptQuizData(raw, customKey = NODAL_STORAGE_AES_KEY, fallback = null) {
    if (raw === null || raw === undefined || raw === '') {
        return fallback;
    }

    // Already parsed object
    if (typeof raw !== 'string') {
        if (raw && typeof raw === 'object' && raw.magic === NODAL_ENCRYPTED_ENVELOPE_MAGIC && raw.payload) {
            return decryptQuizData(raw.payload, customKey, fallback);
        }
        return raw;
    }

    const trimmed = raw.trim();

    // Check if it is encrypted
    if (isEncryptedData(trimmed)) {
        if (typeof CryptoJS === 'undefined' || !CryptoJS.AES) {
            console.error('[Crypto] CryptoJS.AES is not available to decrypt.');
            return fallback;
        }

        try {
            let ciphertext = trimmed;
            if (ciphertext.startsWith(NODAL_ENC_PREFIX)) {
                ciphertext = ciphertext.slice(NODAL_ENC_PREFIX.length);
            } else if (ciphertext.startsWith('NODAL_ENCRYPTED_BACKUP_V1:')) {
                ciphertext = ciphertext.slice('NODAL_ENCRYPTED_BACKUP_V1:'.length);
            } else if (ciphertext.startsWith('{')) {
                // Envelope JSON
                try {
                    const parsedEnv = JSON.parse(ciphertext);
                    if (parsedEnv && parsedEnv.payload) {
                        ciphertext = parsedEnv.payload;
                    }
                } catch (e) {}
            }

            const decryptedBytes = CryptoJS.AES.decrypt(ciphertext, customKey);
            const decryptedString = decryptedBytes.toString(CryptoJS.enc.Utf8);

            if (!decryptedString) {
                console.warn('[Crypto] Decryption produced empty string (key mismatch or corrupted data).');
                return fallback;
            }

            try {
                return JSON.parse(decryptedString);
            } catch (jsonErr) {
                return decryptedString;
            }
        } catch (decryptErr) {
            console.warn('[Crypto] Decryption exception:', decryptErr);
            return fallback;
        }
    }

    // Plaintext string (legacy unencrypted JSON or raw string)
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        return trimmed;
    }
}

// ==================================================================
// LOCAL STORAGE WRAPPERS
// ==================================================================

/**
 * Reads an encrypted item from localStorage and automatically decrypts it.
 * @param {string} key 
 * @param {any} [fallback=null] 
 * @returns {any}
 */
export function getEncryptedStorageItem(key, fallback = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return fallback;
        const result = decryptQuizData(raw, NODAL_STORAGE_AES_KEY, fallback);
        return result !== null && result !== undefined ? result : fallback;
    } catch (err) {
        console.warn(`[Crypto] getEncryptedStorageItem error on ${key}:`, err);
        return fallback;
    }
}

/**
 * Encrypts data and writes it to localStorage.
 * @param {string} key 
 * @param {any} data 
 * @param {string} [customKey] 
 * @returns {boolean}
 */
export function setEncryptedStorageItem(key, data, customKey = NODAL_STORAGE_AES_KEY) {
    try {
        const encrypted = encryptQuizData(data, customKey);
        localStorage.setItem(key, encrypted);
        return true;
    } catch (err) {
        console.error(`[Crypto] setEncryptedStorageItem error on ${key}:`, err);
        return false;
    }
}

// ==================================================================
// INDIVIDUAL QUIZ IMPORT & EXPORT LOGIC
// ==================================================================

/**
 * Decrypts or parses an imported individual quiz file or raw text input.
 * Supports:
 * - Encrypted individual quiz files (NODAL_ENC_v1:..., OpenSSL ciphertext, or envelope)
 * - Raw JSON text
 * - Markdown code blocks (```json ... ```)
 * @param {string} rawText 
 * @returns {{ data: any, wasEncrypted: boolean }}
 */
export function decryptImportedQuizText(rawText) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Import data is empty.');
    }

    const trimmed = rawText.trim();

    // 1. Check if encrypted
    if (isEncryptedData(trimmed)) {
        const decrypted = decryptQuizData(trimmed, NODAL_STORAGE_AES_KEY, null);
        if (decrypted && (typeof decrypted === 'object' || typeof decrypted === 'string')) {
            const parsed = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
            return { data: parsed, wasEncrypted: true };
        }
        throw new Error('Failed to decrypt quiz file. Signature or key mismatch.');
    }

    // 2. Clean raw text / Markdown code block
    let cleaned = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    // Extract JSON substring if wrapped in extra text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }

    try {
        const parsed = JSON.parse(cleaned);
        return { data: parsed, wasEncrypted: false };
    } catch (jsonErr) {
        throw new Error('Invalid JSON structure: could not parse raw quiz text.');
    }
}

/**
 * Formats and downloads an individual quiz as a human-readable, decrypted JSON file.
 * @param {object} quizData - Quiz metadata, questions, and config.
 * @param {string} [quizKey] - Unique quiz ID.
 * @param {Array} [takes] - Optional takes / attempts array.
 */
export function exportDecryptedQuizJSON(quizData, quizKey = null, takes = []) {
    if (!quizData || !Array.isArray(quizData.questions) || quizData.questions.length === 0) {
        throw new Error('No quiz questions to export.');
    }

    const key = quizKey || (typeof CryptoJS !== 'undefined' && CryptoJS.SHA256 
        ? CryptoJS.SHA256(JSON.stringify(quizData.questions) + JSON.stringify(quizData.config || {}) + (quizData.fileName || '')).toString()
        : `quiz_${Date.now()}`);

    const exportPayload = {
        quizId: key,
        fileName: quizData.fileName || 'Untitled Quiz',
        exportedAt: Date.now(),
        version: 1,
        config: quizData.config || {},
        questions: quizData.questions,
        takes: Array.isArray(takes) ? takes : []
    };

    const formattedJSON = JSON.stringify(exportPayload, null, 2);
    const blob = new Blob([formattedJSON], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    const safeName = (quizData.fileName || 'quiz').replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_\-\s]/gi, '_');

    downloadAnchor.href = url;
    downloadAnchor.download = `quiz-${safeName}.json`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);

    setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ==================================================================
// AUTOMATED DATABASE MIGRATION ENGINE
// ==================================================================

/**
 * Checks whether any legacy unencrypted data currently exists in localStorage
 * or in cloud storage without throwing.
 * @returns {boolean} True if unencrypted data is detected.
 */
export function hasLegacyUnencryptedData() {
    try {
        for (const key of ENCRYPTED_STORAGE_KEYS) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const trimmed = raw.trim();
            // If it starts with '{' or '[' and is NOT an encrypted envelope/ciphertext
            if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !isEncryptedData(trimmed)) {
                return true;
            }
        }
    } catch (e) {
        console.warn('[Crypto Migration] Error during local scan:', e);
    }
    return false;
}

/**
 * Displays the dedicated fullscreen migration loading screen.
 * @param {string} [stepText] 
 */
export function showMigrationLoader(stepText = 'Securing quiz database with AES-256...') {
    const loader = document.getElementById('database-migration-loader');
    if (!loader) return;
    const stepEl = document.getElementById('migration-loader-step');
    if (stepEl) stepEl.textContent = stepText;
    loader.classList.remove('hidden');
    loader.style.opacity = '1';
}

/**
 * Updates the step description and progress bar on the migration loader.
 * @param {string} stepText 
 * @param {number} [percent] 
 */
export function updateMigrationLoader(stepText, percent = null) {
    const stepEl = document.getElementById('migration-loader-step');
    if (stepEl && stepText) stepEl.textContent = stepText;
    const bar = document.getElementById('migration-loader-bar');
    if (bar && percent !== null) {
        bar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    }
}

/**
 * Hides the fullscreen migration loading screen with a smooth fade-out.
 */
export function hideMigrationLoader() {
    const loader = document.getElementById('database-migration-loader');
    if (!loader || loader.classList.contains('hidden')) return;

    loader.style.transition = 'opacity 300ms ease-out';
    loader.style.opacity = '0';
    setTimeout(() => {
        loader.classList.add('hidden');
        loader.style.opacity = '1';
    }, 320);
}

/**
 * Converts all unencrypted local database keys in localStorage into AES-256 encrypted format.
 * @returns {number} Count of migrated keys.
 */
export function migrateLocalDatabaseToEncrypted() {
    let migratedCount = 0;
    try {
        for (const key of ENCRYPTED_STORAGE_KEYS) {
            const raw = localStorage.getItem(key);
            if (!raw) continue;

            const trimmed = raw.trim();
            if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && !isEncryptedData(trimmed)) {
                try {
                    const parsed = JSON.parse(trimmed);
                    setEncryptedStorageItem(key, parsed);
                    migratedCount++;
                    console.log(`[Crypto Migration] Successfully encrypted local key: ${key}`);
                } catch (parseErr) {
                    console.warn(`[Crypto Migration] Could not parse legacy item for ${key}:`, parseErr);
                }
            }
        }
        localStorage.setItem('nodal_database_encrypted_v1', 'true');
    } catch (e) {
        console.error('[Crypto Migration] Local migration error:', e);
    }
    return migratedCount;
}

/**
 * Inspects Puter cloud sync files and KV record. If any unencrypted payloads exist,
 * encrypts them with AES-256 and writes back to Puter cloud.
 * @returns {Promise<boolean>}
 */
export async function migrateCloudDataToEncrypted() {
    if (typeof puter === 'undefined' || !window.puter || !puter.auth?.isSignedIn() || !navigator.onLine) {
        return false;
    }

    let migrated = false;
    const CLOUD_SYNC_KEY = 'puter_quiz_sync_v4';
    const PUTER_FS_SYNC_FILE = 'nodal_quiz_sync_v4.json';
    const PUTER_FS_BACKUP_FILE = 'nodal_quiz_sync_backup.json';

    try {
        // 1. Check Puter KV
        try {
            const kvRaw = await puter.kv.get(CLOUD_SYNC_KEY);
            if (kvRaw) {
                const str = typeof kvRaw === 'string' ? kvRaw.trim() : JSON.stringify(kvRaw);
                if (str.startsWith('{') && !isEncryptedData(str)) {
                    const parsed = typeof kvRaw === 'string' ? JSON.parse(kvRaw) : kvRaw;
                    const encrypted = encryptQuizData(parsed, NODAL_STORAGE_AES_KEY);
                    await puter.kv.set(CLOUD_SYNC_KEY, encrypted);
                    migrated = true;
                    console.log('[Crypto Migration] Migrated Puter KV to encrypted format.');
                }
            }
        } catch (kvErr) {
            console.warn('[Crypto Migration] KV check skipped:', kvErr);
        }

        // 2. Check Puter FS Sync and Backup files
        if (puter.fs && typeof puter.fs.read === 'function' && typeof puter.fs.write === 'function') {
            for (const file of [PUTER_FS_SYNC_FILE, PUTER_FS_BACKUP_FILE]) {
                try {
                    const fsItem = await puter.fs.read(file);
                    let text = '';
                    if (typeof fsItem === 'string') {
                        text = fsItem;
                    } else if (fsItem && typeof fsItem.text === 'function') {
                        text = await fsItem.text();
                    } else if (fsItem && fsItem.content) {
                        text = typeof fsItem.content === 'string' ? fsItem.content : JSON.stringify(fsItem.content);
                    }

                    const trimmed = text.trim();
                    if (trimmed.startsWith('{') && !isEncryptedData(trimmed)) {
                        const parsed = JSON.parse(trimmed);
                        const encrypted = encryptQuizData(parsed, NODAL_STORAGE_AES_KEY);
                        await puter.fs.write(file, encrypted, { overwrite: true, dedupe_name: false });
                        migrated = true;
                        console.log(`[Crypto Migration] Migrated Puter FS file "${file}" to encrypted format.`);
                    }
                } catch (fsErr) {
                    // File might not exist yet, ignore
                }
            }
        }

        if (migrated) {
            localStorage.setItem('nodal_cloud_encrypted_v1', 'true');
        }
    } catch (err) {
        console.error('[Crypto Migration] Cloud migration exception:', err);
    }
    return migrated;
}

/**
 * Master migration execution pipeline called at application startup.
 * Checks for legacy unencrypted data; if detected, displays the fullscreen loading screen,
 * blocks interaction until all local and cloud data is encrypted, then smoothly closes.
 * If NO legacy unencrypted data is detected, exits instantly with ZERO screen interruption.
 * @returns {Promise<boolean>}
 */
export async function executeDatabaseMigration() {
    // Fast path: if no unencrypted data exists, exit immediately without showing anything!
    const needsLocalMigration = hasLegacyUnencryptedData();
    const needsCloudCheck = (typeof puter !== 'undefined' && window.puter && puter.auth?.isSignedIn() && navigator.onLine && localStorage.getItem('nodal_cloud_encrypted_v1') !== 'true');

    if (!needsLocalMigration && !needsCloudCheck) {
        return false;
    }

    console.log('[Crypto Migration] Legacy unencrypted data detected. Initiating migration sequence...');
    showMigrationLoader('Securing quiz history & attempts with AES-256...');
    updateMigrationLoader('Scanning database records...', 20);

    // Yield brief frame for smooth UI transition
    await new Promise(r => setTimeout(r, 160));

    try {
        // Step 1: Local database migration
        if (needsLocalMigration) {
            updateMigrationLoader('Encrypting local database in place...', 45);
            await new Promise(r => setTimeout(r, 180));
            migrateLocalDatabaseToEncrypted();
        }

        // Step 2: Cloud database migration (if signed in)
        if (needsCloudCheck) {
            updateMigrationLoader('Encrypting Puter cloud backups...', 75);
            await new Promise(r => setTimeout(r, 180));
            await migrateCloudDataToEncrypted();
        }

        updateMigrationLoader('Finalizing encryption...', 100);
        await new Promise(r => setTimeout(r, 260));

        console.log('[Crypto Migration] All databases successfully secured.');
        return true;
    } catch (err) {
        console.error('[Crypto Migration] Execution failed:', err);
        return false;
    } finally {
        hideMigrationLoader();
    }
}
