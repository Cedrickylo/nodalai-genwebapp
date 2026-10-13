// api/_security.js
// Shared Security Helpers for Nodal AI Vercel Serverless Functions

// Allowed CORS origins: production domains, vercel preview deployments, localhost
const ALLOWED_ORIGIN_PATTERNS = [
    /^https:\/\/nodal-gamma\.vercel\.app$/,
    /^https:\/\/.*\.vercel\.app$/,
    /^http:\/\/localhost(:\d+)?$/,
    /^http:\/\/127\.0\.0\.1(:\d+)?$/
];

/**
 * Validates and locks down CORS headers based on request origin
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if origin is allowed or same-origin, false if blocked
 */
export function applyCors(req, res) {
    const origin = req.headers.origin;

    // Same-origin or non-browser server-to-server request (no Origin header)
    if (!origin) {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token');
        return true;
    }

    const isAllowed = ALLOWED_ORIGIN_PATTERNS.some(pattern => pattern.test(origin));

    if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-csrf-token');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.setHeader('Vary', 'Origin');
        return true;
    }

    // Origin not permitted
    res.setHeader('Vary', 'Origin');
    return false;
}

// In-memory sliding window rate limiter
const rateLimitMap = new Map();

/**
 * Checks whether an IP / key has exceeded allowed requests within a time window
 * @param {string} key Unique identifier (e.g. client IP + action)
 * @param {number} maxRequests Maximum requests permitted
 * @param {number} windowMs Time window in milliseconds
 * @returns {{ allowed: boolean, remaining: number, retryAfterSeconds: number }}
 */
export function checkRateLimit(key, maxRequests, windowMs) {
    const now = Date.now();
    let record = rateLimitMap.get(key);

    // Prune stale records if map grows large (> 10,000 entries)
    if (rateLimitMap.size > 10000) {
        for (const [k, v] of rateLimitMap.entries()) {
            if (now - v.firstRequest > 24 * 60 * 60 * 1000) {
                rateLimitMap.delete(k);
            }
        }
    }

    if (!record || (now - record.firstRequest > windowMs)) {
        rateLimitMap.set(key, { count: 1, firstRequest: now });
        return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
    }

    if (record.count >= maxRequests) {
        const retryAfterSeconds = Math.ceil((record.firstRequest + windowMs - now) / 1000);
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }

    record.count++;
    return { allowed: true, remaining: maxRequests - record.count, retryAfterSeconds: 0 };
}

/**
 * Extracts client IP from standard proxy headers
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return String(forwarded).split(',')[0].trim();
    }
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || '127.0.0.1';
}

// Common prompt injection keywords and adversarial jailbreak patterns
const PROMPT_INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    /disregard\s+(all\s+)?(previous|prior|above)\s+instructions/i,
    /you\s+are\s+now\s+in\s+dan\s+mode/i,
    /\bjailbreak\b/i,
    /(override|reveal|output|print|dump|leak|bypass)\s+(the\s+)?(system\s+prompt|initial\s+prompt|developer\s+prompt)/i,
    /\bsystem\s+override\b/i,
    /reveal\s+(your\s+)?(hidden\s+)?instructions/i,
    /do\s+anything\s+now\b/i,
    /pretend\s+you\s+have\s+no\s+rules/i,
    /forget\s+(all\s+)?your\s+rules/i,
    /roleplay\s+as\s+an\s+unfiltered\s+ai/i
];

/**
 * Checks text against prompt injection patterns
 * @param {string} text
 * @returns {boolean} true if an injection pattern is detected
 */
