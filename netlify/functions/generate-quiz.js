// netlify/functions/generate-quiz.js — Multi-provider AI gateway

exports.handler = async (event) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const { provider = 'groq', systemPrompt, userPrompt, userApiKey } = JSON.parse(event.body);

    // Determine which API key to use (user's key takes priority)
    const envKeyMap = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY'
    };

    const apiKey = userApiKey || process.env[envKeyMap[provider]];
    if (!apiKey) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          error: `No API key for ${provider}. Set it in the provider settings or add ${envKeyMap[provider]} in Netlify env vars.`
        })
      };
    }

    let result;

    switch (provider) {
      case 'groq':
        result = await callGroq(apiKey, systemPrompt, userPrompt);
        break;
      case 'openai':
        result = await callOpenAI(apiKey, systemPrompt, userPrompt);
        break;
      case 'anthropic':
        result = await callAnthropic(apiKey, systemPrompt, userPrompt);
        break;
      case 'gemini':
        result = await callGemini(apiKey, systemPrompt, userPrompt);
        break;
      default:
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: `Unknown provider: ${provider}` }) };
    }

    return { statusCode: 200, headers: corsHeaders, body: JSON.stringify(result) };

  } catch (error) {
    console.error('generate-quiz error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message || 'Internal server error' })
    };
  }
};

// ===== Provider Adapters =====

async function callGroq(apiKey, systemPrompt, userPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'groq/compound-mini',
      input: `${systemPrompt}\n\n${userPrompt}`
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API ${res.status}: ${err}`);
  }
  return res.json();
}

async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API ${res.status}: ${err}`);
  }
  return res.json();
}

async function callAnthropic(apiKey, systemPrompt, userPrompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err}`);
  }
  return res.json();
}

async function callGemini(apiKey, systemPrompt, userPrompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }]
      })
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  // Gemini wraps response differently — extract the text
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return { output_text: text || JSON.stringify(data) };
}
