// api/shorten.js
// Vercel Serverless Function for Shortening Quiz Share Links
// High-availability multi-provider architecture: TinyURL with CleanURI fallback

export default async function handler(req, res) {
    // Enable CORS for web client requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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

    try {
        const { url } = req.body || {};
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return res.status(400).json({ error: 'A valid http(s) URL is required.' });
        }

        // 1. Primary Provider: TinyURL API (fast, reliable, permanent links)
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
