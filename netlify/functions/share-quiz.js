// netlify/functions/share-quiz.js
// Handles creating and deleting shared quiz links via Supabase

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
    if (event.httpMethod === 'POST') {
      // Create a new shared quiz link
      const { quizData, fileName, config, userId, days } = JSON.parse(event.body);

      if (!quizData || !fileName) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing quizData or fileName' }) };
      }

      // Generate a short random ID
      const id = Math.random().toString(36).substring(2, 8);
      const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase.from('shared_quizzes').insert({
        id,
        quiz_data: quizData,
        file_name: fileName,
        config: config || null,
        user_id: userId || null,
        expires_at: expiresAt,
        is_active: true
      });

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ id, expiresAt })
      };

    } else if (event.httpMethod === 'DELETE') {
      // Deactivate a shared quiz
      const { id } = JSON.parse(event.body);

      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };
      }

      const { error } = await supabase
        .from('shared_quizzes')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('share-quiz error:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
