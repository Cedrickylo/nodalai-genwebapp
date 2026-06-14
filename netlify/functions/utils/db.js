// netlify/functions/utils/db.js
const { Pool } = require('pg');

// Construct an active database connection pool using Netlify's secure internal environment link
const pool = new Pool({
  connectionString: process.env.NETLIFY_DB_URL,
  ssl: {
    rejectUnauthorized: false // Required for secure serverless database routing connections
  }
});

let isSchemaInitialized = false;

export async function initializeSchema() {
  // Bypasses queries if the runtime environment already validated the tables
  if (isSchemaInitialized) return pool;

  const client = await pool.connect();
  try {
    // Open a single, programmatic execution transaction block with full Read/Write privileges
    await client.query('BEGIN');

    // 1. CORE PLATFORM CONFIGURATION AND SETTINGS ENGINE
    await client.query(`
      CREATE TABLE IF NOT EXISTS global_settings (
        id INTEGER PRIMARY KEY DEFAULT 1,
        ai_client TEXT DEFAULT 'groq',
        global_rate_limit INTEGER DEFAULT 5,
        version_major INTEGER DEFAULT 1,
        version_minor INTEGER DEFAULT 0,
        version_patch INTEGER DEFAULT 0,
        auto_version BOOLEAN DEFAULT TRUE,
        total_requests_log INTEGER DEFAULT 0,
        CONSTRAINT single_row CHECK (id = 1)
      );
    `);

    // Seed the foundational parameters if the row configuration is empty
    await client.query(`
      INSERT INTO global_settings (id, ai_client, global_rate_limit, version_major, version_minor, version_patch, auto_version, total_requests_log)
      VALUES (1, 'groq', 5, 1, 0, 0, TRUE, 142)
      ON CONFLICT (id) DO NOTHING;
    `);

    // 2. LIVE USER TELEMETRY AND STATUS MATRIX
    await client.query(`
      CREATE TABLE IF NOT EXISTS users_telemetry (
        puter_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        generation_limit INTEGER DEFAULT 5,
        is_active BOOLEAN DEFAULT TRUE,
        last_active_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // 3. WHITELISTED PUTER ADMINISTRATORS
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_whitelist (
        puter_username TEXT PRIMARY KEY,
        assigned_role TEXT DEFAULT 'staff',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Seed your sovereign root account into the whitelist immediately
    await client.query(`
      INSERT INTO admin_whitelist (puter_username, assigned_role)
      VALUES ('cedric', 'owner')
      ON CONFLICT (puter_username) DO NOTHING;
    `);

    // Commit all changes safely to disk
    await client.query('COMMIT');
    isSchemaInitialized = true;
    console.log('✓ Netlify Database Schema self-healed and initialized successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('CRITICAL: Self-healing database initialization pipeline failed:', error);
    throw error;
  } finally {
    client.release();
  }

  return pool;
}

module.exports = {
  pool,
  initializeSchema
};