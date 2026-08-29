/// <reference path="../deno.d.ts" />
/**
 * Supabase Edge Function: market-advisor
 *
 * Accepts POST with:
 *   mode: 'full_analysis' | 'chat'
 *
 *   For full_analysis:
 *     { mode, context, currentValue, goalValue, riskTolerance }
 *     Returns AIRecommendation JSON
 *
 *   For chat:
 *     { mode, messages: [{role, content}], context }
 *     Returns { text: string }
 *
 * Required Supabase Secret: ANTHROPIC_API_KEY
 */

Deno.serve(async (req: Request) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // ── Shared system prompt ──────────────────────────────────────────────────

  const SYSTEM_PROMPT = `You are an expert financial analyst and investment advisor assistant embedded inside a personal investment tracking tool.

You have deep knowledge of:
- Equity markets (US and international stocks, ETFs, mutual funds)
- Market cap categories: mega-cap, large-cap, mid-cap, small-cap, micro-cap
- Technical analysis: RSI, MACD, Bollinger Bands, moving averages, trend analysis
- Portfolio construction and risk management
- Foreign exchange (forex) markets: major, minor, and exotic pairs
- Macroeconomic indicators and their market impact
- Sector rotation, business cycles, and market regimes

The user has a medium-to-high risk tolerance and is working toward a specific financial goal.
Their current portfolio consists primarily of ETFs in mid-cap and small-cap categories.

IMPORTANT GUIDELINES:
1. Base all advice on the provided portfolio data and technical signals
2. Be specific — cite tickers, percentages, price levels where relevant
3. Be direct and actionable — avoid vague platitudes
4. For forex: always mention appropriate position sizing (1–3% of portfolio per trade) and stop-loss importance
5. Always include a note that this is for educational/informational purposes only
6. Never guarantee returns or promise specific outcomes
7. Consider tax efficiency where relevant (e.g., ETFs vs mutual funds, holding periods)

RESPONSE FORMAT for full_analysis: Return ONLY valid JSON matching this exact structure:
{
  "summary": "string — executive summary 2-3 sentences",
  "portfolioScore": number (0-100),
  "positions": [
    {
      "ticker": "string",
      "name": "string",
      "action": "STRONG_BUY|BUY|HOLD|SELL|STRONG_SELL",
      "currentWeight": number,
      "suggestedWeight": number,
      "reasoning": "string"
    }
  ],
  "newPositions": [
    {
      "ticker": "string",
      "name": "string",
      "action": "NEW",
      "suggestedWeight": number,
      "reasoning": "string"
    }
  ],
  "forexAdvice": [
    {
      "pair": "string",
      "action": "BUY|SELL|AVOID",
      "suggestedAllocationPct": number,
      "leverage": "string",
      "expectedReturn": "string",
      "reasoning": "string"
    }
  ],
  "allocations": [
    {
      "category": "string",
      "currentPercent": number,
      "suggestedPercent": number,
      "rationale": "string"
    }
  ],
  "riskAssessment": "string",
  "marketOutlook": "string (2-3 sentences on current market conditions)",
  "keyRisks": ["string", "string", "string"],
  "nextSteps": ["string", "string", "string", "string", "string"],
  "growthProjection": {
    "conservative": number (annual % return, e.g. 10),
    "moderate": number,
    "aggressive": number,
    "yearsToGoalConservative": number,
    "yearsToGoalModerate": number,
    "yearsToGoalAggressive": number
  }
}`;

  try {
    const body = await req.json() as {
      mode: 'full_analysis' | 'chat';
      context: string;
      currentValue?: number;
      goalValue?: number;
      riskTolerance?: string;
      messages?: Array<{ role: 'user' | 'assistant'; content: string; image?: { data: string; mediaType: string } }>;
    };

    const { mode, context, currentValue, goalValue, riskTolerance, messages } = body;

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'ANTHROPIC_API_KEY secret not configured in Supabase' }),
        { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // ── Build messages for Claude ─────────────────────────────────────────

    type ClaudeContent = string | Array<{ type: string; [key: string]: unknown }>;
    let claudeMessages: Array<{ role: 'user' | 'assistant'; content: ClaudeContent }>;
    let maxTokens: number;

    if (mode === 'full_analysis') {
      const need = goalValue && currentValue ? (goalValue - currentValue).toLocaleString() : 'unknown';
      claudeMessages = [
        {
          role: 'user',
          content:
            `Please analyse my investment portfolio and provide a complete recommendation.\n\n` +
            `PORTFOLIO DATA:\n${context}\n\n` +
            `GOAL: Reach $${goalValue?.toLocaleString() ?? '1,000,000'} from current $${currentValue?.toLocaleString() ?? '500,000'} ` +
            `(need $${need} more)\n` +
            `RISK TOLERANCE: ${riskTolerance ?? 'medium-high'}\n` +
            `TODAY: ${new Date().toISOString().slice(0, 10)}\n\n` +
            `Respond with ONLY the JSON structure specified — no markdown, no preamble, no trailing text.`,
        },
      ];
      maxTokens = 3000;
    } else {
      // Chat mode
      if (!messages || messages.length === 0) {
        return new Response(
          JSON.stringify({ error: 'messages required for chat mode' }),
          { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } }
        );
      }
      claudeMessages = messages.map((m, i) => {
        const isLast = i === messages.length - 1 && m.role === 'user';
        const textContent = isLast
          ? m.content + '\n\n[IMPORTANT: Give a thorough, specific, actionable answer using the portfolio data above. Use plain English prose with markdown formatting (headers, bullet points, bold text). Do NOT output JSON or code blocks. Be specific — name exact tickers, percentages, and dollar amounts from the portfolio data.]'
          : m.content;

        if (m.image) {
          // Vision message: content is an array with image + text blocks
          return {
            role: m.role,
            content: [
              { type: 'image', source: { type: 'base64', media_type: m.image.mediaType, data: m.image.data } },
              { type: 'text', text: textContent || 'Please analyse this screenshot in the context of my portfolio.' },
            ],
          };
        }
        return { role: m.role, content: textContent };
      });
      maxTokens = 3000;
    }

    // ── Call Anthropic Claude API ─────────────────────────────────────────

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-5',
        max_tokens: maxTokens,
        system: mode === 'chat'
          ? SYSTEM_PROMPT +
            `\n\nCURRENT PORTFOLIO CONTEXT:\n${context ?? ''}` +
            `\n\nCRITICAL: You are in CHAT mode. Respond in plain conversational prose ONLY. ` +
            `Do NOT output JSON, code blocks, markdown fences, or structured data. ` +
            `Write your answer as a knowledgeable financial advisor speaking directly to the user.`
          : SYSTEM_PROMPT,
        messages: claudeMessages,
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`);
    }

    const anthropicData = await anthropicRes.json() as {
      content: Array<{ type: string; text: string }>;
    };

    const rawText = anthropicData.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (mode === 'chat') {
      return new Response(
        JSON.stringify({ text: rawText }),
        { headers: { ...CORS, 'Content-Type': 'application/json' } }
      );
    }

    // Parse JSON for full_analysis
    let parsed: unknown;
    try {
      // Robustly extract JSON: try code-fence capture first, then brace boundaries
      let cleaned = rawText.trim();
      const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (fenced) {
        cleaned = fenced[1].trim();
      } else {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
      }
      parsed = JSON.parse(cleaned);
      // If summary is itself a JSON blob (Claude double-encoded), unwrap it
      const p = parsed as { summary?: string };
      if (p.summary && p.summary.trim().startsWith('{')) {
        const m = p.summary.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) p.summary = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
      }
    } catch {
      // Fallback: try to salvage the summary field from partial JSON
      let fallbackSummary = 'Analysis complete — please regenerate for a structured report.';
      try {
        const s = rawText.indexOf('{');
        const e = rawText.lastIndexOf('}');
        if (s !== -1 && e > s) {
          const obj = JSON.parse(rawText.slice(s, e + 1)) as { summary?: string };
          if (obj.summary) fallbackSummary = obj.summary;
        }
      } catch { /* ignore */ }
      parsed = {
        summary: fallbackSummary,
        portfolioScore: 50,
        positions: [],
        newPositions: [],
        forexAdvice: [],
        allocations: [],
        riskAssessment: 'Unable to parse structured response.',
        marketOutlook: '',
        keyRisks: [],
        nextSteps: [],
        growthProjection: {
          conservative: 10, moderate: 15, aggressive: 22,
          yearsToGoalConservative: 0, yearsToGoalModerate: 0, yearsToGoalAggressive: 0,
        },
      };
    }

    return new Response(
      JSON.stringify(parsed),
      { headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } }
    );
  }
});
