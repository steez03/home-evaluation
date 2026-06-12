// api/verify-code.js
// 1. Validates the signed token + code
// 2. Fires report emails (client + Bernard)
// 3. Creates lead in Follow Up Boss via /v1/events
//
// Required env vars:
//   TOKEN_SECRET         - same value as in send-code.js
//   SENDGRID_API_KEY     - SendGrid API key
//   FROM_EMAIL           - verified sender (bernard@arzadonrealty.com)
//   FOLLOWUPBOSS_API_KEY - Follow Up Boss API key (Admin -> API)

const crypto = require('crypto');

function verifyToken(email, code, token) {
  const secret = process.env.TOKEN_SECRET || 'arzadon-realty-fallback-secret';
  let parsed;
  try { parsed = JSON.parse(Buffer.from(token, 'base64').toString('utf8')); }
  catch { return { valid: false, error: 'Invalid token.' }; }

  const { payload, sig } = parsed;
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expectedSig !== sig) return { valid: false, error: 'Invalid token.' };

  const parts = payload.split(':');
  if (parts.length < 3) return { valid: false, error: 'Malformed token.' };
  const [tokenEmail, tokenCode, tokenExpires] = parts;

  if (Date.now() > parseInt(tokenExpires, 10)) return { valid: false, error: 'Code has expired. Please request a new one.' };
  if (tokenEmail !== email.toLowerCase().trim()) return { valid: false, error: 'Email mismatch.' };
  if (tokenCode !== code.trim()) return { valid: false, error: 'Incorrect code. Please try again.' };

  return { valid: true };
}

async function sendEmail(to, subject, html, fromName = 'Bernard Arzadon, Arzadon Realty') {
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}` },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.FROM_EMAIL || 'bernard@arzadonrealty.com', name: fromName },
      subject,
      content: [{ type: 'text/html', value: html }]
    })
  });
}

function clientReportEmail(data) {
  const { fname, valuation: v, address, city, propType } = data;
  const locationStr = [address, city, 'ON'].filter(Boolean).join(', ');
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F8F6F1;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:40px 20px;">
  <tr><td align="center">
  <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

    <!-- Header -->
    <tr><td style="background:#1B2A4A;padding:28px 36px 24px;border-bottom:3px solid #C9A84C;">
      <span style="font-family:Georgia,serif;font-size:18px;font-weight:700;color:#C9A84C;letter-spacing:2px;text-transform:uppercase;">ARZADON REALTY</span><br>
      <span style="font-size:10px;color:rgba(255,255,255,.35);letter-spacing:1.5px;text-transform:uppercase;">eXp Realty, Brokerage</span>
    </td></tr>

    <!-- Intro -->
    <tr><td style="background:#1B2A4A;padding:32px 36px 28px;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;margin:0 0 12px;">Your Home Valuation Report</p>
      <h1 style="font-family:Georgia,serif;font-size:26px;font-weight:400;color:#FFFFFF;margin:0 0 14px;line-height:1.3;">Hi ${fname}, your estimate is ready.</h1>
      <p style="font-size:14px;color:rgba(255,255,255,.5);margin:0;line-height:1.7;">${locationStr}</p>
    </td></tr>

    <!-- Value -->
    <tr><td style="background:#F8F6F1;padding:32px 36px;border-left:4px solid #C9A84C;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#5A5550;margin:0 0 10px;font-weight:700;">Most Likely Value</p>
      <p style="font-family:Georgia,serif;font-size:52px;font-weight:700;color:#1B2A4A;margin:0 0 6px;line-height:1;">${v.likelyValue || 'See below'}</p>
      <p style="font-size:14px;color:#5A5550;margin:0;">Estimated range: <strong style="color:#1B2A4A;">${v.lowValue || ''}</strong> to <strong style="color:#1B2A4A;">${v.highValue || ''}</strong></p>
    </td></tr>

    <!-- HPI source -->
    ${v.hpiBenchmark ? `<tr><td style="background:#F0EDE6;padding:14px 36px;border-left:3px solid #C9A84C;">
      <p style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9A9590;margin:0 0 3px;font-weight:700;">Live Data Source</p>
      <p style="font-size:13px;color:#1B2A4A;margin:0;">${v.hpiBenchmark}</p>
    </td></tr>` : ''}

    <!-- Market context -->
    <tr><td style="background:#FFFFFF;padding:28px 36px;border-top:1px solid #E2DED5;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 10px;font-weight:700;">Market Context</p>
      <p style="font-size:14px;color:#1B2A4A;line-height:1.8;margin:0;">${v.marketContext || ''}</p>
    </td></tr>

    <!-- Key drivers -->
    <tr><td style="background:#FFFFFF;padding:0 36px 28px;border-top:1px solid #F0EDE6;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 10px;font-weight:700;">Key Value Drivers</p>
      <p style="font-size:14px;color:#1B2A4A;line-height:1.9;margin:0;">${(v.keyDrivers || '').replace(/\n/g, '<br>')}</p>
    </td></tr>

    <!-- How this was calculated -->
    <tr><td style="background:#FFFFFF;padding:0 36px 28px;border-top:1px solid #F0EDE6;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 10px;font-weight:700;">How This Estimate Was Calculated</p>
      <p style="font-size:14px;color:#1B2A4A;line-height:1.9;margin:0;">${v.fullAssessment || ''}</p>
    </td></tr>

    <!-- CTA -->
    <tr><td style="background:#1B2A4A;padding:28px 36px;text-align:center;">
      <p style="font-family:Georgia,serif;font-size:20px;font-weight:400;color:#FFFFFF;margin:0 0 8px;">Want to know what your home could actually sell for?</p>
      <p style="font-size:13px;color:rgba(255,255,255,.5);margin:0 0 24px;line-height:1.7;">AI estimates are a great starting point, but every home has details that data alone cannot capture. Bernard Arzadon offers a free, no-obligation in-person home walkthrough for homeowners in the area.</p>
      <a href="mailto:bernard@arzadonrealty.com?subject=I'd%20like%20a%20home%20valuation%20for%20${encodeURIComponent(data.address || 'my property')}&body=Hi%20Bernard%2C%0A%0AI%20just%20received%20my%20AI%20home%20valuation%20for%20${encodeURIComponent((data.address || 'my property') + (data.city ? ', ' + data.city : ''))}%20and%20I%20would%20like%20to%20get%20a%20more%20accurate%2C%20in-person%20assessment.%0A%0APlease%20get%20in%20touch%20at%20your%20earliest%20convenience.%0A%0AThanks%2C%0A${encodeURIComponent(data.fname || '')}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#F4DB8B,#7F5F39);color:#111D35;font-size:13px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Request a Free In-Person Walkthrough</a>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 36px;border-top:1px solid #E2DED5;text-align:center;">
      <p style="font-size:12px;color:#9A9590;margin:0 0 4px;">Bernard Arzadon · eXp Realty, Brokerage · arzadonrealty.com</p>
      <p style="font-size:11px;color:#9A9590;margin:0;">This is an AI-generated estimate, not a formal appraisal. Actual value may differ.</p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`;
}

