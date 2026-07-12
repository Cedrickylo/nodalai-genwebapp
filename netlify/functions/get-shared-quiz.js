// netlify/functions/get-shared-quiz.js
// Retrieves a shared quiz by short ID, auto-deactivates expired ones

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ccuobbbzitsdivdtnuwm.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing SUPABASE_SERVICE_KEY' }) };
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const id = event.queryStringParameters?.id;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id parameter' }) };
    }

    const { data: quiz, error } = await supabase
      .from('shared_quizzes')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !quiz) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Quiz not found' }) };
    }

    // Check if expired
    if (new Date(quiz.expires_at) <= new Date()) {
      // Auto-deactivate expired quiz
      await supabase
        .from('shared_quizzes')
        .update({ is_active: false })
        .eq('id', id);

      return { statusCode: 410, headers, body: JSON.stringify({ error: 'This shared link has expired.' }) };
    }

    if (!quiz.is_active) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'This shared link has been deactivated.' }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        n: quiz.file_name,
        c: quiz.config,
        q: quiz.quiz_data
      })
    };

  } catch (err) {
    console.error('get-shared-quiz error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
