import { useState, useRef, useEffect } from 'react';
import {
  Brain, RefreshCw, TrendingUp, TrendingDown, AlertTriangle,
  Sparkles, Target, BarChart2, Send, Paperclip, X,
} from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { MACRO_VALUATION } from '../lib/macroContext';
import type { AIRecommendation, PositionAdvice } from '../types';

/** Render inline markdown: **bold**, *italic*, `code` */
function inlineRender(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*'))
      return <em key={i} className="text-gray-300 italic">{part.slice(1, -1)}</em>;
    if (part.startsWith('`') && part.endsWith('`'))
      return <code key={i} className="bg-gray-700 text-brand-300 px-1 rounded text-xs">{part.slice(1, -1)}</code>;
    return part;
  });
}

/** Lightweight markdown renderer — handles headers, bold, lists, tables, dividers */
function MarkdownMessage({ content }: { content: string }) {
  // Clean up the content: extract from code fences, don't just nuke everything
  let text = content;

  // If there's a ```json block, try to extract summary from it, then remove the block
  text = text.replace(/```(?:json|js|ts)?\s*([\s\S]*?)```/g, (_match, inner) => {
    // Try to extract a summary field from JSON inside the fence
    try {
      const obj = JSON.parse(inner.trim()) as { summary?: string; text?: string };
      if (obj.summary) return obj.summary;
      if (obj.text) return obj.text;
    } catch { /* not JSON, drop the block */ }
    return '';
  });

  // Handle unclosed fence: if there's a ```json{ block with no closing, extract JSON summary
  text = text.replace(/```(?:json)?\s*\{[\s\S]*/g, (match) => {
    try {
      const jsonStart = match.indexOf('{');
      const jsonEnd = match.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        const obj = JSON.parse(match.slice(jsonStart, jsonEnd + 1)) as { summary?: string };
        if (obj.summary) return obj.summary;
      }
    } catch { /* ignore */ }
    return '';
  });

  // Remove any remaining unclosed backtick fences
  text = text.replace(/```[\s\S]{0,20}$/gm, '');

  text = text.replace(/\n{3,}/g, '\n\n').trim();

  // If cleaning left us with nothing, render the original as plain text
  if (!text) {
    return <p className="text-gray-200 leading-relaxed">{content.slice(0, 800)}</p>;
  }

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Horizontal rule
    if (/^-{3,}$/.test(line.trim())) {
      elements.push(<hr key={i} className="border-gray-600 my-3" />);
      i++; continue;
    }

    // H1
    if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="text-base font-bold text-white mt-4 mb-1">{inlineRender(line.slice(2))}</h1>);
      i++; continue;
    }

    // H2
    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-sm font-bold text-brand-300 mt-4 mb-1 uppercase tracking-wide">{inlineRender(line.slice(3))}</h2>);
      i++; continue;
    }

    // H3
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-gray-100 mt-3 mb-1">{inlineRender(line.slice(4))}</h3>);
      i++; continue;
    }

    // Table (GFM pipe tables)
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const dataRows = tableLines.filter(l => !/^\|[-:\s|]+\|$/.test(l.trim()));
      elements.push(
        <div key={`t${i}`} className="overflow-x-auto my-3">
          <table className="w-full text-xs border-collapse">
            <tbody>
              {dataRows.map((row, ri) => {
                const cells = row.split('|').slice(1, -1);
                return (
                  <tr key={ri} className={`border-b border-gray-700 ${ri === 0 ? 'bg-gray-700' : 'hover:bg-gray-750'}`}>
                    {cells.map((cell, ci) =>
                      ri === 0
                        ? <th key={ci} className="px-2 py-1.5 text-left font-semibold text-gray-200 whitespace-nowrap">{inlineRender(cell.trim())}</th>
                        : <td key={ci} className="px-2 py-1.5 text-gray-300">{inlineRender(cell.trim())}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul${i}`} className="list-disc list-inside space-y-1 mb-2 pl-2">
          {items.map((item, ii) => <li key={ii} className="text-gray-300">{inlineRender(item)}</li>)}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol${i}`} className="list-decimal list-inside space-y-1 mb-2 pl-2">
          {items.map((item, ii) => <li key={ii} className="text-gray-300">{inlineRender(item)}</li>)}
        </ol>
      );
      continue;
    }

    // Paragraph
    elements.push(<p key={i} className="mb-2 leading-relaxed text-gray-200">{inlineRender(line)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{elements.length > 0 ? elements : <p className="text-gray-200 leading-relaxed">{text}</p>}</div>;
}

/** If summary contains raw JSON or code fences, extract the real summary text. */
function cleanSummary(text: string): string {
  if (!text) return text;
  let s = text.trim();

  // Strip closed code fence: ```json ... ```
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    s = fenced[1].trim();
  } else {
    // Strip unclosed opening fence: ```json  or  ```
    s = s.replace(/^```(?:json)?\s*/i, '').trim();
  }

  // If it now looks like a JSON blob, extract just the summary string
  if (s.startsWith('{')) {
    // Regex is fastest and handles truncated JSON
    const m = s.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) return m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();

    // Fallback: try progressive JSON parse from end
    let end = s.lastIndexOf('}');
    while (end > 0) {
      try {
        const obj = JSON.parse(s.slice(0, end + 1)) as { summary?: string };
        if (obj.summary && !obj.summary.startsWith('{')) return obj.summary;
        break;
      } catch {
        end = s.lastIndexOf('}', end - 1);
      }
    }
  }

  return s;
}

const ACTION_COLOR: Record<string, string> = {
  STRONG_BUY:  'text-emerald-400',
  BUY:         'text-green-400',
  WATCH:       'text-indigo-400',
  HOLD:        'text-gray-400',
  SELL:        'text-orange-400',
  STRONG_SELL: 'text-red-400',
  NEW:         'text-brand-400',
};


function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? 'text-emerald-400' : score >= 45 ? 'text-yellow-400' : 'text-red-400';
  const ringColor = score >= 70 ? 'stroke-emerald-500' : score >= 45 ? 'stroke-yellow-500' : 'stroke-red-500';
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg viewBox="0 0 44 44" className="w-full h-full -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" className="stroke-gray-800" />
        <circle
          cx="22" cy="22" r="18" fill="none" strokeWidth="4"
          className={`transition-all duration-700 ${ringColor}`}
          strokeDasharray={`${(score / 100) * 113.1} 113.1`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold ${color}`}>{score}</span>
        <span className="text-xs text-gray-500">/ 100</span>
      </div>
    </div>
  );
}

function PositionCard({ pos }: { pos: PositionAdvice }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono font-bold text-white">{pos.ticker}</span>
        <span className={`text-xs font-bold uppercase ${ACTION_COLOR[pos.action] ?? 'text-gray-400'}`}>
          {pos.action === 'NEW' ? '+ New Position' : pos.action.replace('_', ' ')}
        </span>
      </div>
      {pos.name && <p className="text-xs text-gray-500 mb-2">{pos.name}</p>}
      {(pos.currentWeight !== undefined || pos.suggestedWeight !== undefined) && (
        <div className="flex gap-4 mb-2 text-xs">
          {pos.currentWeight !== undefined && (
            <span className="text-gray-400">Current: {pos.currentWeight.toFixed(1)}%</span>
          )}
          {pos.suggestedWeight !== undefined && (
            <span className="text-brand-400">Suggested: {pos.suggestedWeight.toFixed(1)}%</span>
          )}
        </div>
      )}
      <p className="text-sm text-gray-300">{pos.reasoning}</p>
    </div>
  );
}

export function AIAdvisor() {
  const { portfolio, signals, forexPairs, aiRecommendation, setAIRecommendation, setLoading, isLoading, chatMessages, setChatMessages, marketNews } =
    useInvestmentStore();
  const toast = useToast();

  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ data: string; mediaType: string; preview: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message whenever messages change or thinking state changes
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatting]);

  const isGenerating = isLoading['ai_advisor'];

  const buildContext = () => {
    const topSignals = signals
      .slice()
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 10);

    return JSON.stringify(
      {
        portfolio: {
          totalValue: portfolio.totalValue,
          goalValue: portfolio.goalValue,
          riskTolerance: portfolio.riskTolerance,
          holdings: portfolio.holdings.map((h) => ({
            ticker: h.ticker,
            name: h.name,
            value: h.value,
            assetClass: h.assetClass,
            category: h.category,
            allocation: ((h.value / portfolio.totalValue) * 100).toFixed(1) + '%',
          })),
        },
        signals: topSignals.map((s) => ({
          ticker: s.ticker,
          action: s.action,
          confidence: s.confidence,
          topReason: s.reasons[0] ?? '',
        })),
        forexOpportunities: forexPairs
          .filter((p) => p.signal.action !== 'HOLD')
          .map((p) => ({ pair: p.pair, action: p.signal.action, confidence: p.signal.confidence })),
        marketNews: marketNews.slice(0, 20).map((n) => ({
          headline: n.headline,
          source: n.source,
          sentiment: n.sentiment,
          tickers: n.tickers,
          addedAt: n.addedAt,
        })),
        marketDate: new Date().toISOString().slice(0, 10),
        macroValuation: {
          shillerCAPE:      MACRO_VALUATION.shillerCAPE,
          trailingPE:       MACRO_VALUATION.trailingPE,
          buffettIndicator: MACRO_VALUATION.buffettIndicator,
          regime:           MACRO_VALUATION.regime,
          asOf:             MACRO_VALUATION.asOf,
          historicalContext: MACRO_VALUATION.historicalContext,
          precedents:       MACRO_VALUATION.precedents,
          implication:      MACRO_VALUATION.implication,
        },
      },
      null,
      2
    );
  };

  const generateRecommendation = async () => {
    if (portfolio.holdings.length === 0) {
      toast.warning('No holdings found — add them via Settings → Portfolio & Import');
      return;
    }

    setLoading('ai_advisor', true);
    try {
      const { data, error } = await supabase.functions.invoke('market-advisor', {
        body: {
          mode: 'full_analysis',
          context: buildContext(),
          currentValue: portfolio.totalValue,
          goalValue: portfolio.goalValue,
          riskTolerance: portfolio.riskTolerance,
        },
      });

      if (error) throw error;

      const rec = data as AIRecommendation;
      rec.generatedAt = new Date().toISOString();
      setAIRecommendation(rec);
      toast.success('AI analysis complete');
    } catch (e) {
      console.error(e);
      toast.error('AI analysis failed — check Supabase env vars in Settings');
    } finally {
      setLoading('ai_advisor', false);
    }
  };

  const handleImageAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.warning('Only image files are supported'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.warning('Image must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const [header, data] = dataUrl.split(',');
      const mediaType = header.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
      setPendingImage({ data, mediaType, preview: dataUrl });
    };
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  };

  const sendChat = async () => {
    const msg = chatInput.trim();
    if (!msg && !pendingImage) return;
    setChatInput('');
    const imageToSend = pendingImage;
    setPendingImage(null);
    setIsChatting(true);
    const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const newMessages: typeof chatMessages = [
      ...chatMessages,
      { role: 'user', content: msg || '(screenshot attached)', timestamp: ts, image: imageToSend ? { data: imageToSend.data, mediaType: imageToSend.mediaType } : undefined },
    ];
    setChatMessages(newMessages);

    try {
      const { data, error } = await supabase.functions.invoke('market-advisor', {
        body: {
          mode: 'chat',
          messages: newMessages.map(({ role, content, image }) => ({ role, content, image })),
          context: buildContext(),
        },
      });
      if (error) throw error;
      const reply = (data as { text: string }).text;
      const replyTs = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setChatMessages([...newMessages, { role: 'assistant', content: reply, timestamp: replyTs }]);
    } catch (err) {
      const errTs = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error('Chat error:', errMsg);
      setChatMessages([...newMessages, { role: 'assistant', content: `⚠️ Error: ${errMsg}`, timestamp: errTs }]);
    } finally {
      setIsChatting(false);
    }
  };

  const rec = aiRecommendation;

  return (
    <div className="flex flex-col gap-6 h-full">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Brain className="w-5 h-5 text-brand-400" />
            AI Investment Advisor
          </h2>
          <p className="text-gray-500 text-sm">
            Powered by Claude Anthropic via your Supabase edge function.
            Analyses your portfolio, market signals, and forex opportunities.
          </p>
        </div>
        <button
          onClick={generateRecommendation}
          disabled={isGenerating}
          className="flex items-center gap-2 bg-gradient-to-r from-brand-700 to-indigo-700 hover:from-brand-600 hover:to-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-50 transition-all shadow-lg"
        >
          {isGenerating
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Analysing...</>
            : <><Sparkles className="w-4 h-4" /> Generate Analysis</>
          }
        </button>
      </div>

      {/* ── No recommendation yet ── */}
      {!rec && !isGenerating && (
        <div className="bg-gray-900/60 border border-dashed border-gray-700 rounded-2xl p-12 text-center space-y-3">
          <Brain className="w-12 h-12 text-gray-600 mx-auto" />
          <p className="text-gray-400">Click <strong>Generate Analysis</strong> to get an AI-powered full portfolio review.</p>
          <p className="text-gray-600 text-sm">
            The AI will review your holdings, technical signals, forex opportunities, and
            provide a tailored roadmap to reach your $
            {(portfolio.goalValue / 1000).toFixed(0)}K goal.
          </p>
        </div>
      )}

      {/* ── Loading ── */}
      {isGenerating && (
        <div className="bg-gray-900/60 border border-brand-800 rounded-2xl p-12 text-center space-y-4">
          <RefreshCw className="w-10 h-10 text-brand-400 animate-spin mx-auto" />
          <p className="text-brand-300 font-medium">AI is analysing your portfolio...</p>
          <p className="text-gray-500 text-sm">This takes 10–30 seconds</p>
        </div>
      )}

      {/* ── Recommendation ── */}
      {rec && (
        <div className="space-y-6">

          {/* Score + summary */}
          <div className="bg-gradient-to-r from-brand-950/60 to-indigo-950/60 border border-brand-800 rounded-2xl p-6">
            <div className="flex items-start gap-6">
              <div className="text-center shrink-0">
                <ScoreGauge score={rec.portfolioScore} />
                <p className="text-xs text-gray-500 mt-2">Portfolio Score</p>
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold mb-2">Executive Summary</h3>
                <p className="text-gray-300 leading-relaxed">{cleanSummary(rec.summary)}</p>
                <p className="text-xs text-gray-500 mt-3">
                  Generated {new Date(rec.generatedAt).toLocaleString()} · For educational purposes only
                </p>
              </div>
            </div>
          </div>

          {/* Growth projection */}
          {rec.growthProjection && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-gray-300 font-semibold mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-brand-400" />
                Projected Path to ${(portfolio.goalValue / 1000).toFixed(0)}K
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Conservative', return: rec.growthProjection.conservative, years: rec.growthProjection.yearsToGoalConservative, color: 'text-blue-400 border-blue-800' },
                  { label: 'Moderate', return: rec.growthProjection.moderate, years: rec.growthProjection.yearsToGoalModerate, color: 'text-emerald-400 border-emerald-800' },
                  { label: 'Aggressive', return: rec.growthProjection.aggressive, years: rec.growthProjection.yearsToGoalAggressive, color: 'text-orange-400 border-orange-800' },
                ].map(({ label, return: ret, years, color }) => (
                  <div key={label} className={`border rounded-xl p-4 ${color}`}>
                    <div className="text-sm text-gray-400 mb-1">{label}</div>
                    <div className="text-2xl font-bold">{ret}% <span className="text-xs font-normal text-gray-500">/yr</span></div>
                    <div className="text-sm">{years?.toFixed(1)} years to goal</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Market outlook + risks */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-brand-400" />
                Market Outlook
              </h3>
              <p className="text-gray-300 text-sm leading-relaxed">{rec.marketOutlook}</p>
            </div>
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
              <h3 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
                Key Risks
              </h3>
              <ul className="space-y-2">
                {(rec.keyRisks ?? []).map((risk, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                    <span className="text-orange-400 mt-1">⚠</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Existing positions */}
          {rec.positions?.length > 0 && (
            <div>
              <h3 className="text-gray-300 font-semibold mb-3">Existing Positions</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rec.positions.map((p, i) => <PositionCard key={i} pos={p} />)}
              </div>
            </div>
          )}

          {/* New position suggestions */}
          {rec.newPositions?.length > 0 && (
            <div>
              <h3 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-brand-400" />
                Suggested New Positions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rec.newPositions.map((p, i) => <PositionCard key={i} pos={p} />)}
              </div>
            </div>
          )}

          {/* Forex recommendations */}
          {rec.forexAdvice?.length > 0 && (
            <div>
              <h3 className="text-gray-300 font-semibold mb-3 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-purple-400" />
                Forex Opportunities
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {rec.forexAdvice.map((f, i) => (
                  <div key={i} className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-white">{f.pair}</span>
                      <span className={`text-xs font-bold ${f.action === 'BUY' ? 'text-emerald-400' : f.action === 'SELL' ? 'text-orange-400' : 'text-gray-400'}`}>
                        {f.action}
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 mb-2">
                      <span>Allocation: {f.suggestedAllocationPct}%</span>
                      {f.leverage && <span>Leverage: {f.leverage}</span>}
                      {f.expectedReturn && <span>Target: {f.expectedReturn}</span>}
                    </div>
                    <p className="text-sm text-gray-300">{f.reasoning}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Next steps */}
          {rec.nextSteps?.length > 0 && (
            <div className="bg-gradient-to-r from-gray-900 to-brand-950/40 border border-brand-800 rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3">Recommended Next Steps</h3>
              <ol className="space-y-2">
                {rec.nextSteps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm text-gray-300">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-brand-800 text-brand-300 flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ── Chat interface ── */}
      <div className="flex-1 flex flex-col min-h-0 bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-3 shrink-0 bg-gray-900">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">AI Advisor</div>
            <div className="text-xs text-emerald-400 leading-tight">● Online</div>
          </div>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ background: 'radial-gradient(ellipse at top, #0f172a 0%, #030712 100%)' }}>
          {chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <p className="text-gray-400 font-medium">AI Investment Advisor</p>
              <p className="text-gray-600 text-sm text-center max-w-xs">
                Ask me anything about your portfolio — positions to sell, what to buy, risk analysis, and more.
              </p>
              <div className="flex flex-col gap-2 mt-2 w-full max-w-xs">
                {[
                  'Which positions should I sell?',
                  'What should I buy to diversify?',
                  'How do I reach my goal faster?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setChatInput(suggestion)}
                    className="text-xs bg-gray-800/80 hover:bg-gray-700 border border-gray-700 text-gray-300 rounded-full px-4 py-2 transition-colors text-center"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            chatMessages.map((m, i) => {
              const isUser = m.role === 'user';
              const isFirstInGroup = i === 0 || chatMessages[i - 1].role !== m.role;
              const isLastInGroup = i === chatMessages.length - 1 || chatMessages[i + 1].role !== m.role;
              return (
                <div key={i} className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
                  {/* Avatar for assistant */}
                  {!isUser && (
                    <div className={`shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center ${isLastInGroup ? 'visible' : 'invisible'}`}>
                      <Brain className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}

                  {/* Bubble */}
                  <div className={`relative max-w-[78%] px-4 py-2.5 text-sm leading-relaxed shadow-md ${
                    isUser
                      ? 'bg-brand-600 text-white rounded-[20px] rounded-br-[5px]'
                      : 'bg-gray-800 text-gray-100 rounded-[20px] rounded-bl-[5px]'
                  } ${isFirstInGroup && isUser ? 'rounded-tr-[20px]' : ''} ${isFirstInGroup && !isUser ? 'rounded-tl-[20px]' : ''}`}>
                    {/* Attached image thumbnail */}
                    {isUser && m.image && (
                      <img
                        src={`data:${m.image.mediaType};base64,${m.image.data}`}
                        alt="attached screenshot"
                        className="rounded-xl mb-2 max-h-48 w-auto object-contain"
                      />
                    )}
                    {isUser ? (m.content !== '(screenshot attached)' ? m.content : null) : <MarkdownMessage content={m.content} />}

                    {/* Timestamp on last message of group */}
                    {isLastInGroup && (
                      <div className={`text-[10px] mt-1 ${isUser ? 'text-brand-300 text-right' : 'text-gray-500'}`}>
                        {m.timestamp}
                      </div>
                    )}
                  </div>

                  {/* Avatar placeholder for user (keeps alignment) */}
                  {isUser && <div className="shrink-0 w-7" />}
                </div>
              );
            })
          )}

          {/* Typing indicator */}
          {isChatting && (
            <div className="flex items-end gap-2 justify-start">
              <div className="shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center">
                <Brain className="w-3.5 h-3.5 text-white" />
              </div>
              <div className="bg-gray-800 rounded-[20px] rounded-bl-[5px] px-4 py-3 shadow-md">
                <div className="flex gap-1 items-center h-4">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input bar */}
        <div className="border-t border-gray-800 bg-gray-900 shrink-0">
          {/* Image preview strip */}
          {pendingImage && (
            <div className="px-4 pt-3 flex items-start gap-2">
              <div className="relative inline-block">
                <img src={pendingImage.preview} alt="preview" className="h-16 rounded-lg object-cover border border-gray-600" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 hover:bg-red-700 rounded-full flex items-center justify-center transition-colors"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
              <span className="text-xs text-gray-500 mt-1">Screenshot attached — ask a question about it</span>
            </div>
          )}
          <div className="px-4 py-3 flex gap-2 items-end">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleImageAttach}
            />
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isChatting}
              title="Attach screenshot"
              className="shrink-0 w-9 h-9 rounded-full bg-gray-800 hover:bg-gray-700 border border-gray-700 flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <Paperclip className={`w-4 h-4 ${pendingImage ? 'text-brand-400' : 'text-gray-400'}`} />
            </button>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder={pendingImage ? 'Ask about the screenshot...' : 'Message AI Advisor...'}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:border-brand-500 focus:outline-none transition-colors"
            />
            <button
              onClick={sendChat}
              disabled={isChatting || (!chatInput.trim() && !pendingImage)}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0 shadow-lg"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
