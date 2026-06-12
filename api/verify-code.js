// api/verify-code.js
// Validates the 6-digit code submitted by the client

const codeStore = {};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required' });
  }

  const key = email.toLowerCase().trim();
  const record = codeStore[key];

  if (!record) {
    return res.status(400).json({ error: 'No code found for this email. Please request a new code.' });
  }

  if (Date.now() > record.expires) {
    delete codeStore[key];
    return res.status(400).json({ error: 'Code has expired. Please request a new one.' });
  }

  record.attempts = (record.attempts || 0) + 1;
  if (record.attempts > 5) {
    delete codeStore[key];
    return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
  }

  if (record.code !== code.trim()) {
    return res.status(400).json({ error: 'Incorrect code. Please try again.' });
  }

  delete codeStore[key];
  return res.status(200).json({ success: true, verified: true });
};
