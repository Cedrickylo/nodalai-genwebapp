// scripts/aiService.js
// Secure Quiz Generation Service using Vercel Serverless Function & Google Gemini 2.5 Flash-Lite

/**
 * Sends prompt to the Vercel serverless function (/api/generate-quiz)
 * The GEMINI_API_KEY is securely held on the Vercel server and never exposed to the client.
 */
export async function requestQuizFromVercel(systemPrompt, userPrompt = '', signal = null) {
    const endpoints = ['/api/generate-quiz', '/.netlify/functions/generate-quiz'];
    let lastError = null;

    for (const endpoint of endpoints) {
        try {
            const fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    systemPrompt,
                    userPrompt
                })
            };

            if (signal) {
                fetchOptions.signal = signal;
            }

            const response = await fetch(endpoint, fetchOptions);

            // If 404 on /api/generate-quiz (e.g. running in netlify dev environment), try fallback
            if (response.status === 404 && endpoint === endpoints[0]) {
                continue;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                const detailedError = errorData.error || errorData.message || `Server responded with status ${response.status}`;
                throw new Error(detailedError);
            }

            const data = await response.json();
            
            // If the server returns rawText directly (from our Vercel function)
            if (data && typeof data.rawText === 'string') {
                return data.rawText;
            }

            return extractTextFromResponse(data);
        } catch (error) {
            // If user or timeout aborted the request, rethrow immediately
            if (error.name === 'AbortError') {
                throw error;
            }
            lastError = error;
            // If not a 404 fallback, throw the error
            if (endpoint === endpoints[endpoints.length - 1] || !error.message?.includes('404')) {
                throw error;
            }
        }
    }

    throw lastError || new Error('Quiz generation service unavailable.');
}

/**
 * Cleans and safely parses raw text from AI response into a valid quiz object.
 * Normalizes question formats, options arrays, and answers for full engine compatibility.
 */
export function cleanAndParseQuizJson(rawText, fallbackFileName = 'Custom Quiz', currentConfig = {}) {
    if (!rawText || typeof rawText !== 'string') {
        throw new Error('Empty response received from AI.');
    }

    let cleaned = rawText.trim();

    // Strip Markdown ```json ... ``` code blocks if present
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
        cleaned = cleaned.replace(/\s*```$/, '');
        cleaned = cleaned.trim();
    }

    // Try finding the first JSON object or array bounds
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIndex = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIndex = firstBrace;
    } else if (firstBracket !== -1) {
        startIndex = firstBracket;
    }

    if (startIndex !== -1) {
        const lastBrace = cleaned.lastIndexOf('}');
        const lastBracket = cleaned.lastIndexOf(']');
        const endIndex = Math.max(lastBrace, lastBracket);
        if (endIndex > startIndex) {
            cleaned = cleaned.slice(startIndex, endIndex + 1);
        }
    }

    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse AI JSON:', cleaned);
        throw new Error('AI returned an invalid JSON format. Please try again.');
    }

    // Extract questions array from common structures
    let questions = [];
    let config = { ...currentConfig };
    let fileName = fallbackFileName;

    if (Array.isArray(parsed)) {
        questions = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.questions)) {
            questions = parsed.questions;
        } else if (parsed.quiz && Array.isArray(parsed.quiz.questions)) {
            questions = parsed.quiz.questions;
        } else if (Array.isArray(parsed.items)) {
            questions = parsed.items;
        }

        if (parsed.config && typeof parsed.config === 'object') {
            config = { ...config, ...parsed.config };
        }
        if (parsed.fileName && typeof parsed.fileName === 'string') {
            fileName = parsed.fileName.trim();
        }
    }

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('AI response did not contain any valid quiz questions.');
    }

    // Normalize each question
    const normalizedQuestions = questions.map((q, index) => {
        let questionText = q.question || q.prompt || q.text || `Question ${index + 1}`;
        let rawAnswer = q.answer !== undefined ? q.answer : (q.correctAnswer !== undefined ? q.correctAnswer : '');
        let type = (q.type || 'multiple-choice').toString().trim().toLowerCase();
        let options = Array.isArray(q.options) ? [...q.options] : [];
        let explanation = (q.explanation || '').toString().trim();

        // Normalize boolean answers
        if (typeof rawAnswer === 'boolean') {
            rawAnswer = rawAnswer ? 'True' : 'False';
        } else if (typeof rawAnswer === 'string') {
            rawAnswer = rawAnswer.trim();
        }

        // True or False normalization
        if (type === 'true-or-false' || (options.length === 2 && options.every(o => typeof o === 'string' && ['true', 'false'].includes(o.trim().toLowerCase())))) {
            type = 'multiple-choice';
            options = ['True', 'False'];
            if (typeof rawAnswer === 'string') {
                rawAnswer = rawAnswer.toLowerCase() === 'true' ? 'True' : 'False';
            }
        }

        // Identification question normalization
        if (type === 'identification') {
            options = [];
        }

        // Enumeration question normalization
        if (type === 'enumeration') {
            options = [];
            if (typeof rawAnswer === 'string') {
                rawAnswer = rawAnswer.split(/[,|\n]/).map(s => s.trim()).filter(Boolean);
            } else if (!Array.isArray(rawAnswer)) {
                rawAnswer = [String(rawAnswer)];
            }
        }

        return {
            question: questionText,
            type,
            options,
            answer: rawAnswer,
            explanation
        };
    });

    return {
        fileName,
        config,
        questions: normalizedQuestions
    };
}

/**
 * Legacy compatibility wrapper for generateQuestionsFromAI
 */
export async function generateQuestionsFromAI(systemPrompt, userPrompt = '', signal = null) {
    return requestQuizFromVercel(systemPrompt, userPrompt, signal);
}

/**
 * Helper to extract text from various AI response schemas
 */
export function extractTextFromResponse(response) {
    if (!response) return '';
    if (typeof response === 'string') return response;

    if (typeof response === 'object') {
        // Direct text property
        if (typeof response.rawText === 'string') return response.rawText;
        if (typeof response.text === 'string') return response.text;
        if (typeof response.content === 'string') return response.content;

        // Gemini candidates structure
        if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
            return response.candidates[0].content.parts[0].text;
        }

        // OpenAI / Groq choices structure
        if (response.choices && response.choices[0]) {
            if (typeof response.choices[0].text === 'string') {
                return response.choices[0].text;
            }
            if (response.choices[0].message?.content) {
                return response.choices[0].message.content;
            }
        }

        // Groq output structures
        if (typeof response.output_text === 'string') {
            return response.output_text;
        }
        if (response.output && Array.isArray(response.output)) {
            return response.output.map(item => {
                if (typeof item === 'string') return item;
                if (item.content && Array.isArray(item.content)) {
                    return item.content.map(chunk => chunk.text || '').join('');
                }
                return '';
            }).join('').trim();
        }

        return JSON.stringify(response);
    }

    return '';
}