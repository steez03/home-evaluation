// api/verify-code.js
// Validates the submitted code against the signed token issued by send-code.js
// No shared server-side storage — works perfectly across serverless instances.
//
// Required environment variables:
//   TOKEN_SECRET — same value as in send-code.js

const crypto = require('crypto');

function verifyToken(email, code, token) {
  const secret = process.env.TOKEN_SECRET || 'arzadon-realty-fallback-secret';

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  } catch {
    return { valid: false, error: 'Invalid token.' };
  }

  const { payload, sig } = parsed;

  // Re-compute HMAC and compare
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expectedSig !== sig) {
    return { valid: false, error: 'Invalid token.' };
  }

  // Parse payload: email:code:expires
  const parts = payload.split(':');
  if (parts.length < 3) return { valid: false, error: 'Malformed token.' };

  const [tokenEmail, tokenCode, tokenExpires] = parts;

  // Check expiry
  if (Date.now() > parseInt(tokenExpires, 10)) {
    return { valid: false, error: 'Code has expired. Please request a new one.' };
  }

  // Check email matches
  if (tokenEmail !== email.toLowerCase().trim()) {
    return { valid: false, error: 'Email mismatch.' };
  }

  // Check code matches
  if (tokenCode !== code.trim()) {
    return { valid: false, error: 'Incorrect code. Please try again.' };
  }

  return { valid: true };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code, token } = req.body || {};

  if (!email || !code || !token) {
    return res.status(400).json({ error: 'Email, code, and token are required.' });
  }

  const result = verifyToken(email, code, token);

  if (!result.valid) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(200).json({ success: true, verified: true });
};
