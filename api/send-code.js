// api/send-code.js
// Generates a 6-digit code, emails it via SendGrid,
// and returns a signed HMAC token to the browser.
// No shared server-side storage needed - works across serverless instances.
//
// Required environment variables:
//   SENDGRID_API_KEY  - your SendGrid API key (SG.xxx)
//   FROM_EMAIL        - verified sender email in SendGrid
//   TOKEN_SECRET      - any long random string you make up (e.g. "arzadon-realty-2025-secret-xyz")

const crypto = require('crypto');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function signToken(email, code, expires) {
  const secret = process.env.TOKEN_SECRET || 'arzadon-realty-fallback-secret';
  const payload = `${email.toLowerCase().trim()}:${code}:${expires}`;
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // Encode payload + sig as base64 so it's safe to pass in JSON
  return Buffer.from(JSON.stringify({ payload, sig })).toString('base64');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, fname } = req.body || {};
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  const code = generateCode();
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
  const token = signToken(email, code, expires);

  try {
    const sgResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: {
          email: process.env.FROM_EMAIL || 'bernard@arzadonrealty.com',
          name: 'Bernard Arzadon, Arzadon Realty'
        },
        subject: `${code} - Your Arzadon Realty Verification Code`,
        content: [{
          type: 'text/html',
          value: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F6F1;font-family:'Georgia',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#1B2A4A;max-width:560px;width:100%;">
        <tr>
          <td style="padding:32px 40px 24px;border-bottom:1px solid rgba(201,168,76,0.3);">
            <span style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#C9A84C;letter-spacing:2px;text-transform:uppercase;">ARZADON REALTY</span><br>
            <span style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:1px;">eXp Realty, Brokerage</span>
          </td>
        </tr>
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;margin:0 0 16px;font-family:Arial,sans-serif;">Email Verification</p>
            <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;color:#FFFFFF;margin:0 0 16px;line-height:1.3;">Hi ${fname || 'there'},<br>here's your code.</h1>
            <p style="font-size:14px;color:rgba(255,255,255,0.5);margin:0 0 32px;line-height:1.7;font-family:Arial,sans-serif;">Enter this 6-digit code to unlock your personalized home valuation report.</p>
            <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
              <tr>
                <td style="background:#F8F6F1;padding:20px 40px;border-left:4px solid #C9A84C;">
                  <span style="font-family:Georgia,serif;font-size:44px;font-weight:700;color:#1B2A4A;letter-spacing:12px;">${code}</span>
                </td>
              </tr>
            </table>
            <p style="font-size:12px;color:rgba(255,255,255,0.3);margin:0;line-height:1.6;font-family:Arial,sans-serif;">This code expires in <strong style="color:rgba(255,255,255,0.5);">10 minutes</strong>. If you didn't request this, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.08);">
            <p style="font-size:11px;color:rgba(255,255,255,0.2);margin:0;font-family:Arial,sans-serif;">Bernard Arzadon · eXp Realty, Brokerage · arzadonrealty.com · No obligation, ever.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
        }]
      })
    });

    if (!sgResponse.ok) {
      const errText = await sgResponse.text();
      console.error('SendGrid error:', errText);
      return res.status(500).json({ error: 'Failed to send email. Please try again.' });
    }

    // Return the signed token to the browser - no server-side storage needed
    return res.status(200).json({ success: true, token });

  } catch (err) {
    console.error('Send code error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
