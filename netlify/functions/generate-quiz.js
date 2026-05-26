// netlify/functions/generate-quiz.js

exports.handler = async (event) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parse the prompts sent from your frontend
    const { systemPrompt, userPrompt } = JSON.parse(event.body);

    // Make the secure call to Groq
    const response = await fetch('https://api.groq.com/openai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}` // Pulls the hidden key from Netlify
      },
      body: JSON.stringify({
        model: 'groq/compound-mini',
        input: `${systemPrompt}\n\n${userPrompt}`
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Send the raw Groq response back to your frontend
    return {
      statusCode: 200,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to communicate with Groq API' })
    };
  }
};