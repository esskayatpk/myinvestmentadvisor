/**
 * Options Trading Playbook — 7-strategy framework from woofstreets.com
 * Covers: Scale-Out, Expiration, Lottery-Ticket Mistake, Rolling,
 *         Flow Confirmation, The Golden Rule, and Final Takeaways.
 */

import { useState } from 'react';
import {
  TrendingUp, TrendingDown, Target, RotateCcw, Activity,
  AlertTriangle, CheckCircle2, Shield, Zap, DollarSign,
  ChevronDown, ChevronUp, BookOpen, Award,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type OptionType = 'call' | 'put';

// ─── Scale-Out Calculator ─────────────────────────────────────────────────────

const SCALE_LEVELS = [
  { pct: 25, sell: '2 contracts', label: 'Lock initial gains', color: 'emerald' },
  { pct: 55, sell: '2 contracts', label: 'Reduce exposure, let rest ride', color: 'brand' },
  { pct: 100, sell: '1–2 contracts', label: 'Home run exit', color: 'teal' },
];

function ScaleOutCalculator() {
  const [premium, setPremium] = useState('');
  const [contracts, setContracts] = useState('4');

  const prem = parseFloat(premium) || 0;
  const ctrs = parseInt(contracts) || 4;
  const cost = prem * ctrs * 100;

  const levels = SCALE_LEVELS.map(l => ({
    ...l,
    exitValue: prem * (1 + l.pct / 100),
    profit: prem * (l.pct / 100) * 100 * ctrs,
  }));

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-emerald-400" />
        Scale-Out Calculator
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Premium Paid (per contract, $)</label>
          <input
            type="number"
            value={premium}
            onChange={e => setPremium(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
            placeholder="2.50"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Number of Contracts</label>
          <input
            type="number"
            value={contracts}
            onChange={e => setContracts(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
            placeholder="4"
          />
        </div>
      </div>

      {cost > 0 && (
        <div className="text-xs text-gray-500">
          Total cost: <span className="text-red-400 font-semibold">${cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
        </div>
      )}

      <div className="space-y-2">
        {levels.map(l => (
          <div
            key={l.pct}
            className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
              l.color === 'emerald' ? 'bg-emerald-950/30 border-emerald-900' :
              l.color === 'teal'   ? 'bg-teal-950/30 border-teal-900' :
                                     'bg-indigo-950/30 border-indigo-900'
            }`}
          >
            <div>
              <div className="text-sm font-semibold text-gray-100">+{l.pct}% → Sell {l.sell}</div>
              <div className="text-xs text-gray-500 mt-0.5">{l.label}</div>
            </div>
            {prem > 0 && (
              <div className="text-right">
                <div className={`text-sm font-bold ${
                  l.color === 'emerald' ? 'text-emerald-400' :
                  l.color === 'teal'   ? 'text-teal-400' : 'text-indigo-400'
                }`}>
                  ${l.exitValue.toFixed(2)}/contract
                </div>
                <div className="text-xs text-gray-500">+${l.profit >= 1000 ? `${(l.profit/1000).toFixed(1)}K` : l.profit.toFixed(0)} total</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-700">
        Small wins pay for the right to hold big winners. Never let a winner go to zero.
      </p>
    </div>
  );
}

// ─── Options P&L Calculator ────────────────────────────────────────────────────

function OptionsPnLCalculator() {
  const [optType, setOptType] = useState<OptionType>('call');
  const [strike, setStrike] = useState('');
  const [premium, setPremium] = useState('');
  const [contracts, setContracts] = useState('1');
  const [currentPrice, setCurrentPrice] = useState('');
  const [dte, setDte] = useState('');

  const s = parseFloat(strike);
  const p = parseFloat(premium);
  const c = parseInt(contracts) || 1;
  const cp = parseFloat(currentPrice);
  const d = parseInt(dte) || 0;

  const intrinsic = s && cp
    ? optType === 'call' ? Math.max(0, cp - s) : Math.max(0, s - cp)
    : 0;

  const breakEven = s && p
    ? optType === 'call' ? s + p : s - p
    : 0;

  const pnl = p && intrinsic !== undefined ? (intrinsic - p) * c * 100 : null;
  const pnlPct = p ? ((intrinsic - p) / p) * 100 : null;

  const thetaWarning = d > 0 && d <= 7;
  const thetaModerate = d > 7 && d <= 21;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <Activity className="w-4 h-4 text-brand-400" />
        Options P&amp;L Calculator
      </h3>

      <div className="flex gap-2">
        {(['call', 'put'] as OptionType[]).map(t => (
          <button
            key={t}
            onClick={() => setOptType(t)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              optType === t
                ? t === 'call'
                  ? 'bg-emerald-800 text-emerald-200 border border-emerald-600'
                  : 'bg-red-900 text-red-200 border border-red-700'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}
          >
            {t === 'call' ? '📈 Call' : '📉 Put'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Strike Price ($)</label>
          <input type="number" value={strike} onChange={e => setStrike(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="450" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Premium Paid ($)</label>
          <input type="number" value={premium} onChange={e => setPremium(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="3.50" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Contracts</label>
          <input type="number" value={contracts} onChange={e => setContracts(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="1" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Current Stock Price ($)</label>
          <input type="number" value={currentPrice} onChange={e => setCurrentPrice(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="460" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Days to Expiry (DTE)</label>
          <input type="number" value={dte} onChange={e => setDte(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="45" />
        </div>
      </div>

      {thetaWarning && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-900 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          ≤7 DTE — theta decay is severe. Avoid holding into expiry unless deeply ITM.
        </div>
      )}
      {thetaModerate && (
        <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-950/40 border border-yellow-900 rounded-lg px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          8–21 DTE — accelerating theta. Monitor closely and consider rolling.
        </div>
      )}

      {s > 0 && p > 0 && cp > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Break-Even</div>
            <div className="text-base font-bold text-yellow-400">${breakEven.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Intrinsic Value</div>
            <div className={`text-base font-bold ${intrinsic > 0 ? 'text-emerald-400' : 'text-gray-500'}`}>
              ${intrinsic.toFixed(2)}
            </div>
          </div>
          <div className={`rounded-xl p-3 text-center ${pnl !== null && pnl >= 0 ? 'bg-emerald-950/40 border border-emerald-900' : 'bg-red-950/40 border border-red-900'}`}>
            <div className="text-xs text-gray-500 mb-1">P&amp;L (at current price)</div>
            <div className={`text-base font-bold ${pnl !== null && pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnl !== null ? `${pnl >= 0 ? '+' : ''}$${Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
            </div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Return %</div>
            <div className={`text-base font-bold ${pnlPct !== null && pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {pnlPct !== null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%` : '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({
  title, emoji, color, badge, children,
}: {
  title: string; emoji: string; color: string;
  badge?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`rounded-2xl border ${color} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <span className="font-bold text-gray-100 text-sm">{title}</span>
          {badge && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">
              {badge}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Flow Confirmation Checker ────────────────────────────────────────────────

const BULLISH_FLOW = [
  'Calls lifting the ask (paying up)',
  'Volume > Open Interest (new money entering)',
  'Rising implied volatility',
  'Repeated sweeps across multiple exchanges',
];

const BEARISH_FLOW = [
  'Puts hitting below the bid (urgency to sell)',
  'Volume > Open Interest (new bearish positioning)',
  'Aggressive downside positioning',
  'Rising implied volatility with puts',
];

function FlowChecker() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (k: string) => setChecked(p => ({ ...p, [k]: !p[k] }));

  const bullScore = BULLISH_FLOW.filter((_, i) => checked[`bull_${i}`]).length;
  const bearScore = BEARISH_FLOW.filter((_, i) => checked[`bear_${i}`]).length;

  const verdict =
    bullScore >= 3 && bullScore > bearScore ? 'BULLISH'
    : bearScore >= 3 && bearScore > bullScore ? 'BEARISH'
    : bullScore === bearScore && bullScore >= 2 ? 'MIXED'
    : 'INSUFFICIENT';

  const verdictConfig = {
    BULLISH: { cls: 'bg-emerald-950/60 border-emerald-700 text-emerald-300', label: '📈 Bullish Flow Confirmed' },
    BEARISH: { cls: 'bg-red-950/60 border-red-700 text-red-300', label: '📉 Bearish Flow Confirmed' },
    MIXED: { cls: 'bg-yellow-950/60 border-yellow-700 text-yellow-300', label: '⚠️ Mixed / Unclear Flow' },
    INSUFFICIENT: { cls: 'bg-gray-800/60 border-gray-700 text-gray-400', label: '🔍 Check more flow signals' },
  };

  const vc = verdictConfig[verdict];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-emerald-950/20 border border-emerald-900 rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> Bullish Flow Signals ({bullScore}/{BULLISH_FLOW.length})
          </div>
          {BULLISH_FLOW.map((item, i) => (
            <button key={i} onClick={() => toggle(`bull_${i}`)}
              className={`w-full flex items-start gap-2 text-left text-xs rounded-lg px-3 py-2 transition-colors ${
                checked[`bull_${i}`] ? 'bg-emerald-900/40 text-emerald-300' : 'bg-gray-900/40 text-gray-400 hover:bg-gray-800/40'
              }`}>
              {checked[`bull_${i}`] ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" /> : <div className="w-3.5 h-3.5 mt-0.5 rounded border border-gray-600 shrink-0" />}
              {item}
            </button>
          ))}
        </div>

        <div className="bg-red-950/20 border border-red-900 rounded-xl p-4 space-y-2">
          <div className="text-xs font-bold text-red-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5" /> Bearish Flow Signals ({bearScore}/{BEARISH_FLOW.length})
          </div>
          {BEARISH_FLOW.map((item, i) => (
            <button key={i} onClick={() => toggle(`bear_${i}`)}
              className={`w-full flex items-start gap-2 text-left text-xs rounded-lg px-3 py-2 transition-colors ${
                checked[`bear_${i}`] ? 'bg-red-900/40 text-red-300' : 'bg-gray-900/40 text-gray-400 hover:bg-gray-800/40'
              }`}>
              {checked[`bear_${i}`] ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-500" /> : <div className="w-3.5 h-3.5 mt-0.5 rounded border border-gray-600 shrink-0" />}
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className={`rounded-xl border p-3 text-sm font-semibold text-center ${vc.cls}`}>
        {vc.label}
      </div>
      <p className="text-[10px] text-gray-600">
        Flow tells you WHAT traders are doing. Charts tell you WHETHER they're right.
        Never trade flow by itself.
      </p>
      <button
        onClick={() => setChecked({})}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400"
      >
        <RotateCcw className="w-3 h-3" /> Reset
      </button>
    </div>
  );
}

// ─── Golden Rule visualizer ───────────────────────────────────────────────────

const GOLDEN_PILLARS = [
  {
    key: 'flow', label: 'Flow', icon: Activity, color: 'emerald',
    description: 'Provides conviction — unusual options activity, sweeps, prints',
    checks: ['Volume > OI (new positioning)', 'Calls lifting ask / puts at bid', 'Repeated sweeps', 'Rising IV in direction'],
  },
  {
    key: 'levels', label: 'Levels', icon: Target, color: 'brand',
    description: 'Provides location — key support/resistance, VWAP, prior highs/lows',
    checks: ['Price near key S/R level', 'Daily/weekly structure respected', 'VWAP alignment', 'Clean chart level (not messy area)'],
  },
  {
    key: 'trend', label: 'Trend', icon: TrendingUp, color: 'teal',
    description: 'Provides direction — higher highs/lows, EMA alignment, sector strength',
    checks: ['Price above 21 EMA', 'Higher highs & higher lows', 'Sector trending with trade', 'Market not in choppy chop'],
  },
];

function GoldenRule() {
  const [pillarChecks, setPillarChecks] = useState<Record<string, boolean>>({});

  const toggle = (k: string) => setPillarChecks(p => ({ ...p, [k]: !p[k] }));

  const scores = GOLDEN_PILLARS.map(p => ({
    ...p,
    score: p.checks.filter((_, i) => pillarChecks[`${p.key}_${i}`]).length,
  }));

  const totalScore = scores.reduce((a, s) => a + s.score, 0);
  const maxScore = GOLDEN_PILLARS.reduce((a, p) => a + p.checks.length, 0);
  const probability = Math.round((totalScore / maxScore) * 100);

  const tradeQuality =
    probability >= 75 ? { label: 'High Probability Setup', cls: 'text-emerald-400 bg-emerald-950/60 border-emerald-700' }
    : probability >= 50 ? { label: 'Moderate Setup — size down', cls: 'text-yellow-400 bg-yellow-950/60 border-yellow-800' }
    : { label: 'Low Probability — skip or wait', cls: 'text-red-400 bg-red-950/60 border-red-900' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3 flex-wrap text-sm font-bold text-gray-200 py-2">
        <span className="flex items-center gap-1.5 bg-emerald-950/40 border border-emerald-800 px-3 py-1.5 rounded-lg">
          <Activity className="w-3.5 h-3.5 text-emerald-400" /> Flow
        </span>
        <span className="text-gray-600">+</span>
        <span className="flex items-center gap-1.5 bg-indigo-950/40 border border-indigo-800 px-3 py-1.5 rounded-lg">
          <Target className="w-3.5 h-3.5 text-indigo-400" /> Levels
        </span>
        <span className="text-gray-600">+</span>
        <span className="flex items-center gap-1.5 bg-teal-950/40 border border-teal-800 px-3 py-1.5 rounded-lg">
          <TrendingUp className="w-3.5 h-3.5 text-teal-400" /> Trend
        </span>
        <span className="text-gray-600">=</span>
        <span className="flex items-center gap-1.5 bg-yellow-950/40 border border-yellow-700 px-3 py-1.5 rounded-lg text-yellow-400">
          <Award className="w-3.5 h-3.5" /> Highest Probability
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {scores.map(pillar => {
          const Icon = pillar.icon;
          const colorCls = pillar.color === 'emerald' ? { bg: 'bg-emerald-950/20', border: 'border-emerald-900', text: 'text-emerald-400', bar: 'bg-emerald-500' }
            : pillar.color === 'teal' ? { bg: 'bg-teal-950/20', border: 'border-teal-900', text: 'text-teal-400', bar: 'bg-teal-500' }
            : { bg: 'bg-indigo-950/20', border: 'border-indigo-900', text: 'text-indigo-400', bar: 'bg-indigo-500' };

          return (
            <div key={pillar.key} className={`${colorCls.bg} border ${colorCls.border} rounded-xl p-4 space-y-2`}>
              <div className={`text-xs font-bold uppercase tracking-wide ${colorCls.text} flex items-center gap-1.5`}>
                <Icon className="w-3.5 h-3.5" /> {pillar.label} ({pillar.score}/{pillar.checks.length})
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className={`${colorCls.bar} h-1.5 rounded-full transition-all`} style={{ width: `${(pillar.score / pillar.checks.length) * 100}%` }} />
              </div>
              <div className="text-[10px] text-gray-500 mb-2">{pillar.description}</div>
              <div className="space-y-1.5">
                {pillar.checks.map((check, i) => (
                  <button key={i} onClick={() => toggle(`${pillar.key}_${i}`)}
                    className={`w-full flex items-start gap-2 text-left text-xs rounded-lg px-2.5 py-1.5 transition-colors ${
                      pillarChecks[`${pillar.key}_${i}`] ? `${colorCls.bg} ${colorCls.text}` : 'bg-gray-900/40 text-gray-400 hover:bg-gray-800/40'
                    }`}>
                    {pillarChecks[`${pillar.key}_${i}`] ? <CheckCircle2 className={`w-3 h-3 mt-0.5 shrink-0 ${colorCls.text}`} /> : <div className="w-3 h-3 mt-0.5 rounded border border-gray-600 shrink-0" />}
                    {check}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={`rounded-xl border p-4 flex items-center justify-between ${tradeQuality.cls}`}>
        <span className="text-sm font-bold">{tradeQuality.label}</span>
        <div className="text-right">
          <div className="text-2xl font-black">{probability}%</div>
          <div className="text-[10px] opacity-70">confidence score</div>
        </div>
      </div>

      <button onClick={() => setPillarChecks({})} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400">
        <RotateCcw className="w-3 h-3" /> Reset
      </button>
    </div>
  );
}

// ─── Daily Options Checklist ──────────────────────────────────────────────────

const OPTIONS_CHECKLIST = [
  { id: 'plan', label: 'Have a written trade plan before entering (ticker, strike, expiry, stop)' },
  { id: 'dte', label: 'DTE ≥ 21 days to avoid rapid theta decay' },
  { id: 'delta', label: 'Delta 0.4–0.7 (ATM or slightly ITM) — no lottery tickets' },
  { id: 'flow', label: 'Confirmed unusual options flow (volume > OI, sweeps)' },
  { id: 'levels', label: 'Price near a clean, defined support/resistance level' },
  { id: 'trend', label: 'Trend aligned: EMAs stacked, higher highs/lows' },
  { id: 'size', label: 'Position sized so max loss ≤ 1–2% of account' },
  { id: 'scale', label: 'Scale-out levels defined in advance (+25%, +55%, +100%)' },
  { id: 'roll', label: 'Rolling plan ready if trade goes against (strike + DTE adjustment)' },
  { id: 'stop', label: 'Exit trigger defined: -50% premium loss = stop (hard rule)' },
];

function OptionsChecklist() {
  const TODAY = new Date().toDateString();
  const storageKey = `options_checklist_${TODAY}`;

  const [checked, setChecked] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(storageKey) || '[]')); }
    catch { return new Set(); }
  });

  const toggle = (id: string) => setChecked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    localStorage.setItem(storageKey, JSON.stringify([...next]));
    return next;
  });

  const done = OPTIONS_CHECKLIST.filter(i => checked.has(i.id)).length;
  const allGreen = done === OPTIONS_CHECKLIST.length;

  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-bold text-gray-200 flex items-center gap-2">
          <Shield className="w-4 h-4 text-brand-400" /> Pre-Trade Options Checklist
        </div>
        <span className={`text-xs font-bold ${allGreen ? 'text-emerald-400' : 'text-gray-500'}`}>{done}/{OPTIONS_CHECKLIST.length}</span>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
        <div className={`h-1.5 rounded-full transition-all ${allGreen ? 'bg-emerald-500' : 'bg-brand-500'}`} style={{ width: `${(done / OPTIONS_CHECKLIST.length) * 100}%` }} />
      </div>
      <div className="space-y-1.5">
        {OPTIONS_CHECKLIST.map(item => (
          <button key={item.id} onClick={() => toggle(item.id)}
            className={`w-full flex items-start gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-colors ${
              checked.has(item.id) ? 'bg-emerald-950/40 text-emerald-300 line-through decoration-emerald-700' : 'bg-gray-900/40 text-gray-300 hover:bg-gray-800/60'
            }`}>
            {checked.has(item.id) ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" /> : <div className="w-4 h-4 mt-0.5 rounded border border-gray-600 shrink-0" />}
            {item.label}
          </button>
        ))}
      </div>
      {allGreen && (
        <div className="bg-emerald-950/40 border border-emerald-800 rounded-xl p-3 text-center text-sm text-emerald-300 font-semibold mt-2">
          ✅ All checks passed — you're cleared to trade
        </div>
      )}
      <button onClick={() => { setChecked(new Set()); localStorage.removeItem(storageKey); }}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 mt-2">
        <RotateCcw className="w-3 h-3" /> Reset today
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function OptionsPlaybook() {
  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-950/60 to-gray-900/60 border border-indigo-900 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Options Trading Playbook</h2>
            <p className="text-sm text-gray-400 mt-1">
              Building positions, managing risk &amp; letting winners work.
              Seven-strategy framework for high-probability options trades.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[10px] text-gray-500">
          {['Scale Out', 'Buy Time', 'No Lottery', 'Roll It', 'Use Flow', 'Flow+Levels+Trend'].map(t => (
            <div key={t} className="bg-gray-800/50 rounded-lg py-1.5 px-1 text-gray-400 font-medium">{t}</div>
          ))}
        </div>
      </div>

      {/* Strategy 1 — Scale Out of Winners */}
      <Section title="1. Scale Out of Winners" emoji="🏆" color="border-emerald-900 bg-emerald-950/10" badge="Short-term contracts">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-2">
          {SCALE_LEVELS.map(l => (
            <div key={l.pct} className={`rounded-xl p-4 text-center border ${
              l.color === 'emerald' ? 'bg-emerald-950/40 border-emerald-800' :
              l.color === 'teal'   ? 'bg-teal-950/40 border-teal-800' :
                                     'bg-indigo-950/40 border-indigo-800'
            }`}>
              <div className={`text-2xl font-black mb-1 ${
                l.color === 'emerald' ? 'text-emerald-400' :
                l.color === 'teal'   ? 'text-teal-400' : 'text-indigo-400'
              }`}>+{l.pct}%</div>
              <div className="text-sm font-semibold text-gray-200">Sell {l.sell}</div>
              <div className="text-xs text-gray-500 mt-1">{l.label}</div>
            </div>
          ))}
        </div>
        <ul className="text-xs text-gray-400 space-y-1 pl-1">
          <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /> Locks in gains early — no more watching winners become losers</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /> Reduces emotional pressure — house money runs the rest</li>
          <li className="flex items-start gap-2"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" /> Lets remaining contracts capture large moves</li>
        </ul>
        <ScaleOutCalculator />
      </Section>

      {/* Strategy 2 — Expiration is Insurance */}
      <Section title="2. Expiration is Insurance, Not a Deadline" emoji="🛡️" color="border-blue-900 bg-blue-950/10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-blue-300 uppercase tracking-wide">Why longer-dated contracts win</h4>
            {[
              { label: 'More time for thesis to play out', icon: '⏳' },
              { label: 'Less theta decay per day', icon: '📉' },
              { label: 'Greater flexibility to roll or adjust', icon: '🔄' },
              { label: 'Absorbs short-term volatility noise', icon: '🔇' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900/40 rounded-lg px-3 py-2">
                <span>{item.icon}</span> {item.label}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-red-400 uppercase tracking-wide">Avoid these expiration mistakes</h4>
            {[
              { label: 'Holding options with ≤7 DTE unless deeply ITM', icon: '❌' },
              { label: 'Forcing trades into short expirations', icon: '❌' },
              { label: 'Treating expiry as "must exit" deadline', icon: '❌' },
              { label: 'Buying weeklies as a shortcut to big wins', icon: '❌' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 text-sm text-red-400/80 bg-red-950/20 rounded-lg px-3 py-2">
                <span>{item.icon}</span> {item.label}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-blue-950/30 border border-blue-900 rounded-xl p-4 mt-2">
          <div className="text-xs font-bold text-blue-300 mb-2">Theta Decay Speed Guide</div>
          <div className="space-y-2">
            {[
              { dte: '45–90 DTE', decay: 'Slow', color: 'bg-emerald-500 w-1/4', note: 'Buy zone — sweet spot' },
              { dte: '21–44 DTE', decay: 'Moderate', color: 'bg-yellow-500 w-1/2', note: 'Consider rolling or exiting' },
              { dte: '8–20 DTE', decay: 'Fast', color: 'bg-orange-500 w-3/4', note: 'High risk if OTM' },
              { dte: '≤7 DTE', decay: 'Severe', color: 'bg-red-500 w-full', note: '⚠️ Avoid unless deeply ITM' },
            ].map(row => (
              <div key={row.dte} className="grid grid-cols-3 gap-2 items-center text-xs">
                <span className="text-gray-400 font-mono">{row.dte}</span>
                <div className="bg-gray-800 rounded-full h-2"><div className={`${row.color} h-2 rounded-full`} /></div>
                <span className="text-gray-500">{row.note}</span>
              </div>
            ))}
          </div>
        </div>
        <OptionsPnLCalculator />
      </Section>

      {/* Strategy 3 — Avoid Lottery Ticket */}
      <Section title='3. Avoid the "Lottery Ticket" Mistake' emoji="🎰" color="border-red-900 bg-red-950/10">
        <div className="bg-red-950/30 border border-red-900 rounded-xl p-4 mb-3">
          <div className="text-xs font-bold text-red-400 mb-2">Far OTM options require ALL of these simultaneously:</div>
          <div className="grid grid-cols-2 gap-2 text-xs text-red-300/80">
            {['Stock must move far', 'Stock must move fast', 'Volatility must cooperate', 'Time must remain'].map(r => (
              <div key={r} className="flex items-center gap-2 bg-red-950/40 rounded-lg px-3 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" /> {r}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-900/60 border border-gray-700 rounded-xl overflow-hidden">
          <div className="grid grid-cols-3 text-[10px] font-bold text-gray-500 uppercase tracking-wide bg-gray-900/80 px-4 py-2">
            <span>Strike Type</span><span>Delta Range</span><span>Verdict</span>
          </div>
          {[
            { type: 'Far OTM', delta: '0.05 – 0.20', verdict: '❌ Lottery ticket', cls: 'text-red-400 bg-red-950/20' },
            { type: 'OTM', delta: '0.20 – 0.40', verdict: '⚠️ Speculative', cls: 'text-yellow-400 bg-yellow-950/10' },
            { type: 'ATM', delta: '0.40 – 0.60', verdict: '✅ Focus zone', cls: 'text-emerald-400 bg-emerald-950/20' },
            { type: 'Slightly ITM', delta: '0.60 – 0.75', verdict: '✅ High probability', cls: 'text-emerald-400 bg-emerald-950/30' },
            { type: 'Deep ITM', delta: '0.75+', verdict: '⚠️ Low leverage', cls: 'text-gray-400 bg-gray-800/40' },
          ].map(row => (
            <div key={row.type} className={`grid grid-cols-3 px-4 py-2.5 text-sm border-t border-gray-800 ${row.cls}`}>
              <span className="font-semibold">{row.type}</span>
              <span className="font-mono text-xs text-gray-400">{row.delta}</span>
              <span className="text-xs">{row.verdict}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Probability beats cheapness. A $0.10 option looks cheap but is almost always a full loss.
          Pay for probability — buy ATM or slightly ITM with reasonable delta.
        </p>
      </Section>

      {/* Strategy 4 — Rolling Strategy */}
      <Section title="4. The Rolling Strategy" emoji="🔄" color="border-purple-900 bg-purple-950/10">
        <p className="text-sm text-gray-400">
          After securing profits, roll a portion of your gains into a new position.
          Use house money — the original trade paid for the next one.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-emerald-950/20 border border-emerald-900 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> For Calls (Bullish)
            </div>
            {[
              { step: '1', label: 'Roll higher in strike', detail: 'Lock realized gains, stay in the trend' },
              { step: '2', label: 'Roll further in time', detail: 'Add DTE to reduce theta risk' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-emerald-800 text-emerald-200 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                <div>
                  <div className="text-sm font-semibold text-gray-200">{s.label}</div>
                  <div className="text-xs text-gray-500">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="bg-red-950/20 border border-red-900 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-red-400 uppercase tracking-wide flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5" /> For Puts (Bearish)
            </div>
            {[
              { step: '1', label: 'Roll lower in strike', detail: 'Follow the downtrend, add downside exposure' },
              { step: '2', label: 'Roll further in time', detail: 'Give thesis time to play out fully' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-red-800 text-red-200 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{s.step}</div>
                <div>
                  <div className="text-sm font-semibold text-gray-200">{s.label}</div>
                  <div className="text-xs text-gray-500">{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-purple-950/30 border border-purple-900 rounded-xl p-3 text-xs text-purple-300">
          <BookOpen className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          <strong>Key principle:</strong> If the new position fails, the original trade already paid for it.
          Use house money to stay in the trend.
        </div>
      </Section>

      {/* Strategy 5 — Flow Confirmation */}
      <Section title="5. Use Flow as Confirmation" emoji="🌊" color="border-cyan-900 bg-cyan-950/10">
        <p className="text-sm text-gray-400 mb-2">
          Check the flow signals you see in real-time. Flow reveals intent, but intent alone isn't enough —
          it must align with levels and trend.
        </p>
        <FlowChecker />
      </Section>

      {/* Strategy 6 — The Golden Rule */}
      <Section title="6. The Golden Rule" emoji="🎯" color="border-yellow-900 bg-yellow-950/10" badge="Highest Probability">
        <GoldenRule />
      </Section>

      {/* Strategy 7 — Final Takeaways + Checklist */}
      <Section title="7. Final Takeaways & Pre-Trade Checklist" emoji="📋" color="border-gray-700 bg-gray-900/30">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {[
            { icon: '📝', title: 'Have a plan', desc: 'Before the trade' },
            { icon: '📤', title: 'Scale out', desc: 'Secure gains' },
            { icon: '🛡️', title: 'Manage risk', desc: 'Protect capital always' },
            { icon: '🔄', title: 'Stay flexible', desc: 'Roll when advantage exists' },
            { icon: '🌊', title: 'Use flow for intent', desc: 'Levels for confirmation' },
            { icon: '🏆', title: 'Be patient', desc: 'High-quality trades take time' },
          ].map(t => (
            <div key={t.title} className="bg-gray-800/40 border border-gray-700 rounded-xl p-3 text-center">
              <div className="text-2xl mb-1">{t.icon}</div>
              <div className="text-xs font-bold text-gray-200">{t.title}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{t.desc}</div>
            </div>
          ))}
        </div>
        <OptionsChecklist />
        <div className="mt-4 bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-400 italic">
            "Flow gives you intention. The chart and levels solidify the idea."
          </p>
          <p className="text-xs text-gray-600 mt-1">— woofstreets.com</p>
        </div>
      </Section>
    </div>
  );
}
