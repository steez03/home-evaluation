// api/valuation.js
// Secure proxy for Anthropic API — keeps ANTHROPIC_API_KEY server-side
// Handles the full agentic web-search loop

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Prompt required' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured in Vercel environment variables.' });
  }

  const API_URL = 'https://api.anthropic.com/v1/messages';
  const tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  let messages = [{ role: 'user', content: prompt }];
  let raw = '';

  try {
    for (let turn = 0; turn < 8; turn++) {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          tools,
          messages
        })
      });

      const result = await response.json();
      if (result.error) throw new Error(result.error.message || 'Anthropic API error');

      messages.push({ role: 'assistant', content: result.content });

      if (result.stop_reason === 'end_turn') {
        const textBlocks = result.content.filter(b => b.type === 'text');
        raw = textBlocks.length ? textBlocks[textBlocks.length - 1].text : '';
        break;
      }

      if (result.stop_reason === 'tool_use') {
        const toolResults = result.content
          .filter(b => b.type === 'tool_use')
          .map(block => ({
            type: 'tool_result',
            tool_use_id: block.id,
            content: block.output ?? '[search results returned]'
          }));
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      const textBlocks = result.content?.filter(b => b.type === 'text') || [];
      if (textBlocks.length) { raw = textBlocks[textBlocks.length - 1].text; break; }
      throw new Error('Unexpected stop reason: ' + result.stop_reason);
    }

    if (!raw) throw new Error('No response generated');

    const clean = raw.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : clean);

    return res.status(200).json({ success: true, valuation: parsed });

  } catch (err) {
    console.error('Valuation error:', err);
    return res.status(500).json({ error: err.message || 'Valuation failed. Please try again.' });
  }
};
