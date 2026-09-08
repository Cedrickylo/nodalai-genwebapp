// api/generate-quiz.js
// Vercel Serverless Function for Google Gemini 2.5 Flash-Lite Quiz Generation

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // CORS headers for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
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
        const selectedModel = model || process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
        
        // Build combined prompt content
        const combinedPrompt = systemPrompt 
            ? `${systemPrompt}\n\n${userPrompt || ''}`
            : (userPrompt || '');

        if (!combinedPrompt.trim()) {
            return res.status(400).json({ error: 'Empty prompt provided.' });
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
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

        if (!response.ok) {
            const errorPayload = await response.text();
            let parsedError = errorPayload;
            try { 
                parsedError = JSON.parse(errorPayload); 
            } catch (e) {
                // Keep as raw text if not JSON
            }
            return res.status(response.status).json({
                error: `Gemini API responded with status ${response.status}`,
                details: parsedError
            });
        }

        const data = await response.json();
        
        // Extract generated text from Gemini response structure
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        return res.status(200).json({
            rawText,
            data
        });
    } catch (error) {
        return res.status(500).json({
            error: 'Serverless Function Error',
            message: error.message
        });
    }
}
