// aiService.js — Multi-provider AI service with fallback routing

// Available providers and their config
const PROVIDERS = {
    groq: { name: 'Groq', free: true, models: ['groq/compound-mini'] },
    openai: { name: 'OpenAI', free: false, models: ['gpt-4o-mini'] },
    anthropic: { name: 'Claude', free: false, models: ['claude-3-5-sonnet-20241022'] },
    gemini: { name: 'Gemini', free: false, models: ['gemini-2.0-flash'] }
};

// Fallback order (tries providers in sequence on failure)
const FALLBACK_ORDER = ['groq', 'openai', 'anthropic', 'gemini'];

// LocalStorage key for user preferences
const PROVIDER_KEY = 'nodal_preferred_provider';
const USER_API_KEY_PREFIX = 'nodal_user_api_key_';

export function isUsingPuterAI() {
    return false; // Puter AI is no longer used
}

export function getAvailableProviders() {
    return PROVIDERS;
}

export function getCurrentProvider() {
    return localStorage.getItem(PROVIDER_KEY) || 'groq';
}

export function setCurrentProvider(provider) {
    if (PROVIDERS[provider]) {
        localStorage.setItem(PROVIDER_KEY, provider);
    }
}

export function setUserApiKey(provider, apiKey) {
    if (apiKey) {
        localStorage.setItem(USER_API_KEY_PREFIX + provider, apiKey);
    } else {
        localStorage.removeItem(USER_API_KEY_PREFIX + provider);
    }
}

export function getUserApiKey(provider) {
    return localStorage.getItem(USER_API_KEY_PREFIX + provider) || '';
}

export function hasUserApiKey(provider) {
    return !!getUserApiKey(provider);
}

export async function generateQuestionsFromAI(systemPrompt, userPrompt) {
    const preferred = getCurrentProvider();
    const triedProviders = [];

    // Build ordered list: preferred provider first, then fallbacks
    const providerOrder = [preferred, ...FALLBACK_ORDER.filter(p => p !== preferred)];

    for (const provider of providerOrder) {
        if (triedProviders.includes(provider)) continue;
        triedProviders.push(provider);

        try {
            console.log(`[AI] Trying provider: ${provider}`);
            const result = await callProvider(provider, systemPrompt, userPrompt);
            console.log(`[AI] Success with provider: ${provider}`);
            return result;
        } catch (error) {
            console.warn(`[AI] Provider ${provider} failed:`, error.message);
            // Continue to next provider
        }
    }

    throw new Error('All AI providers failed. Please check your API keys and try again.');
}

async function callProvider(provider, systemPrompt, userPrompt) {
    const userKey = getUserApiKey(provider);

    const response = await fetch('/.netlify/functions/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider,
            systemPrompt,
            userPrompt,
            userApiKey: userKey || undefined
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Provider error: ${response.status}`);
    }

    const data = await response.json();
    return extractTextFromResponse(data);
}

function extractTextFromResponse(response) {
    if (!response) return '';
    if (typeof response === 'string') return response;

    if (typeof response === 'object') {
        // OpenRouter/ChatGPT-like format
        if (response.message?.content && Array.isArray(response.message.content) &&
            response.message.content[0] && typeof response.message.content[0].text === 'string') {
            return response.message.content[0].text;
        }

        if (typeof response.content === 'string') return response.content;
        if (typeof response.text === 'string') return response.text;
        if (response.message && typeof response.message.content === 'string') return response.message.content;

        // Choices array format (OpenAI-like)
        if (response.choices && response.choices[0]) {
            if (typeof response.choices[0].text === 'string') return response.choices[0].text;
            if (response.choices[0].message && typeof response.choices[0].message.content === 'string') {
                return response.choices[0].message.content;
            }
        }

        // Groq response output_text
        if (typeof response.output_text === 'string') return response.output_text;

        // Groq output array structures
        if (response.output && Array.isArray(response.output)) {
            const outputText = response.output
                .map(item => {
                    if (typeof item === 'string') return item;
                    if (item.content && Array.isArray(item.content)) {
                        return item.content.map(chunk => chunk.text || '').join('');
                    }
                    return '';
                })
                .join('')
                .trim();
            if (outputText) return outputText;
        }

        return JSON.stringify(response);
    }
    return '';
}