function bernardNotificationEmail(data) {
  const { fname, lname, email, phone, address, city, postalCode, propType, yearBuilt,
          bedrooms, bathrooms, parking, sqft, basement, features, notes, valuation: v } = data;
  const fullName = [fname, lname].filter(Boolean).join(' ');
  const locationStr = [address, city, postalCode, 'ON'].filter(Boolean).join(', ');
  const condRows = Object.entries(data.ratings || {})
    .filter(([,val]) => val)
    .map(([k,val]) => `<tr><td style="padding:6px 0;color:#5A5550;font-size:13px;">${k}</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#1B2A4A;">${val}/5 ${'★'.repeat(val)}${'☆'.repeat(5-val)}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0EDE6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE6;padding:32px 20px;">
  <tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

    <tr><td style="background:#1B2A4A;padding:24px 32px;border-bottom:3px solid #C9A84C;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;margin:0 0 4px;font-weight:700;">New Lead Alert</p>
      <h2 style="font-family:Georgia,serif;font-size:22px;font-weight:700;color:#FFFFFF;margin:0;">${fullName} - Home Evaluation</h2>
    </td></tr>

    <!-- Contact info -->
    <tr><td style="background:#FFFFFF;padding:24px 32px;border-top:none;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 12px;font-weight:700;">Contact Details</p>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;width:120px;">Name</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1B2A4A;">${fullName}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Email</td><td style="padding:5px 0;font-size:13px;"><a href="mailto:${email}" style="color:#C9A84C;font-weight:700;">${email}</a></td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Phone</td><td style="padding:5px 0;font-size:13px;"><a href="tel:${phone}" style="color:#C9A84C;font-weight:700;">${phone}</a></td></tr>
      </table>
    </td></tr>

    <!-- Property info -->
    <tr><td style="background:#F8F6F1;padding:24px 32px;border-top:1px solid #E2DED5;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 12px;font-weight:700;">Property</p>
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;width:120px;">Address</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:#1B2A4A;">${locationStr}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Type</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${propType || 'Not specified'}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Year Built</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${yearBuilt || 'Unknown'}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Size</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${sqft ? sqft + ' sq ft' : 'Not provided'} | ${bedrooms} bed | ${bathrooms} bath | ${parking}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Basement</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${basement || 'None'}</td></tr>
        ${features ? `<tr><td style="padding:5px 0;color:#5A5550;font-size:13px;vertical-align:top;">Upgrades</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${features}</td></tr>` : ''}
        ${notes ? `<tr><td style="padding:5px 0;color:#5A5550;font-size:13px;vertical-align:top;">Notes</td><td style="padding:5px 0;font-size:13px;color:#1B2A4A;">${notes}</td></tr>` : ''}
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Email consent</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${data.consentEmail ? '#2E7D4F' : '#c0392b'};">${data.consentEmail ? 'Yes - agreed to email/text follow-up' : 'No'}</td></tr>
        <tr><td style="padding:5px 0;color:#5A5550;font-size:13px;">Call consent</td><td style="padding:5px 0;font-size:13px;font-weight:700;color:${data.consentCall ? '#2E7D4F' : '#c0392b'};">${data.consentCall ? 'Yes - consented to calls (DNCL override)' : 'No'}</td></tr>
      </table>
    </td></tr>

    <!-- Condition ratings -->
    ${condRows ? `<tr><td style="background:#FFFFFF;padding:20px 32px;border-top:1px solid #E2DED5;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#9A9590;margin:0 0 10px;font-weight:700;">Condition Ratings</p>
      <table cellpadding="0" cellspacing="0" width="100%">${condRows}</table>
    </td></tr>` : ''}

    <!-- Valuation -->
    <tr><td style="background:#1B2A4A;padding:24px 32px;border-top:none;">
      <p style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;margin:0 0 10px;font-weight:700;">AI Estimate Shown to Lead</p>
      <p style="font-family:Georgia,serif;font-size:40px;font-weight:700;color:#FFFFFF;margin:0 0 4px;line-height:1;">${v.likelyValue || '-'}</p>
      <p style="font-size:13px;color:rgba(255,255,255,.5);margin:0;">Range: ${v.lowValue || ''} to ${v.highValue || ''}</p>
      ${v.hpiBenchmark ? `<p style="font-size:12px;color:rgba(201,168,76,.7);margin:10px 0 0;">${v.hpiBenchmark}</p>` : ''}
    </td></tr>

    <tr><td style="padding:16px 32px;text-align:center;background:#F0EDE6;">
      <p style="font-size:11px;color:#9A9590;margin:0;">Lead added to Follow Up Boss automatically.</p>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`;
}

async function addToFollowUpBoss(data) {
  const { fname, lname, email, phone, address, city, postalCode, propType, valuation: v } = data;
  const fullName = [fname, lname].filter(Boolean).join(' ');
  const locationStr = [address, city, postalCode, 'Ontario'].filter(Boolean).join(', ');
  const message = `Home evaluation submitted via eval.arzadonrealty.com.
Property: ${locationStr}
Type: ${propType || 'Not specified'}
AI Estimate: ${v.likelyValue || 'See report'} (range: ${v.lowValue || ''} to ${v.highValue || ''})
${v.hpiBenchmark ? 'Data source: ' + v.hpiBenchmark : ''}
Email/text consent: ${data.consentEmail ? 'YES - agreed to follow-up communications' : 'NO'}
Phone call consent (DNCL override): ${data.consentCall ? 'YES - consented to calls' : 'NO'}`;

  const payload = {
    source: 'eval.arzadonrealty.com',
    system: 'Arzadon Home Evaluator',
    type: 'Seller Inquiry',
    message,
    person: {
      name: fullName,
      emails: [{ value: email }],
      phones: phone ? [{ value: phone }] : [],
      address: address || undefined,
      city: city || undefined,
      state: 'Ontario',
      country: 'Canada'
    }
  };

  const fubRes = await fetch('https://api.followupboss.com/v1/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(process.env.FOLLOWUPBOSS_API_KEY + ':').toString('base64'),
      'X-System': 'Arzadon Home Evaluator',
      'X-System-Key': process.env.FOLLOWUPBOSS_API_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!fubRes.ok) {
    const err = await fubRes.text();
    console.error('FUB error:', err);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, code, token, leadData } = req.body || {};
  if (!email || !code || !token) return res.status(400).json({ error: 'Email, code, and token are required.' });

  const result = verifyToken(email, code, token);
  if (!result.valid) return res.status(400).json({ error: result.error });

  // Fire all three post-verify actions in parallel
  if (leadData) {
    await Promise.all([
      // Email to client
      sendEmail(
        email,
        `Your Home Valuation Report - ${leadData.address || leadData.city || 'Your Property'}`,
        clientReportEmail(leadData)
      ).catch(e => console.error('Client email error:', e)),

      // Email to Bernard
      sendEmail(
        'bernard@arzadonrealty.com',
        `New Lead: ${[leadData.fname, leadData.lname].filter(Boolean).join(' ')} - ${leadData.address || leadData.city}`,
        bernardNotificationEmail(leadData),
        'Arzadon Realty Lead System'
      ).catch(e => console.error('Bernard email error:', e)),

      // Follow Up Boss
      addToFollowUpBoss(leadData).catch(e => console.error('FUB error:', e))
    ]).catch(e => console.error('Post-verify error:', e));
  }

  return res.status(200).json({ success: true, verified: true });
};
