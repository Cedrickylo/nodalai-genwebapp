// =====================================================================
// netlify/functions/admin-data.js - Secure Admin Data Proxy Engine
// Handles all administrative CRUD tasks against the Postgres Database
// =====================================================================

const crypto = require('crypto');
const { initializeSchema } = require('./utils/db');

exports.handler = async (event) => {
  // Handle pre-flight CORS options requests if necessary
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '' };
  }

  try {
    // 1. SESSION TOKEN VALIDATION GATE
    const authHeader = event.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Missing administrative authorization token.' }) };
    }
    
    const token = authHeader.split(' ')[1];
    const pool = await initializeSchema();
    
    // Derive the signing secret using the exact protocol established in admin-auth.js
    const JWT_SECRET = crypto.createHash('sha256').update(process.env.SUPER_ADMIN_PASSWORD + process.env.ADMIN_MASTER_PASSPHRASE).digest('hex');
    
    const decodedToken = verifyAdminToken(token, JWT_SECRET);
    if (!decodedToken) {
      return { statusCode: 403, body: JSON.stringify({ error: 'Session token has expired or is invalid.' }) };
    }

    // =====================================================================
    // GET METHOD: READ GLOBAL METRICS AND TABLES DIRECTORY
    // =====================================================================
    if (event.httpMethod === 'GET') {
      // Pull global configuration values
      const settingsResult = await pool.query('SELECT * FROM global_settings WHERE id = 1');
      const globalConfig = settingsResult.rows[0] || {};

      // FIX: Wrapped the reserved keyword 'limit' in double quotes ("limit") to prevent Postgres syntax crash
      const usersResult = await pool.query('SELECT puter_id AS id, display_name AS name, usage_count AS usage, generation_limit AS "limit", is_active AS active FROM users_telemetry ORDER BY last_active_at DESC');
      
      // Pull dynamic whitelisted sub-administrators usernames
      const adminsResult = await pool.query('SELECT puter_username FROM admin_whitelist ORDER BY created_at ASC');
      const subAdmins = adminsResult.rows.map(row => row.puter_username);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, globalConfig, users: usersResult.rows, subAdmins })
      };
    }

    // =====================================================================
    // POST METHOD: EXECUTE WRITE & UPDATE MODIFICATIONS
    // =====================================================================
    if (event.httpMethod === 'POST') {
      const payload = JSON.parse(event.body || '{}');
      const { action } = payload;

      // Pipeline A: Commit Global Website Configuration Adjustments
      if (action === 'updateSettings') {
        const { aiClient, rateLimit, versionMajor, versionMinor, versionPatch, autoVersion } = payload;
        
        await pool.query(`
          UPDATE global_settings 
          SET ai_client = $1, global_rate_limit = $2, version_major = $3, version_minor = $4, version_patch = $5, auto_version = $6
          WHERE id = 1
        `, [aiClient, rateLimit, versionMajor, versionMinor, versionPatch, autoVersion]);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Global options saved successfully.' }) };
      }

      // Pipeline B: Overwrite Specific User Profile Settings Constraints
      if (action === 'editUserProfile') {
        const { userId, name, limit } = payload;

        await pool.query(`
          UPDATE users_telemetry 
          SET display_name = $1, generation_limit = $2 
          WHERE puter_id = $3
        `, [name, limit, userId]);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'User profile overridden.' }) };
      }

      // Pipeline C: Freeze/Unfreeze User Account Accounts (Banning Switch)
      if (action === 'toggleUserStatus') {
        const { userId, active } = payload;

        await pool.query(`
          UPDATE users_telemetry 
          SET is_active = $1 
          WHERE puter_id = $2
        `, [active, userId]);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'User status successfully modified.' }) };
      }

      // Pipeline D: Grant Sub-Admin Privileges Handle Links
      if (action === 'registerAdmin') {
        const { username } = payload;

        await pool.query(`
          INSERT INTO admin_whitelist (puter_username, assigned_role) 
          VALUES ($1, 'staff') 
          ON CONFLICT (puter_username) DO NOTHING
        `, [username.toLowerCase().trim()]);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Admin account added.' }) };
      }

      // Pipeline E: Revoke Sub-Admin Access
      if (action === 'revokeAdmin') {
        const { username } = payload;
        if (username.toLowerCase().trim() === 'cedric') {
          return { statusCode: 400, body: JSON.stringify({ error: 'Cannot revoke sovereign root owner permissions.' }) };
        }

        await pool.query('DELETE FROM admin_whitelist WHERE puter_username = $1', [username.toLowerCase().trim()]);
        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Admin revoked successfully.' }) };
      }
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported request pipeline routing parameters.' }) };

  } catch (err) {
    console.error('Database Operation Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Serverless database operation failure.', details: err.message })
    };
  }
};

// Cryptographic token validation wrapper method
function verifyAdminToken(token, secret) {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    
    // Re-verify cryptographic HMAC signature integrity blocks
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');
      
    if (signatureB64 !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    
    // Check if session token expiration time index has passed
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch (e) {
    return null;
  }
}