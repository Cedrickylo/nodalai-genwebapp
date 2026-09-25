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
