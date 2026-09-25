// api/generate-quiz.js
// Vercel Serverless Function for Google Gemini Quiz Generation
// Hardened with CORS lockdown, rate limiting, prompt injection defense, and trimmed responses

import { applyCors, checkRateLimit, getClientIp, containsPromptInjection } from './_security.js';

export default async function handler(req, res) {
    // 1. Enforce strict CORS
    const corsAllowed = applyCors(req, res);
    if (!corsAllowed) {
        return res.status(403).json({ error: 'Forbidden: Origin not permitted.' });
    }

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Diagnostic GET health check
    if (req.method === 'GET') {
        const apiKey = process.env.GEMINI_API_KEY;
        return res.status(200).json({
            status: 'ok',
            service: 'Nodal AI Quiz Generation API',
            hasApiKey: !!apiKey,
            defaultModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'
        });
    }

    // Only allow POST requests for generation
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Rate limiting: Max 10 requests per 60 minutes per client IP
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(`quiz_gen_${clientIp}`, 10, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({
            error: 'Rate Limit Exceeded',
            message: `Too many generation requests. Please wait ${Math.ceil(rateCheck.retryAfterSeconds / 60)} minutes before trying again.`,
            retryAfter: rateCheck.retryAfterSeconds
        });
    }

    // 3. Payload size check (Cap at 500KB)
    const rawBodyLength = req.body ? JSON.stringify(req.body).length : 0;
    if (rawBodyLength > 500 * 1024) {
        return res.status(413).json({
            error: 'Payload Too Large',
            message: 'Request payload exceeds maximum permitted size of 500KB.'
        });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'Missing GEMINI_API_KEY environment variable on Vercel.',
                hint: 'Please add GEMINI_API_KEY in your Vercel Project Settings -> Environment Variables and redeploy.'
            });
        }

        const { systemPrompt, userPrompt, model } = req.body || {};
        
        // Build combined prompt content
        const combinedPrompt = systemPrompt 
            ? `${systemPrompt}\n\n${userPrompt || ''}`
            : (userPrompt || '');

        if (!combinedPrompt.trim()) {
            return res.status(400).json({ error: 'Empty prompt provided.' });
        }

        if (combinedPrompt.length > 50000) {
            return res.status(400).json({
                error: 'Prompt Too Long',
                message: 'Combined prompt length exceeds maximum allowed limit of 50,000 characters.'
            });
        }

        // 4. Prompt injection & adversarial instruction override defense
        if (containsPromptInjection(combinedPrompt)) {
            return res.status(400).json({
                error: 'Security Policy Violation',
                message: 'Your prompt contains prohibited instruction override or injection patterns.'
            });
        }

        // Prioritized list of model candidates to guarantee high availability
        const candidateModels = [
            model,
            process.env.GEMINI_MODEL,
            'gemini-3.5-flash-lite',
            'gemini-3.5-flash',
            'gemini-2.5-flash-lite',
            'gemini-2.5-flash'
        ].filter(Boolean);

        // Deduplicate while preserving priority order
        const modelsToTry = [...new Set(candidateModels)];

        let lastError = null;
        let successfulData = null;
        let usedModel = null;

        for (const modelCandidate of modelsToTry) {
            const cleanModel = modelCandidate.replace(/^models\//, '');
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-goog-api-key': apiKey
                    },
                    body: JSON.stringify({
                        contents: [
                            {
                                parts: [
                                    { text: combinedPrompt }
                                ]
                            }
                        ],
                        generationConfig: {
                            temperature: 0.2,
                            responseMimeType: 'application/json'
                        }
                    })
                });

                if (response.ok) {
                    successfulData = await response.json();
                    usedModel = cleanModel;
                    break;
                }

                const errorPayload = await response.text();
                let parsedError = errorPayload;
                try {
                    parsedError = JSON.parse(errorPayload);
                } catch (e) {
                    // Keep raw string if not JSON
                }

                lastError = {
                    status: response.status,
                    model: cleanModel,
                    details: parsedError
                };

                // If 404 (model deprecated or not available for this key), try next candidate
                if (response.status === 404) {
                    console.warn(`Gemini model ${cleanModel} returned 404, attempting fallback candidate...`);
                    continue;
                } else {
                    // For auth errors (401/403) or rate limits (429), stop early
                    break;
                }
            } catch (networkErr) {
                lastError = {
                    status: 500,
                    model: cleanModel,
                    details: networkErr.message
                };
            }
        }

        // 5. Trimmed API Response: Return strictly rawText and model without internal telemetry
        if (successfulData) {
            const rawText = successfulData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            return res.status(200).json({
                rawText,
                model: usedModel
            });
        }

        // If all candidate models failed, check for model deprecation / retirement
        const googleMessage = lastError?.details?.error?.message 
            || (typeof lastError?.details === 'string' ? lastError?.details : null)
            || `Gemini API responded with status ${lastError?.status || 500}`;

        const isModelDeprecation = lastError?.status === 404 || 
            /deprecated|no longer available|shut down|retired|models\/.*is not found/i.test(googleMessage);

        return res.status(502).json({
            error: isModelDeprecation 
                ? 'AI Provider Model Deprecated' 
                : `Gemini API Error: ${googleMessage}`,
            message: isModelDeprecation
                ? 'The built-in AI model is currently unavailable or has been retired by Google. Please contact the developer to update the AI model.'
                : googleMessage,
            isDeprecated: isModelDeprecation,
            failedModel: lastError?.model,
            upstreamStatus: lastError?.status
        });

    } catch (error) {
        return res.status(500).json({
            error: 'Serverless Function Error',
            message: error.message
        });
    }
}
