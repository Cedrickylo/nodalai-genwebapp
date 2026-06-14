// =====================================================================
// netlify/functions/user-checkin.js - Automated Client Logging Hook
// Tracks and records live user check-ins into the Postgres Database
// =====================================================================

const { initializeSchema } = require('./utils/db');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { puterId, displayName } = JSON.parse(event.body || '{}');
    if (!puterId || !displayName) {
      return { statusCode: 400, body: 'Missing identification requirements.' };
    }

    const pool = await initializeSchema();

    // Clean atomic relational database Upsert operation 
    const result = await pool.query(`
      INSERT INTO users_telemetry (puter_id, display_name, last_active_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (puter_id) DO UPDATE 
      SET display_name = EXCLUDED.display_name, last_active_at = NOW()
      RETURNING is_active;
    `, [puterId, displayName]);

    const isActive = result.rows[0] ? result.rows[0].is_active : true;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, isActive })
    };
  } catch (err) {
    console.error('Check-in Log Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};