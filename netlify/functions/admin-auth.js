// =====================================================================
// netlify/functions/admin-auth.js - Secure Admin Gate Proxy
// Handles dual-track verification loops completely on the backend
// =====================================================================

const crypto = require('crypto');

exports.handler = async (event) => {
  // Enforce strict POST tracking method controls
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }) 
    };
  }

  try {
    // 1. CRITICAL ENVIROMENT SANITIZATION & BOUNDARY CHECKS
    const SUPER_USER = process.env.SUPER_ADMIN_USERNAME;
    const SUPER_PASS = process.env.SUPER_ADMIN_PASSWORD;
    const MASTER_PASSPHRASE = process.env.ADMIN_MASTER_PASSPHRASE;

    if (!SUPER_USER || !SUPER_PASS || !MASTER_PASSPHRASE) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Administrative environment keys are unconfigured on the hosting platform dashboard.' 
        })
      };
    }

    // Use a unique server runtime secret derived from environment hashes to sign tokens safely
    const JWT_SECRET = crypto.createHash('sha256').update(SUPER_PASS + MASTER_PASSPHRASE).digest('hex');

    const payload = JSON.parse(event.body || '{}');
    const { type } = payload;

    // =====================================================================
    // TRACK A: INDEPENDENT SUPER ADMIN CONSOLE VALIDATION
    // =====================================================================
    if (type === 'super') {
      const { username, password } = payload;

      // Constant-time style comparisons to mitigate timing-attack vector exploits
      const usernameMatch = crypto.timingSafeEqual(Buffer.from(username), Buffer.from(SUPER_USER));
      const passwordMatch = crypto.timingSafeEqual(Buffer.from(password), Buffer.from(SUPER_PASS));

      if (!usernameMatch || !passwordMatch) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid root master credentials supplied.' })
        };
      }

      // Generate a secure payload token tagged with system root clearance
      const token = generateSecureAdminToken({ role: 'master', user: SUPER_USER }, JWT_SECRET);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, token, role: 'master' })
      };
    }

    // =====================================================================
    // TRACK B: PASSPHRASE MATCH FOR PUTER WHITELIST GATES
    // =====================================================================
    if (type === 'puter') {
      const { passphrase, puterUsername } = payload;

      if (!passphrase || !puterUsername) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing mandatory validation parameters.' })
        };
      }

      const passphraseMatch = crypto.timingSafeEqual(Buffer.from(passphrase), Buffer.from(MASTER_PASSPHRASE));

      if (!passphraseMatch) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid master passphrase.' })
        };
      }

      // Generate a standard administrator context token
      const token = generateSecureAdminToken({ role: 'admin', user: puterUsername }, JWT_SECRET);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ success: true, token, role: 'admin' })
      };
    }

    // Fallback error routing for malformed track injections
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Unsupported authentication profile specification.' })
    };

  } catch (err) {
    console.error('Serverless Auth Error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server boundary execution failure.' })
    };
  }
};

// =====================================================================
// UTILITY CRYPTO SIGNING METHODS
// =====================================================================

function generateSecureAdminToken(claims, secret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  
  // Set explicit token lifespans (expires cleanly in 4 hours parameters)
  const expirationTime = Math.floor(Date.now() / 1000) + (4 * 60 * 60);
  const bodyPayload = Buffer.from(JSON.stringify({ ...claims, exp: expirationTime })).toString('base64url');
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${header}.${bodyPayload}`)
    .digest('base64url');
    
  return `${header}.${bodyPayload}.${signature}`;
}