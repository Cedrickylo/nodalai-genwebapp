// api/shorten.js
// Vercel Serverless Function for Shortening Quiz Share Links
// Hardened with CORS lockdown, rate limiting, and strict URL validation

import { applyCors, checkRateLimit, getClientIp } from './_security.js';

export default async function handler(req, res) {
    // 1. Strict CORS validation
    const corsAllowed = applyCors(req, res);
    if (!corsAllowed) {
        return res.status(403).json({ error: 'Forbidden: Origin not permitted.' });
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Health check endpoint
    if (req.method === 'GET') {
        return res.status(200).json({
            status: 'ok',
            service: 'Nodal AI Link Shortener API',
            providers: ['tinyurl', 'cleanuri']
        });
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Rate limiting: Max 15 shorten requests per minute per IP
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`shorten_${clientIp}`, 15, 60 * 1000);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: `Too many link shortening requests. Please wait ${rateCheck.retryAfterSeconds} seconds.`,
            retryAfter: rateCheck.retryAfterSeconds
        });
    }

    try {
        const { url } = req.body || {};
        
        // 3. Strict URL validation
        if (!url || typeof url !== 'string' || url.length > 2048) {
            return res.status(400).json({ error: 'A valid http(s) URL under 2048 characters is required.' });
        }

        let parsedUrl;
        try {
            parsedUrl = new URL(url);
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                return res.status(400).json({ error: 'Only http and https protocols are supported.' });
            }
        } catch (e) {
            return res.status(400).json({ error: 'Invalid URL format provided.' });
        }

        // 1. Primary Provider: TinyURL API
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const tinyRes = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (tinyRes.ok) {
                const shortUrl = (await tinyRes.text()).trim();
                if (shortUrl && shortUrl.startsWith('https://tinyurl.com/')) {
                    return res.status(200).json({
                        shortUrl,
                        provider: 'tinyurl',
                        originalUrl: url
                    });
                }
            }
        } catch (tinyErr) {
            console.warn('[Shorten API] TinyURL provider failed, trying fallback:', tinyErr.message);
        }

        // 2. Secondary Provider: CleanURI API (automated fallback)
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const cleanRes = await fetch('https://cleanuri.com/api/v1/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `url=${encodeURIComponent(url)}`,
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (cleanRes.ok) {
                const cleanData = await cleanRes.json();
                if (cleanData && cleanData.result_url) {
                    return res.status(200).json({
                        shortUrl: cleanData.result_url,
                        provider: 'cleanuri',
                        originalUrl: url
                    });
                }
            }
        } catch (cleanErr) {
            console.warn('[Shorten API] CleanURI fallback provider failed:', cleanErr.message);
        }

        // 3. Graceful Fallback: If external shorteners are unavailable, return original URL safely
        return res.status(200).json({
            shortUrl: null,
            fallbackUrl: url,
            message: 'External shorteners temporarily unavailable, fallback to full URL.'
        });

    } catch (err) {
        console.error('[Shorten API] Unexpected server error:', err);
        return res.status(500).json({
            error: err.message || 'Internal server error while shortening link',
            fallbackUrl: req.body?.url || null
        });
    }
}
