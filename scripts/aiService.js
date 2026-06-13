// aiService.js
// Main function to generate quiz questions using AI

import { state } from './state.js';

const AI_SERVICE = 'groq'; // Change to 'puter' if you want to switch back to Puter AI

export function isUsingPuterAI() {
    // Dynamically respect the administrative override setting if synced
    const activeEngine = (state && state.globalConfig && state.globalConfig.aiClient) ? state.globalConfig.aiClient : 'groq';
    return activeEngine === 'puter';
}

export async function generateQuestionsFromAI(systemPrompt, userPrompt) {
    try {
        const activeEngine = (state && state.globalConfig && state.globalConfig.aiClient) ? state.globalConfig.aiClient : 'groq';

        if (AI_SERVICE === 'puter') {
            const response = await puter.ai.chat(systemPrompt + "\n\n" + userPrompt);
            return extractTextFromResponse(response);
        }

        // Call your new secure Netlify function
        const response = await fetch('/.netlify/functions/generate-quiz', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            systemPrompt: systemPrompt,
            userPrompt: userPrompt
        })
    });

    if (!response.ok) {
        // Attempt to extract our custom verbose error payload
        const errorData = await response.json().catch(() => ({}));
        console.error("Detailed Server Error Payload:", errorData);
        
        throw new Error(errorData.error || `Netlify Function error: ${response.status}`);
    }

    const data = await response.json();
    return extractTextFromResponse(data);   
    } catch (error) {
        console.error('AI Service Error:', error);
        throw error;
    }
}

// ... keep your extractTextFromResponse function and the rest of the file exactly as is ...

// Helper function to extract text from various AI response formats
// This handles different response structures from different AI providers
// export async function generateQuestionsFromAI(systemPrompt, userPrompt) {
//     const response = await fetch("https://api.openai.com/v1/chat/completions", {
//         method: "POST",
//         headers: {
//             "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`, // Secure this in production!
//             "Content-Type": "application/json"
//         },
//         body: JSON.stringify({
//             model: "gpt-4o-mini", // Use gpt-4o-mini for speed and cost-effectiveness
//             messages: [
//                 { role: "system", content: systemPrompt },
//                 { role: "user", content: userPrompt }
//             ],
//             temperature: 0.2
//         })
//     });

//     if (!response.ok) {
//         const errorData = await response.json();
//         throw new Error(`OpenAI API error: ${errorData.error.message}`);
//     }

//     const data = await response.json();
//     return data.choices[0].message.content; // This returns the AI's actual text
// }

function extractTextFromResponse(response) {
    if (!response) {
        return '';
    }
    
    // If response is already a string, return it
    if (typeof response === 'string') {
        return response;
    }
    
    // If response is an object, try various common structures
    if (typeof response === 'object') {
        // OpenRouter/ChatGPT-like format
        if (response.message && response.message.content && Array.isArray(response.message.content) && 
            response.message.content[0] && typeof response.message.content[0].text === 'string') {
            return response.message.content[0].text;
        }
        
        // Simple content field
        if (typeof response.content === 'string') {
            return response.content;
        }
        
        // Simple text field
        if (typeof response.text === 'string') {
            return response.text;
        }
        
        // Message with content string
        if (response.message && typeof response.message.content === 'string') {
            return response.message.content;
        }
        
        // Choices array format (OpenAI-like)
        if (response.choices && response.choices[0]) {
            if (typeof response.choices[0].text === 'string') {
                return response.choices[0].text;
            }
            if (response.choices[0].message && typeof response.choices[0].message.content === 'string') {
                return response.choices[0].message.content;
            }
        }
        
        // Groq response output_text
        if (typeof response.output_text === 'string') {
            return response.output_text;
        }
        
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
            if (outputText) {
                return outputText;
            }
        }
        
        // Groq-like response format
        if (response.choices && Array.isArray(response.choices) && response.choices[0] && typeof response.choices[0].message?.content === 'string') {
            return response.choices[0].message.content;
        }
        
        // Fallback: stringify the entire response
        return JSON.stringify(response);
    }
    
    return '';
}

// ===== TEMPLATE FOR OTHER AI SERVICES =====
// Below are templates for swapping to different AI providers.
// Replace generateQuestionsFromAI() with your chosen provider.

// Example: OpenRouter (Uncomment and modify to use)
/*
export async function generateQuestionsFromAI(systemPrompt, userPrompt) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${YOUR_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "model": "google/gemini-2.0-flash-exp",
            "messages": [
                { "role": "system", "content": systemPrompt },
                { "role": "user", "content": userPrompt }
            ]
        })
    });
    
    if (!response.ok) {
        throw new Error(`OpenRouter API error: ${response.status}`);
    }
    
    const data = await response.json();
    return extractTextFromResponse(data);
}
*/

// Example: Claude API (Uncomment and modify to use)
/*
export async function generateQuestionsFromAI(systemPrompt, userPrompt) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": YOUR_CLAUDE_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify({
            "model": "claude-3-opus-20240229",
            "max_tokens": 2048,
            "system": systemPrompt,
            "messages": [{ "role": "user", "content": userPrompt }]
        })
    });
    
    const data = await response.json();
    return extractTextFromResponse(data);
}
*/