// netlify/functions/generate-quiz.js

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Diagnostic check: Is the environment variable even showing up?
    if (!process.env.GROQ_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing GROQ_API_KEY environment variable on Netlify side." })
      };
    }

    const { systemPrompt, userPrompt } = JSON.parse(event.body);

    const response = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'groq/compound-mini',
        input: `${systemPrompt}\n\n${userPrompt}`
      })
    });

    // If Groq rejects the request (e.g., bad key, bad payload architecture), grab its actual response
    if (!response.ok) {
      const groqErrorPayload = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ 
          error: `Groq API responded with status ${response.status}`, 
          details: groqErrorPayload 
        })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };

  } catch (error) {
    // Catch-all for function syntax errors or internal serverless network failures
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Serverless Function Internal Crash", message: error.message })
    };
  }
};