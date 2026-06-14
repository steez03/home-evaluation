// api/contact.js
// Handles walkthrough request from the modal on the results page
// Sends an email to Bernard via SendGrid
//
// Required env vars:
//   SENDGRID_API_KEY
//   FROM_EMAIL

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, message, address } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });

  try {
    const sgRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: 'bernard@arzadonrealty.com' }] }],
        from: {
          email: process.env.FROM_EMAIL || 'bernard@arzadonrealty.com',
          name: 'Arzadon Realty Home Evaluator'
        },
        reply_to: { email, name },
        subject: `Walkthrough Request - ${address || 'Home Evaluation Lead'}`,
        content: [{
          type: 'text/html',
          value: `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F0EDE6;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F0EDE6;padding:32px 20px;">
  <tr><td align="center">
  <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

    <tr><td style="background:#1B2A4A;padding:22px 28px;border-bottom:3px solid #C9A84C;">
      <p style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A84C;margin:0 0 4px;font-weight:700;">Walkthrough Request</p>
      <h2 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#FFFFFF;margin:0;">${name}</h2>
    </td></tr>

    <tr><td style="background:#FFFFFF;padding:22px 28px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr><td style="padding:6px 0;color:#5A5550;font-size:13px;width:100px;">Name</td><td style="padding:6px 0;font-size:13px;font-weight:700;color:#1B2A4A;">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#5A5550;font-size:13px;">Email</td><td style="padding:6px 0;font-size:13px;"><a href="mailto:${email}" style="color:#C9A84C;font-weight:700;">${email}</a></td></tr>
        ${address ? `<tr><td style="padding:6px 0;color:#5A5550;font-size:13px;">Property</td><td style="padding:6px 0;font-size:13px;color:#1B2A4A;font-weight:600;">${address}</td></tr>` : ''}
      </table>
    </td></tr>

    <tr><td style="background:#F8F6F1;padding:20px 28px;border-top:1px solid #E2DED5;">
      <p style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9A9590;margin:0 0 8px;font-weight:700;">Their Message</p>
      <p style="font-size:14px;color:#1B2A4A;line-height:1.8;margin:0;white-space:pre-wrap;">${message || 'No message provided.'}</p>
    </td></tr>

    <tr><td style="padding:14px 28px;text-align:center;background:#F0EDE6;">
      <a href="mailto:${email}?subject=Re: Free Home Walkthrough" style="display:inline-block;padding:11px 28px;background:linear-gradient(135deg,#F4DB8B,#7F5F39);color:#111D35;font-size:12px;font-weight:700;text-decoration:none;border-radius:8px;letter-spacing:1px;text-transform:uppercase;">Reply to ${name.split(' ')[0]}</a>
    </td></tr>

  </table>
  </td></tr>
</table>
</body></html>`
        }]
      })
    });

    if (!sgRes.ok) {
      const err = await sgRes.text();
      console.error('SendGrid error:', err);
      return res.status(500).json({ error: 'Failed to send. Please try again.' });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('Contact error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
};
