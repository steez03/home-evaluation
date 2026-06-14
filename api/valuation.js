// api/valuation.js - Secure Anthropic API proxy with agentic web search loop
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  let messages = [{ role: 'user', content: prompt }];
  let raw = '';

  try {
    for (let turn = 0; turn < 8; turn++) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 2000, tools, messages })
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error.message || 'Anthropic API error');
      messages.push({ role: 'assistant', content: result.content });
      if (result.stop_reason === 'end_turn') {
        const tb = result.content.filter(b => b.type === 'text');
        raw = tb.length ? tb[tb.length - 1].text : '';
        break;
      }
      if (result.stop_reason === 'tool_use') {
        const tr = result.content.filter(b => b.type === 'tool_use').map(b => ({
          type: 'tool_result', tool_use_id: b.id, content: b.output ?? '[search results]'
        }));
        messages.push({ role: 'user', content: tr });
        continue;
      }
      const tb = result.content?.filter(b => b.type === 'text') || [];
      if (tb.length) { raw = tb[tb.length - 1].text; break; }
      throw new Error('Unexpected stop reason: ' + result.stop_reason);
    }
    if (!raw) throw new Error('No response generated');
    const clean = raw.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(match ? match[0] : clean);
    return res.status(200).json({ success: true, valuation: parsed });
  } catch (err) {
    console.error('Valuation error:', err);
    return res.status(500).json({ error: err.message || 'Valuation failed.' });
  }
};
