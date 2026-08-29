/**
 * Day Trader's Playbook — full interactive reference guide
 * Tightly integrated with live trading session awareness.
 */

import { useState, useEffect } from 'react';
import {
  Brain, Shield, TrendingUp, Clock, Activity, BookOpen,
  CheckCircle2, AlertTriangle, Target, Zap, RotateCcw,
  ChevronDown, ChevronUp, DollarSign,
} from 'lucide-react';
import { getCurrentSession, SESSION_COLOR_MAP, type SessionStatus } from '../lib/tradingSession';
import { useInvestmentStore } from '../store/investmentStore';

// ─── Live session clock ───────────────────────────────────────────────────────

function useLiveSession() {
  const [status, setStatus] = useState<SessionStatus>(getCurrentSession);
  useEffect(() => {
    const tick = () => setStatus(getCurrentSession());
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return status;
}

// ─── Session banner (standalone version) ─────────────────────────────────────

function LiveSessionPanel({ status }: { status: SessionStatus }) {
  const c = SESSION_COLOR_MAP[status.session.colorKey];
  const mins = status.minutesRemaining;
  const timeLeft = mins > 0
    ? `${Math.floor(mins / 60)}h ${mins % 60}m remaining`
    : '';

  return (
    <div className={`rounded-2xl border p-5 ${c.bg} ${c.border}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{status.session.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={`font-bold text-base ${c.text}`}>{status.session.label}</span>
              {status.session.canTrade && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-900 text-emerald-300 border border-emerald-700">
                  TRADE WINDOW
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {status.session.description}
              {timeLeft && <span className="text-gray-600">· {timeLeft}</span>}
              <span className="ml-1 text-gray-600">ET {status.etTime}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">Size:</span>
          <span className={`font-bold ${status.session.sizeMultiplier === 1 ? 'text-emerald-400' : status.session.sizeMultiplier === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
            {status.session.sizeMultiplier === 0 ? 'No trade' : `${Math.round(status.session.sizeMultiplier * 100)}%`}
          </span>
        </div>
      </div>
      <div className={`mt-3 text-sm ${c.text} border-t pt-3`} style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        {status.session.playbookAdvice}
      </div>
    </div>
  );
}

// ─── Daily routine checklist ──────────────────────────────────────────────────

const ROUTINE_ITEMS = {
  premarket: [
    { id: 'pm_wake',      label: 'Physical reset (workout / cold shower) — no phone first' },
    { id: 'pm_news',      label: 'Check overnight futures, FOMC calendar, earnings releases' },
    { id: 'pm_watchlist', label: 'Build watchlist (max 5–8 names, high relative volume)' },
    { id: 'pm_levels',    label: 'Mark key levels: prior day H/L, pre-market H/L, VWAP anchors' },
    { id: 'pm_plan',      label: 'Write exact triggers, entries, targets & stops for each setup' },
    { id: 'pm_mental',    label: '5-min breathing exercise · review yesterday\'s journal' },
    { id: 'pm_rules',     label: 'Read the 10 non-negotiable rules' },
  ],
  postmarket: [
    { id: 'post_journal',  label: 'Screenshot & journal every trade (entry, exit, emotion, lessons)' },
    { id: 'post_review',   label: 'Review stats: win rate, avg W/L, biggest mistake of the day' },
    { id: 'post_improve',  label: 'Identify one thing to improve tomorrow' },
    { id: 'post_watchlist',label: 'Start tomorrow\'s watchlist' },
    { id: 'post_unplug',   label: 'Full disconnect by 6 PM — no more market content' },
  ],
};

function RoutineChecklist() {
  const TODAY = new Date().toDateString();
  const storageKey = `playbook_routine_${TODAY}`;

  const [checked, setChecked] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  function toggle(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }

  const pmDone = ROUTINE_ITEMS.premarket.filter(i => checked.has(i.id)).length;
  const postDone = ROUTINE_ITEMS.postmarket.filter(i => checked.has(i.id)).length;

  const renderItems = (items: typeof ROUTINE_ITEMS.premarket) => items.map(item => (
    <button
      key={item.id}
      onClick={() => toggle(item.id)}
      className={`w-full flex items-start gap-3 px-4 py-2.5 rounded-lg text-left text-sm transition-colors ${
        checked.has(item.id)
          ? 'bg-emerald-950/40 text-emerald-300 line-through decoration-emerald-700'
          : 'bg-gray-900/40 text-gray-300 hover:bg-gray-800/60'
      }`}
    >
      {checked.has(item.id)
        ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500" />
        : <div className="w-4 h-4 mt-0.5 rounded border border-gray-600 shrink-0" />
      }
      {item.label}
    </button>
  ));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
            <span>🌅</span> Pre-Market Routine
          </h3>
          <span className={`text-xs font-bold ${pmDone === ROUTINE_ITEMS.premarket.length ? 'text-emerald-400' : 'text-gray-500'}`}>
            {pmDone}/{ROUTINE_ITEMS.premarket.length}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
          <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${(pmDone / ROUTINE_ITEMS.premarket.length) * 100}%` }} />
        </div>
        <div className="space-y-1.5">{renderItems(ROUTINE_ITEMS.premarket)}</div>
      </div>

      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-4 space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
            <span>📓</span> Post-Market Routine
          </h3>
          <span className={`text-xs font-bold ${postDone === ROUTINE_ITEMS.postmarket.length ? 'text-emerald-400' : 'text-gray-500'}`}>
            {postDone}/{ROUTINE_ITEMS.postmarket.length}
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
          <div className="bg-brand-500 h-1.5 rounded-full transition-all" style={{ width: `${(postDone / ROUTINE_ITEMS.postmarket.length) * 100}%` }} />
        </div>
        <div className="space-y-1.5">{renderItems(ROUTINE_ITEMS.postmarket)}</div>
        <button
          onClick={() => {
            setChecked(new Set());
            localStorage.removeItem(storageKey);
          }}
          className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400 mt-2"
        >
          <RotateCcw className="w-3 h-3" /> Reset today's checklist
        </button>
      </div>
    </div>
  );
}

// ─── Risk Management Calculator ───────────────────────────────────────────────

function RiskCalculator() {
  const { portfolio } = useInvestmentStore();
  const accountSize = portfolio.totalValue > 0 ? portfolio.totalValue : 50000;

  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [customAccount, setCustomAccount] = useState(accountSize.toFixed(0));

  const entryN = parseFloat(entry);
  const stopN = parseFloat(stop);
  const acctN = parseFloat(customAccount) || accountSize;

  const maxRisk1pct = acctN * 0.01;
  const stopDist = entryN && stopN && entryN > stopN ? entryN - stopN : 0;
  const shares = stopDist > 0 ? Math.floor(maxRisk1pct / stopDist) : 0;
  const investment = shares * (entryN || 0);
  const target2R = entryN + stopDist * 2;
  const target3R = entryN + stopDist * 3;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-brand-400" />
        Position Size Calculator (1% Rule)
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Account Size ($)</label>
          <input
            type="number"
            value={customAccount}
            onChange={e => setCustomAccount(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
            placeholder="50000"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Entry Price ($)</label>
          <input
            type="number"
            value={entry}
            onChange={e => setEntry(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
            placeholder="45.00"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Stop Price ($)</label>
          <input
            type="number"
            value={stop}
            onChange={e => setStop(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
            placeholder="44.50"
          />
        </div>
      </div>

      {shares > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Max Risk (1%)</div>
            <div className="text-base font-bold text-red-400">${maxRisk1pct.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-900 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">Shares to Buy</div>
            <div className="text-base font-bold text-emerald-400">{shares.toLocaleString()}</div>
            <div className="text-[10px] text-gray-600">≈${investment >= 1000 ? `${(investment/1000).toFixed(1)}K` : investment.toFixed(0)}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">2R Target</div>
            <div className="text-base font-bold text-brand-400">${target2R.toFixed(2)}</div>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className="text-xs text-gray-500 mb-1">3R Target</div>
            <div className="text-base font-bold text-teal-400">${target3R.toFixed(2)}</div>
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-600 italic py-2">
          Enter entry and stop prices to calculate position size.
        </div>
      )}
      <p className="text-[10px] text-gray-700">
        Formula: Shares = (Account × 1%) ÷ (Entry − Stop). Never risk more than 1% per trade.
      </p>
    </div>
  );
}

// ─── Trade setups table ───────────────────────────────────────────────────────

const SETUPS = [
  {
    name: 'Opening Range Breakout',
    emoji: '🚀',
    trigger: 'Break above/below first 15-min candle with volume ≥ 2× average',
    entry: 'On candle close above ORH',
    stop: 'Below ORH or mid-ORB',
    target: '1.5–2× ORB width',
    quality: 'A+',
  },
  {
    name: 'VWAP Reclaim',
    emoji: '🔄',
    trigger: 'Price dips below VWAP, reclaims and holds with increasing volume',
    entry: 'First candle close above VWAP',
    stop: 'Below VWAP by 1–2 ATR',
    target: 'Prior resistance',
    quality: 'A+',
  },
  {
    name: 'Bull Flag Continuation',
    emoji: '🏴',
    trigger: 'Strong impulse leg, tight consolidation (flag), low-volume pullback',
    entry: 'Break of flag\'s upper trendline',
    stop: 'Below flag low',
    target: 'Measured move = pole length',
    quality: 'A',
  },
  {
    name: 'Failed Breakdown',
    emoji: '↩️',
    trigger: 'Break below support, immediate reversal back above level with volume spike',
    entry: 'Candle close back above support',
    stop: 'Below day\'s low',
    target: 'VWAP / prior resistance',
    quality: 'A',
  },
  {
    name: 'High-of-Day Breakout',
    emoji: '🆙',
    trigger: 'New intraday high with acceleration in volume, strong sector / market tailwind',
    entry: 'Break and hold above HOD',
    stop: 'Below prior swing high',
    target: 'Pre-market high / round number',
    quality: 'B',
  },
  {
    name: 'Reversals at Key Level',
    emoji: '🔃',
    trigger: 'Price reaches daily/weekly S/R with exhaustion candle (doji, hammer)',
    entry: 'Confirmed reversal candle close',
    stop: 'Beyond the key level',
    target: 'VWAP or opposite intraday level',
    quality: 'B',
  },
];

function TradeSetupsTable() {
  const qualityCls = (q: string) =>
    q === 'A+' ? 'bg-emerald-900 text-emerald-200 border-emerald-700'
    : q === 'A' ? 'bg-green-900 text-green-300 border-green-800'
    : 'bg-yellow-900/70 text-yellow-300 border-yellow-800';

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-900/80">
            <th className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wide">Setup</th>
            <th className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wide hidden md:table-cell">Trigger</th>
            <th className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wide hidden lg:table-cell">Stop</th>
            <th className="text-left px-4 py-2.5 text-gray-500 font-semibold uppercase tracking-wide">Quality</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/60">
          {SETUPS.map(s => (
            <tr key={s.name} className="hover:bg-gray-800/30 transition-colors">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span>{s.emoji}</span>
                  <div>
                    <div className="text-gray-100 font-semibold">{s.name}</div>
                    <div className="text-gray-600 text-[11px] mt-0.5">{s.entry}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-gray-400 hidden md:table-cell max-w-xs">{s.trigger}</td>
              <td className="px-4 py-3 text-gray-400 hidden lg:table-cell">{s.stop}</td>
              <td className="px-4 py-3">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${qualityCls(s.quality)}`}>
                  {s.quality}
                </span>
                <div className="text-[10px] text-gray-600 mt-1">
                  {s.quality === 'A+' ? '100% size' : s.quality === 'A' ? '75% size' : '50% size'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── 10 Rules ─────────────────────────────────────────────────────────────────

const TEN_RULES = [
  'Never trade without a written plan. Spontaneous trades are banned.',
  'Honor every stop loss without hesitation. One bad stop breaks the entire system.',
  'Hit the daily profit target? Stop trading. Protect the gains.',
  'Hit the daily loss limit (2–3%)? Stop trading immediately. Walk away.',
  'Never trade the first 5 minutes of the open on a reactive impulse.',
  'No trade without a defined stop before entry. Exit is planned before entry.',
  'Maximum 3 losing trades in a row → mandatory 30-minute break.',
  'No trading during high-impact Fed events without halving position size.',
  'Journal every single trade. No exceptions, no "I\'ll do it later."',
  'Review the rules every morning before the market opens.',
];

const KILL_SWITCHES = [
  { label: 'Anger after a loss', color: 'red' },
  { label: 'Euphoria after a big win', color: 'red' },
  { label: 'Fear of missing out', color: 'red' },
  { label: 'Revenge mindset', color: 'red' },
  { label: 'Overconfidence', color: 'amber' },
  { label: 'Boredom trading', color: 'amber' },
  { label: 'Hope replacing analysis', color: 'amber' },
  { label: 'Fatigue', color: 'amber' },
];

function DisciplineSection() {
  const [showKills, setShowKills] = useState(false);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-2">
        <h3 className="text-sm font-bold text-brand-400 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4" /> The 10 Non-Negotiable Rules
        </h3>
        <div className="space-y-2">
          {TEN_RULES.map((rule, i) => (
            <div key={i} className="flex items-start gap-3 py-1.5 border-b border-gray-800/60 last:border-0">
              <span className="shrink-0 w-5 h-5 rounded-full bg-brand-900/60 border border-brand-800 flex items-center justify-center text-[10px] font-bold text-brand-400 mt-0.5">
                {i + 1}
              </span>
              <span className="text-sm text-gray-300 leading-snug">{rule}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5">
          <button
            className="w-full flex items-center justify-between"
            onClick={() => setShowKills(v => !v)}
          >
            <h3 className="text-sm font-bold text-red-400 uppercase tracking-wide flex items-center gap-2">
              <Zap className="w-4 h-4" /> Emotional Kill-Switches
            </h3>
            {showKills ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
          </button>
          <p className="text-xs text-gray-500 mt-1">These mental states require immediate screen-off response.</p>
          {showKills && (
            <div className="flex flex-wrap gap-2 mt-3">
              {KILL_SWITCHES.map(k => (
                <span key={k.label} className={`text-xs px-2.5 py-1 rounded-full border font-medium ${
                  k.color === 'red'
                    ? 'bg-red-950/60 text-red-400 border-red-800'
                    : 'bg-amber-950/60 text-amber-400 border-amber-800'
                }`}>
                  {k.label}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wide flex items-center gap-2">
            <Target className="w-4 h-4 text-brand-400" /> Performance Targets
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Win Rate Target', value: '≥ 60%', color: 'text-emerald-400' },
              { label: 'Min Risk:Reward', value: '2:1', color: 'text-brand-400' },
              { label: 'Daily Max Loss', value: '2–3%', color: 'text-red-400' },
              { label: 'Profit Factor', value: '≥ 1.8', color: 'text-yellow-400' },
              { label: 'Max Monthly DD', value: '≤ 5%', color: 'text-orange-400' },
              { label: 'Trades / Day', value: '3–5', color: 'text-gray-300' },
            ].map(m => (
              <div key={m.label} className="bg-gray-800/50 rounded-xl p-3 text-center">
                <div className={`text-base font-bold ${m.color}`}>{m.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Daily Habits ─────────────────────────────────────────────────────────────

const HABITS = [
  { label: 'Sleep 7–8 hrs, consistent schedule', freq: 'Non-negotiable', pct: 100 },
  { label: 'Morning exercise / movement', freq: 'Daily', pct: 95 },
  { label: 'No caffeine after 1:00 PM', freq: 'Daily', pct: 90 },
  { label: 'No alcohol on trading days', freq: 'Non-negotiable', pct: 100 },
  { label: 'Trade journal review (daily)', freq: 'Non-negotiable', pct: 100 },
  { label: 'Chart pattern study (30 min/day)', freq: 'Daily', pct: 90 },
  { label: 'Meditation / mindfulness', freq: 'Daily', pct: 85 },
  { label: 'No social media during market hours', freq: 'Non-negotiable', pct: 100 },
];

// ─── Mantras ──────────────────────────────────────────────────────────────────

const MANTRAS = [
  "The market doesn't owe you anything. It will expose every weakness in your system and your psychology. Use every loss as tuition paid toward mastery.",
  "Amateurs focus on profits. Professionals focus on risk. The money is a byproduct of flawless execution repeated over thousands of trades.",
  "You don't need to trade every day. You don't need to be in every move. Patience for the right setup is itself an edge that most traders never develop.",
  "Your job on a losing day is to lose as little as possible. Your job on a winning day is to extract maximum value from your edge. Both require equal discipline.",
];

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ id, icon: Icon, title, accent, children }: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="space-y-4">
      <div className="flex items-center gap-3 pb-2 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center">
          <Icon className={`w-4 h-4 ${accent}`} />
        </div>
        <h2 className="text-white font-bold text-base">{title}</h2>
      </div>
      {children}
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DayTraderPlaybook() {
  const status = useLiveSession();

  const navItems = [
    { id: 'session',    label: 'Live Session',  icon: Activity },
    { id: 'routine',    label: 'Daily Routine', icon: Clock },
    { id: 'risk',       label: 'Risk & Sizing', icon: Shield },
    { id: 'setups',     label: 'Trade Setups',  icon: TrendingUp },
    { id: 'discipline', label: 'Discipline',    icon: Brain },
    { id: 'habits',     label: 'Habits',        icon: BookOpen },
    { id: 'mantras',    label: 'Mantras',       icon: Zap },
  ];

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="space-y-8">

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-white font-bold text-xl flex items-center gap-2">
            <Brain className="w-5 h-5 text-brand-400" />
            Day Trader's Playbook
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Discipline · Process · Consistency — your daily operating system
          </p>
        </div>
        <div className="flex gap-1 flex-wrap">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => scrollTo(id)}
              className="text-xs px-2.5 py-1 rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Trader's creed callout */}
      <div className="bg-gradient-to-r from-brand-950/40 to-indigo-950/40 border border-brand-800 rounded-2xl p-5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-brand-400 mb-2">The Trader's Creed</p>
        <p className="text-gray-200 text-sm leading-relaxed italic">
          "I trade the setup, not my emotions. I protect capital first. I never chase, never average down,
          and never hold losers hoping they recover. Every trade is a probability game —
          my edge is process, not prediction."
        </p>
      </div>

      {/* Live session */}
      <Section id="session" icon={Activity} title="Live Trading Session" accent="text-brand-400">
        <LiveSessionPanel status={status} />
      </Section>

      {/* Daily routine checklist */}
      <Section id="routine" icon={Clock} title="Daily Routine Checklist" accent="text-emerald-400">
        <RoutineChecklist />
      </Section>

      {/* Risk & sizing */}
      <Section id="risk" icon={Shield} title="Risk Management & Position Sizing" accent="text-red-400">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Max Risk/Trade', value: '1%', color: 'text-red-400', sub: 'Hard limit, always' },
            { label: 'Daily Stop-Loss', value: '2–3%', color: 'text-red-400', sub: 'Screen off, no exceptions' },
            { label: 'Weekly Max DD', value: '5%', color: 'text-yellow-400', sub: 'Sim mode for 2 days' },
            { label: 'Min R:R Ratio', value: '2:1', color: 'text-emerald-400', sub: 'Every trade, no exceptions' },
          ].map(m => (
            <div key={m.label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center">
              <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
              <div className="text-xs text-gray-300 font-semibold mt-1">{m.label}</div>
              <div className="text-[10px] text-gray-600 mt-0.5">{m.sub}</div>
            </div>
          ))}
        </div>
        <div className="flex items-start gap-3 bg-red-950/20 border border-red-900 rounded-xl p-4 text-xs text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
          <div>
            <strong className="text-red-300 block mb-1">Cardinal Sins — Never Do These:</strong>
            Removing a stop "just this once" · Adding to a loser · Revenge trading · Trading while angry/tired/sick ·
            Sizing up after a winning streak · Holding overnight without a clear catalyst thesis.
          </div>
        </div>
        <RiskCalculator />
      </Section>

      {/* Trade setups */}
      <Section id="setups" icon={TrendingUp} title="High-Probability Trade Setups" accent="text-brand-400">
        <div className="flex items-start gap-3 bg-amber-950/20 border border-amber-900 rounded-xl p-3 text-xs text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          Only A+ and A setups get full/¾ position size. B setups get 50% size.
          If you cannot identify the setup type before entering, it's not a trade — it's a gamble.
        </div>
        <TradeSetupsTable />
      </Section>

      {/* Discipline */}
      <Section id="discipline" icon={Brain} title="Discipline & Mindset" accent="text-purple-400">
        <DisciplineSection />
      </Section>

      {/* Habits */}
      <Section id="habits" icon={BookOpen} title="Daily Habits & Lifestyle" accent="text-teal-400">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {HABITS.map(h => (
            <div key={h.label} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-xs text-gray-300 mb-1">
                  <span>{h.label}</span>
                  <span className={`${h.freq === 'Non-negotiable' ? 'text-red-400' : 'text-gray-500'} shrink-0 ml-2`}>{h.freq}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5">
                  <div
                    className="bg-gradient-to-r from-brand-500 to-teal-400 h-1.5 rounded-full"
                    style={{ width: `${h.pct}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Mantras */}
      <Section id="mantras" icon={Zap} title="Trader Mantras" accent="text-yellow-400">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MANTRAS.map((m, i) => (
            <div key={i} className="bg-gray-900/40 border border-gray-800 rounded-2xl p-5">
              <p className="text-gray-200 text-sm leading-relaxed italic">"{m}"</p>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}