export function containsPromptInjection(text) {
    if (!text || typeof text !== 'string') return false;
    return PROMPT_INJECTION_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Server-side security and safety validation for user custom prompt instructions
 * @param {string} text
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function validateCustomInstructionContent(text) {
    if (!text || typeof text !== 'string') {
        return { allowed: true };
    }
    const trimmed = text.trim();
    if (!trimmed) {
        return { allowed: true };
    }
    if (trimmed.length > 300) {
        return { allowed: false, reason: 'Custom instruction exceeds maximum allowed length of 300 characters.' };
    }
    if (/[\x00-\x1F\x7F\u200B-\u200D\uFEFF\u202E]/.test(trimmed)) {
        return { allowed: false, reason: 'Custom instruction contains prohibited control characters.' };
    }
    if (/\b(select\s+.*?\s+from|insert\s+into|update\s+.*?\s+set|delete\s+from|drop\s+(table|database|view|index)|union\s+(all\s+)?select|alter\s+table|exec(\s*\(|\s+xp_)|truncate\s+table|information_schema)\b/i.test(trimmed) ||
        /(?:--|\/\*|\*\/|;\s*(?:drop|delete|insert|update|select|alter))/i.test(trimmed) ||
        /\b(or|and)\s+['"\d\w]+\s*=\s*['"\d\w]+/i.test(trimmed)) {
        return { allowed: false, reason: 'Custom instruction contains prohibited database or code injection syntax.' };
    }
    if (/<\s*(script|iframe|object|embed|svg|style|link|img|meta|form|input|button)\b/i.test(trimmed) ||
        /javascript:\s*/i.test(trimmed) ||
        /on[a-z]+\s*=\s*['"][^'"]*['"]/i.test(trimmed) ||
        /[<>]|\{\{|\}\}|\$\{|\<%|\%>/.test(trimmed)) {
        return { allowed: false, reason: 'Custom instruction contains prohibited HTML tags, script, or template syntax.' };
    }
    if (containsPromptInjection(trimmed)) {
        return { allowed: false, reason: 'Custom instruction contains prohibited prompt override or jailbreak keywords.' };
    }
    if (/\b(porn|pornography|erotic|nsfw|sexually|nude|nudity|fuck|shit|bitch|cunt|asshole|dick|cock|pussy|whore|slut)\b/i.test(trimmed) ||
        /\b(nigger|nigga|faggot|dyke|retard|chink|kike|spic)\b/i.test(trimmed) ||
        /\b(how\s+to\s+make\s+a\s+bomb|pipe\s+bomb|mass\s+shooting|kill\s+yourself|commit\s+suicide|terrorist|assassinate)\b/i.test(trimmed) ||
        /\b(i\s+will\s+kill|die\s+in\s+a\s+fire|i\s+hate\s+you\s+all)\b/i.test(trimmed)) {
        return { allowed: false, reason: 'Custom instruction contains inappropriate, unsafe, or sensitive content.' };
    }
    return { allowed: true };
}

/**
 * Validates CSRF token / custom header for state-changing requests
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
export function validateCsrf(req) {
    // GET and OPTIONS are idempotent
    if (req.method === 'GET' || req.method === 'OPTIONS') {
        return true;
    }

    const csrfHeader = req.headers['x-csrf-token'];
    const customRequestedWith = req.headers['x-requested-with'];
    
    // Accept valid custom anti-CSRF header or standard application/json header
    if (csrfHeader && csrfHeader.length >= 8) {
        return true;
    }
    if (customRequestedWith && customRequestedWith.toLowerCase() === 'xmlhttprequest') {
        return true;
    }
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
        return true;
    }

    return false;
}

// In-memory account lockout tracker (5 failed attempts = 15-minute lockout)
const failedAttemptsMap = new Map();

/**
 * Records a failed login/auth attempt and checks if account is locked
 * @param {string} identifier (IP or username/email)
 * @returns {{ locked: boolean, remainingAttempts: number, lockoutSeconds: number }}
 */
export function recordFailedAuth(identifier) {
    const now = Date.now();
    const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_FAILED_ATTEMPTS = 5;

    let record = failedAttemptsMap.get(identifier);
    if (!record || (now - record.firstAttempt > LOCKOUT_DURATION_MS && !record.locked)) {
        failedAttemptsMap.set(identifier, { attempts: 1, firstAttempt: now, locked: false, lockUntil: 0 });
        return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - 1, lockoutSeconds: 0 };
    }

    if (record.locked) {
        if (now < record.lockUntil) {
            const lockoutSeconds = Math.ceil((record.lockUntil - now) / 1000);
            return { locked: true, remainingAttempts: 0, lockoutSeconds };
        }
        // Lockout expired, reset
        failedAttemptsMap.set(identifier, { attempts: 1, firstAttempt: now, locked: false, lockUntil: 0 });
        return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - 1, lockoutSeconds: 0 };
    }

    record.attempts++;
    if (record.attempts >= MAX_FAILED_ATTEMPTS) {
        record.locked = true;
        record.lockUntil = now + LOCKOUT_DURATION_MS;
        logSecurityEvent('ACCOUNT_LOCKED', { identifier, lockoutDurationMinutes: 15 });
        return { locked: true, remainingAttempts: 0, lockoutSeconds: 15 * 60 };
    }

    return { locked: false, remainingAttempts: MAX_FAILED_ATTEMPTS - record.attempts, lockoutSeconds: 0 };
}

/**
 * Resets failed auth record upon successful login
 * @param {string} identifier
 */
export function clearFailedAuth(identifier) {
    failedAttemptsMap.delete(identifier);
}

/**
 * Logs security events with timestamp and client context
 * @param {string} eventType
 * @param {object} details
 */
export function logSecurityEvent(eventType, details = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level: 'SECURITY_AUDIT',
        eventType,
        ...details
    };
    console.warn(`[SECURITY EVENT] ${JSON.stringify(logEntry)}`);
}

/**
 * Sanitizes user input string before storage or processing
 * @param {string} input
 * @returns {string}
 */
export function sanitizeInput(input) {
    if (typeof input !== 'string') return '';
    return input
        .replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F]/g, '') // remove control chars
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

