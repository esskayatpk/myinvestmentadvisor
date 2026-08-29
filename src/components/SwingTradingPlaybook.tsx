/**
 * Swing Trading Hub — strategies, tools, journal, risk guard, and AI coach
 * Framework: woofstreets × personalized 6-month mastery plan
 */

import { useState, useRef, useEffect } from 'react';
import {
  TrendingUp, Target, RotateCcw, Activity,
  CheckCircle2, Shield, Zap, DollarSign,
  ChevronDown, ChevronUp, BookOpen, Send, Brain,
  BarChart2, Calendar, Award, PlusCircle, Trash2, RefreshCw,
} from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { supabase } from '../lib/supabase';
import { isSupabaseConfigured } from '../lib/cloudSync';
import { DailyScanner, PositionMonitor, DailyBriefing } from './SwingScanner';
import type { ScanResult } from './SwingScanner';

const DB_USER = 'default';

// ─── Supabase sync helpers ────────────────────────────────────────────────────

async function dbUpsertEntries(entries: JournalEntry[]) {
  if (!isSupabaseConfigured() || entries.length === 0) return;
  await supabase.from('swing_journal').upsert(
    entries.map(e => ({
      id: e.id, user_id: DB_USER, date: e.date, ticker: e.ticker,
      strategy: e.strategy, direction: e.direction,
      entry: e.entry, stop: e.stop, target: e.target,
      exit_price: e.exitPrice ?? null,
      status: e.status, r_multiple: e.rMultiple ?? null,
      notes: e.notes, updated_at: new Date().toISOString(),
    })),
    { onConflict: 'id' }
  );
}

async function dbDeleteEntry(id: string) {
  if (!isSupabaseConfigured()) return;
  await supabase.from('swing_journal').delete().eq('id', id).eq('user_id', DB_USER);
}

async function dbLoadEntries(): Promise<JournalEntry[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await supabase
    .from('swing_journal')
    .select('*')
    .eq('user_id', DB_USER)
    .order('created_at', { ascending: false });
  if (!data) return [];
  return data.map((r: Record<string, unknown>) => ({
    id: r.id as string, date: r.date as string, ticker: r.ticker as string,
    strategy: r.strategy as Strategy, direction: r.direction as Direction,
    entry: Number(r.entry), stop: Number(r.stop), target: Number(r.target),
    exitPrice: r.exit_price != null ? Number(r.exit_price) : undefined,
    status: r.status as TradeStatus,
    rMultiple: r.r_multiple != null ? Number(r.r_multiple) : undefined,
    notes: (r.notes as string) ?? '',
  }));
}

async function dbSavePhase(phase: number) {
  if (!isSupabaseConfigured()) return;
  await supabase.from('swing_settings').upsert(
    { user_id: DB_USER, current_phase: phase, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}

async function dbLoadPhase(): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await supabase.from('swing_settings').select('current_phase').eq('user_id', DB_USER).single();
  return data ? (data.current_phase as number) : null;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Strategy = 'pullback' | 'breakout' | 'divergence';
type Direction = 'long' | 'short';
type TradeStatus = 'open' | 'won' | 'lost' | 'breakeven';

interface JournalEntry {
  id: string;
  date: string;
  ticker: string;
  strategy: Strategy;
  direction: Direction;
  entry: number;
  stop: number;
  target: number;
  exitPrice?: number;
  status: TradeStatus;
  rMultiple?: number;
  notes: string;
}

interface ChatMessage { role: 'user' | 'assistant'; content: string; }

// ─── Strategy definitions ─────────────────────────────────────────────────────

const STRATEGIES = {
  pullback: {
    name: 'Trend + Pullback',
    tag: 'Starter — Month 1+',
    color: 'emerald',
    emoji: '📈',
    tagline: 'Trade with the trend, buy the dip.',
    description: 'Enter on pullbacks to the 20-EMA or a support zone during a confirmed uptrend. This is the most repeatable, beginner-friendly swing strategy.',
    entry: 'First strong bullish candle after the pullback, with volume uptick.',
    stop: 'Below the swing low of the pullback.',
    target: '2R minimum (twice your risk distance).',
    checklist: [
      'Price is clearly above both 20-EMA and 50-EMA',
      'Price has pulled back to 20-EMA or a defined support zone',
      'RSI is in the 40–60 range (cooling, not oversold)',
      'Volume has decreased on the pullback (healthy retracement)',
      'A bullish reversal candle is forming (engulfing, hammer, doji)',
      'Volume uptick on the reversal candle',
      'Market / sector not in a downtrend',
      'Stop loss is clearly defined below the swing low',
      'R:R ratio is at least 2:1',
    ],
  },
  breakout: {
    name: 'Breakout + Retest',
    tag: 'Mature — Month 4+',
    color: 'brand',
    emoji: '🚀',
    tagline: 'Wait for the retest. Never chase the break.',
    description: 'After a breakout above a major level, wait for price to pull back and retest that level as new support. Institutions accumulate during retests.',
    entry: 'When price retests the broken level and holds (confirmed with a bullish candle).',
    stop: 'Below the retest low.',
    target: '2–3R',
    checklist: [
      'A major resistance level identified (horizontal, trendline, or consolidation)',
      'Price has broken out above the level on above-average volume',
      'Breakout close confirmed (candle closed above, not just wicked)',
      'Price has now pulled back to retest the broken level from above',
      'Retest candles are not closing back below the level',
      'RSI holding above 50 during the retest',
      'Volume decreasing on the retest (healthy pullback)',
      'No earnings or major news within 7 days',
      'Stop defined below the retest low',
    ],
  },
  divergence: {
    name: 'RSI Divergence',
    tag: 'Advanced — Month 5+',
    color: 'purple',
    emoji: '🔄',
    tagline: 'Catch reversals before the crowd sees them.',
    description: 'When price makes a new extreme but RSI does not confirm, momentum is exhausting. Combined with a key S/R level, this gives early trend-reversal entries.',
    entry: 'After a confirmed reversal candle at the divergence point.',
    stop: 'Beyond the divergence extreme (below the low for bullish, above the high for bearish).',
    target: '2–4R',
    checklist: [
      'A clear trend is in place (up or down) on the daily chart',
      'Price making a LOWER LOW — but RSI making a HIGHER LOW (bullish div)',
      'OR price making a HIGHER HIGH — but RSI making a LOWER HIGH (bearish div)',
      'Divergence visible on at least the daily timeframe',
      'Divergence occurs near a key support or resistance level',
      'A reversal candle has formed (doji, hammer, engulfing, morning/evening star)',
      'Volume shows exhaustion (spike on the extreme candle, then fade)',
      'Stop is clearly defined beyond the divergence extreme',
      'R:R ratio is at least 2:1 (ideally 3–4:1)',
    ],
  },
} as const;

// ─── 6-Month Roadmap ──────────────────────────────────────────────────────────

const PHASES = [
  {
    month: 1, title: 'Foundation', emoji: '📚', color: 'text-blue-400',
    goal: 'Understand structure. Not profit.',
    tasks: [
      'Study trend, support/resistance, RSI, EMA basics',
      'Learn to identify uptrends and downtrends on charts',
      'Paper trade 20–30 setups using Strategy 1 only',
      'Build your trading rulebook',
    ],
  },
  {
    month: 2, title: 'Paper Trading Mastery', emoji: '📝', color: 'text-cyan-400',
    goal: 'Follow rules with 80–90% discipline.',
    tasks: [
      'Execute 30–50 paper trades on Strategy 1',
      'Journal every trade with entry, exit, emotion, lessons',
      'Identify your top 3 emotional mistakes',
      'Achieve a documented 80%+ rule-following rate',
    ],
  },
  {
    month: 3, title: 'Small Live Trading', emoji: '💰', color: 'text-emerald-400',
    goal: 'Survive emotionally with real money.',
    tasks: [
      'Trade Strategy 1 only, micro-size (1/4 normal risk)',
      'Track win rate, average R, and drawdowns',
      'Never skip a stop loss — this is the non-negotiable rule',
      'Journal emotional state with every trade',
    ],
  },
  {
    month: 4, title: 'Add Strategy 2', emoji: '🚀', color: 'text-yellow-400',
    goal: 'Build consistency across two setups.',
    tasks: [
      'Introduce Breakout + Retest alongside Strategy 1',
      'Trade both strategies but keep to 50% normal risk',
      'Weekly review: what worked, what failed, why',
      'Identify and eliminate recurring bad habits',
    ],
  },
  {
    month: 5, title: 'Add Strategy 3', emoji: '🔄', color: 'text-orange-400',
    goal: 'Improve average R per trade.',
    tasks: [
      'Introduce RSI Divergence — fewer trades, more patience',
      'Reduce total trade frequency, focus on quality A+ setups',
      'Compare metrics across all three strategies',
      'Set minimum R:R filter (no trades under 2:1)',
    ],
  },
  {
    month: 6, title: 'Professionalization', emoji: '🏆', color: 'text-brand-400',
    goal: 'Become a disciplined, rule-based swing trader.',
    tasks: [
      'Build a complete written trading plan',
      'Create a monthly performance review system',
      'Track: win rate, avg R, profit factor, drawdown, monthly return',
      'Decide whether to scale position size based on proven edge',
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt$(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function colorCls(c: string) {
  if (c === 'emerald') return { bg: 'bg-emerald-950/20', border: 'border-emerald-900', text: 'text-emerald-400', bar: 'bg-emerald-500' };
  if (c === 'purple')  return { bg: 'bg-purple-950/20',  border: 'border-purple-900',  text: 'text-purple-400',  bar: 'bg-purple-500'  };
  return                       { bg: 'bg-indigo-950/20', border: 'border-indigo-900',  text: 'text-indigo-400',  bar: 'bg-indigo-500'  };
}

// ─── Collapsible section ──────────────────────────────────────────────────────

function Section({ title, emoji, border, defaultOpen = true, children }: {
  title: string; emoji: string; border: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`rounded-2xl border ${border} overflow-hidden`}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors">
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <span className="font-bold text-gray-100 text-sm">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Strategy Card ────────────────────────────────────────────────────────────

function StrategyCard({ id }: { id: Strategy }) {
  const s = STRATEGIES[id];
  const c = colorCls(s.color);
  const [checked, setChecked] = useState<Set<number>>(new Set());

  function toggle(i: number) {
    setChecked(prev => {
      const n = new Set(prev);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  }

  const score = checked.size;
  const total = s.checklist.length;
  const pct = Math.round((score / total) * 100);
  const quality = pct >= 89 ? { label: 'A+ Setup', cls: 'text-emerald-400 bg-emerald-950/60 border-emerald-700' }
    : pct >= 67 ? { label: 'B Setup — size 50%', cls: 'text-yellow-400 bg-yellow-950/60 border-yellow-800' }
    : { label: 'Below standard — skip', cls: 'text-red-400 bg-red-950/60 border-red-900' };

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{s.emoji}</span>
            <span className={`font-bold text-base ${c.text}`}>{s.name}</span>
          </div>
          <div className={`text-xs mt-1 px-2 py-0.5 rounded-full border inline-block ${c.border} ${c.text} bg-gray-900/40`}>{s.tag}</div>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-xl font-black ${c.text}`}>{pct}%</div>
          <div className="text-[10px] text-gray-500">setup score</div>
        </div>
      </div>

      <p className="text-sm text-gray-400 italic">"{s.tagline}"</p>
      <p className="text-xs text-gray-400">{s.description}</p>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className={`${c.bg} border ${c.border} rounded-lg p-2`}>
          <div className="text-gray-500 mb-1 font-semibold">Entry</div>
          <div className="text-gray-300 leading-tight">{s.entry}</div>
        </div>
        <div className={`${c.bg} border ${c.border} rounded-lg p-2`}>
          <div className="text-gray-500 mb-1 font-semibold">Stop</div>
          <div className="text-gray-300 leading-tight">{s.stop}</div>
        </div>
        <div className={`${c.bg} border ${c.border} rounded-lg p-2`}>
          <div className="text-gray-500 mb-1 font-semibold">Target</div>
          <div className="text-gray-300 leading-tight">{s.target}</div>
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-500 font-semibold uppercase tracking-wide">Setup Checklist</span>
          <span className={c.text}>{score}/{total}</span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-1.5 mb-3">
          <div className={`${c.bar} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1.5">
          {s.checklist.map((item, i) => (
            <button key={i} onClick={() => toggle(i)}
              className={`w-full flex items-start gap-2 text-left text-xs rounded-lg px-3 py-2 transition-colors ${
                checked.has(i) ? `${c.bg} ${c.text}` : 'bg-gray-900/40 text-gray-400 hover:bg-gray-800/40'
              }`}>
              {checked.has(i)
                ? <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${c.text}`} />
                : <div className="w-3.5 h-3.5 mt-0.5 rounded border border-gray-600 shrink-0" />}
              {item}
            </button>
          ))}
        </div>
        {score > 0 && (
          <div className={`mt-3 rounded-xl border p-2.5 text-xs font-semibold text-center ${quality.cls}`}>
            {quality.label}
          </div>
        )}
      </div>

      <button onClick={() => setChecked(new Set())}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400">
        <RotateCcw className="w-3 h-3" /> Reset checklist
      </button>
    </div>
  );
}

// ─── Position & Risk Calculator ───────────────────────────────────────────────

function PositionCalculator() {
  const { portfolio } = useInvestmentStore();
  const defaultAcct = portfolio.totalValue > 0 ? portfolio.totalValue : 50000;

  const [acct, setAcct] = useState(defaultAcct.toFixed(0));
  const [riskPct, setRiskPct] = useState('1');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [dir, setDir] = useState<'long' | 'short'>('long');

  const acctN  = parseFloat(acct) || defaultAcct;
  const riskN  = parseFloat(riskPct) || 1;
  const entryN = parseFloat(entry);
  const stopN  = parseFloat(stop);

  const maxRisk = acctN * (riskN / 100);
  const stopDist = entryN && stopN
    ? (dir === 'long' ? entryN - stopN : stopN - entryN)
    : 0;
  const shares = stopDist > 0 ? Math.floor(maxRisk / stopDist) : 0;
  const positionVal = shares * (entryN || 0);

  const t1 = entryN && stopDist ? (dir === 'long' ? entryN + stopDist * 2 : entryN - stopDist * 2) : 0;
  const t2 = entryN && stopDist ? (dir === 'long' ? entryN + stopDist * 3 : entryN - stopDist * 3) : 0;
  const t3 = entryN && stopDist ? (dir === 'long' ? entryN + stopDist * 4 : entryN - stopDist * 4) : 0;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-emerald-400" /> Position Sizing Calculator
      </h3>

      <div className="flex gap-2">
        {(['long', 'short'] as const).map(d => (
          <button key={d} onClick={() => setDir(d)}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
              dir === d
                ? d === 'long'
                  ? 'bg-emerald-800 text-emerald-200 border border-emerald-600'
                  : 'bg-red-900 text-red-200 border border-red-700'
                : 'bg-gray-800 text-gray-400 border border-gray-700 hover:bg-gray-700'
            }`}>
            {d === 'long' ? '📈 Long' : '📉 Short'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Account Size ($)</label>
          <input type="number" value={acct} onChange={e => setAcct(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="50000" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Risk Per Trade (%)</label>
          <input type="number" value={riskPct} onChange={e => setRiskPct(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="1" step="0.25" min="0.25" max="3" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Entry Price ($)</label>
          <input type="number" value={entry} onChange={e => setEntry(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="150.00" />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Stop Price ($)</label>
          <input type="number" value={stop} onChange={e => setStop(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="146.00" />
        </div>
      </div>

      {shares > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: `Max Risk (${riskN}%)`, val: `$${maxRisk.toFixed(0)}`, cls: 'text-red-400' },
              { label: 'Shares', val: shares.toLocaleString(), cls: 'text-emerald-400', sub: `≈$${positionVal >= 1000 ? `${(positionVal/1000).toFixed(1)}K` : positionVal.toFixed(0)}` },
              { label: 'Stop Distance', val: `$${stopDist.toFixed(2)}`, cls: 'text-gray-300' },
              { label: 'Stop %', val: `${((stopDist / entryN) * 100).toFixed(1)}%`, cls: 'text-gray-300' },
            ].map(m => (
              <div key={m.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
                <div className={`text-base font-bold ${m.cls}`}>{m.val}</div>
                {m.sub && <div className="text-[10px] text-gray-600">{m.sub}</div>}
                <div className="text-[10px] text-gray-500 mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '2R Target', val: t1, cls: 'text-brand-400', bg: 'bg-indigo-950/30 border-indigo-900' },
              { label: '3R Target', val: t2, cls: 'text-teal-400',  bg: 'bg-teal-950/30 border-teal-900' },
              { label: '4R Target', val: t3, cls: 'text-yellow-400',bg: 'bg-yellow-950/30 border-yellow-900' },
            ].map(t => (
              <div key={t.label} className={`border rounded-xl p-3 text-center ${t.bg}`}>
                <div className={`text-sm font-bold ${t.cls}`}>{fmt$(t.val)}</div>
                <div className="text-[10px] text-gray-500 mt-0.5">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">Enter entry and stop prices to calculate.</p>
      )}
    </div>
  );
}

// ─── Risk Guard ───────────────────────────────────────────────────────────────

function RiskGuard() {
  const today = new Date().toDateString();
  const weekKey = `swing_week_${getWeekKey()}`;
  const dayKey  = `swing_day_${today}`;

  function getWeekKey() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d.toDateString();
  }

  const [dayLosses,  setDayLosses]  = useState(() => parseInt(localStorage.getItem(dayKey)  || '0'));
  const [weekLosses, setWeekLosses] = useState(() => parseInt(localStorage.getItem(weekKey) || '0'));
  const [openTrades, setOpenTrades] = useState(() => parseInt(localStorage.getItem('swing_open') || '0'));

  function addLoss() {
    const d = dayLosses + 1; const w = weekLosses + 1;
    setDayLosses(d); setWeekLosses(w);
    localStorage.setItem(dayKey, d.toString());
    localStorage.setItem(weekKey, w.toString());
  }
  function resetDay() { setDayLosses(0); localStorage.setItem(dayKey, '0'); }
  function resetWeek() { setWeekLosses(0); localStorage.setItem(weekKey, '0'); }
  function setOpen(n: number) { setOpenTrades(n); localStorage.setItem('swing_open', n.toString()); }

  const dayBlocked  = dayLosses >= 2;
  const weekBlocked = weekLosses >= 6;
  const fullBlocked = dayBlocked || weekBlocked;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
        <Shield className="w-4 h-4 text-red-400" /> Risk Guard
      </h3>
      {fullBlocked && (
        <div className="bg-red-950/60 border border-red-700 rounded-xl p-4 text-sm text-red-300 font-bold text-center">
          🛑 {dayBlocked ? 'Daily loss limit reached (2)' : 'Weekly loss limit reached (6)'}
          <br /><span className="font-normal text-xs mt-1 block text-red-400">Stop trading. Protect your capital. Review what went wrong.</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Today\'s Losses', val: dayLosses, max: 2, color: dayLosses >= 2 ? 'text-red-400' : dayLosses === 1 ? 'text-yellow-400' : 'text-emerald-400' },
          { label: 'Week\'s Losses',  val: weekLosses, max: 6, color: weekLosses >= 6 ? 'text-red-400' : weekLosses >= 4 ? 'text-yellow-400' : 'text-emerald-400' },
          { label: 'Open Trades',     val: openTrades, max: 3, color: openTrades >= 3 ? 'text-red-400' : 'text-gray-300' },
        ].map(m => (
          <div key={m.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
            <div className={`text-2xl font-black ${m.color}`}>{m.val}<span className="text-sm text-gray-600">/{m.max}</span></div>
            <div className="text-[10px] text-gray-500 mt-1">{m.label}</div>
            <div className="w-full bg-gray-700 rounded-full h-1 mt-2">
              <div className={`h-1 rounded-full transition-all ${m.color.includes('red') ? 'bg-red-500' : m.color.includes('yellow') ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                style={{ width: `${Math.min((m.val / m.max) * 100, 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={addLoss} className="text-xs px-3 py-1.5 bg-red-950/40 border border-red-900 text-red-400 rounded-lg hover:bg-red-900/60 transition-colors">
          + Log a Loss
        </button>
        <button onClick={() => setOpen(Math.min(openTrades + 1, 3))} className="text-xs px-3 py-1.5 bg-indigo-950/40 border border-indigo-900 text-indigo-400 rounded-lg hover:bg-indigo-900/60 transition-colors">
          + Open Trade
        </button>
        <button onClick={() => setOpen(Math.max(openTrades - 1, 0))} className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded-lg hover:bg-gray-700 transition-colors">
          − Close Trade
        </button>
        <button onClick={resetDay} className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-500 rounded-lg hover:bg-gray-700 transition-colors">
          Reset Day
        </button>
        <button onClick={resetWeek} className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-500 rounded-lg hover:bg-gray-700 transition-colors">
          Reset Week
        </button>
      </div>
    </div>
  );
}

// ─── Trade Journal ────────────────────────────────────────────────────────────

function TradeJournal() {
  const STORAGE_KEY = 'swing_journal';
  const [entries, setEntries] = useState<JournalEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  });
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({ ticker: '', strategy: 'pullback' as Strategy, direction: 'long' as Direction, entry: '', stop: '', target: '', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [exitInputs, setExitInputs] = useState<Record<string, string>>({});

  // Load from Supabase on first mount and merge with localStorage
  useEffect(() => {
    async function load() {
      setSyncing(true);
      const remote = await dbLoadEntries();
      if (remote.length > 0) {
        const local: JournalEntry[] = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } })();
        const merged = [...remote];
        local.forEach(l => { if (!merged.find(r => r.id === l.id)) merged.push(l); });
        merged.sort((a, b) => b.id.localeCompare(a.id));
        setEntries(merged);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      }
      setSyncing(false);
    }
    load();
  }, []);

  function save(list: JournalEntry[]) {
    setEntries(list);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function addEntry() {
    if (!form.ticker || !form.entry || !form.stop) return;
    const e = parseFloat(form.entry);
    const s = parseFloat(form.stop);
    const t = parseFloat(form.target) || (form.direction === 'long' ? e + (e - s) * 2 : e - (s - e) * 2);
    const entry: JournalEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().slice(0, 10),
      ticker: form.ticker.toUpperCase(),
      strategy: form.strategy,
      direction: form.direction,
      entry: e, stop: s, target: t,
      status: 'open',
      notes: form.notes,
    };
    const next = [entry, ...entries];
    save(next);
    dbUpsertEntries([entry]);
    setForm({ ticker: '', strategy: 'pullback', direction: 'long', entry: '', stop: '', target: '', notes: '' });
    setShowForm(false);
  }

  function closeEntry(id: string, exitPrice: number) {
    const updated = entries.map(e => {
      if (e.id !== id) return e;
      const dist = e.direction === 'long' ? e.entry - e.stop : e.stop - e.entry;
      const gain = e.direction === 'long' ? exitPrice - e.entry : e.entry - exitPrice;
      const rMult = dist > 0 ? gain / dist : 0;
      const status: TradeStatus = rMult >= 0.2 ? 'won' : rMult <= -0.2 ? 'lost' : 'breakeven';
      return { ...e, exitPrice, rMultiple: rMult, status };
    });
    save(updated);
    const closed = updated.find(e => e.id === id);
    if (closed) dbUpsertEntries([closed]);
    setExitInputs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  function removeEntry(id: string) {
    save(entries.filter(e => e.id !== id));
    dbDeleteEntry(id);
  }

  const closed = entries.filter(e => e.status !== 'open');
  const wins = closed.filter(e => e.status === 'won').length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const avgR = closed.length > 0 ? closed.reduce((a, e) => a + (e.rMultiple || 0), 0) / closed.length : 0;
  const profitFactor = (() => {
    const gains = closed.filter(e => (e.rMultiple || 0) > 0).reduce((a, e) => a + (e.rMultiple || 0), 0);
    const losses = Math.abs(closed.filter(e => (e.rMultiple || 0) < 0).reduce((a, e) => a + (e.rMultiple || 0), 0));
    return losses > 0 ? gains / losses : gains > 0 ? 9.99 : 0;
  })();

  const strategyLabel: Record<Strategy, string> = { pullback: 'Trend+PB', breakout: 'BK+RT', divergence: 'RSI Div' };
  const stratColor: Record<Strategy, string> = { pullback: 'text-emerald-400', breakout: 'text-indigo-400', divergence: 'text-purple-400' };

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {closed.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Win Rate', val: `${winRate}%`, cls: winRate >= 55 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Avg R', val: avgR.toFixed(2), cls: avgR >= 1.5 ? 'text-emerald-400' : avgR >= 0 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Profit Factor', val: profitFactor.toFixed(2), cls: profitFactor >= 1.8 ? 'text-emerald-400' : profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400' },
            { label: 'Total Trades', val: closed.length.toString(), cls: 'text-gray-300' },
          ].map(m => (
            <div key={m.label} className="bg-gray-800/60 rounded-xl p-3 text-center">
              <div className={`text-xl font-black ${m.cls}`}>{m.val}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Add trade button */}
      <button onClick={() => setShowForm(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-brand-400 hover:text-brand-300 transition-colors">
        <PlusCircle className="w-4 h-4" /> {showForm ? 'Cancel' : 'Log a New Trade'}
      </button>
      {syncing && <span className="text-xs text-gray-600 flex items-center gap-1"><RefreshCw className="w-3 h-3 animate-spin" /> Syncing with cloud…</span>}

      {/* Add form */}
      {showForm && (
        <div className="bg-gray-900/60 border border-gray-700 rounded-2xl p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Ticker</label>
              <input value={form.ticker} onChange={e => setForm(f => ({ ...f, ticker: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm uppercase focus:border-brand-500 focus:outline-none" placeholder="NVDA" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Strategy</label>
              <select value={form.strategy} onChange={e => setForm(f => ({ ...f, strategy: e.target.value as Strategy }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none">
                <option value="pullback">Trend + Pullback</option>
                <option value="breakout">Breakout + Retest</option>
                <option value="divergence">RSI Divergence</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Direction</label>
              <select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as Direction }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </div>
            {(['entry', 'stop', 'target'] as const).map(field => (
              <div key={field}>
                <label className="text-xs text-gray-500 mb-1 block capitalize">{field} Price ($)</label>
                <input type="number" value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none" placeholder="0.00" />
              </div>
            ))}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes / Setup Rationale</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none resize-none"
              placeholder="Why this setup? What confirms the entry?" />
          </div>
          <button onClick={addEntry}
            className="px-4 py-2 bg-brand-700 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg transition-colors">
            Add to Journal
          </button>
        </div>
      )}

      {/* Journal table */}
      {entries.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-900/80">
                {['Date', 'Ticker', 'Strategy', 'Dir', 'Entry', 'Stop', 'Target', 'Exit / R', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-800/20 transition-colors">
                  <td className="px-3 py-2.5 text-gray-500">{e.date}</td>
                  <td className="px-3 py-2.5 font-bold text-gray-100">{e.ticker}</td>
                  <td className={`px-3 py-2.5 font-semibold ${stratColor[e.strategy]}`}>{strategyLabel[e.strategy]}</td>
                  <td className={`px-3 py-2.5 font-semibold ${e.direction === 'long' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {e.direction === 'long' ? '↑ L' : '↓ S'}
                  </td>
                  <td className="px-3 py-2.5 text-gray-300">{e.entry.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-red-400">{e.stop.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-emerald-400">{e.target.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    {e.status === 'open' ? (
                      <div className="flex items-center gap-1">
                        <input type="number" value={exitInputs[e.id] || ''} onChange={ev => setExitInputs(p => ({ ...p, [e.id]: ev.target.value }))}
                          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs focus:border-brand-500 focus:outline-none" placeholder="exit $" />
                        <button onClick={() => exitInputs[e.id] && closeEntry(e.id, parseFloat(exitInputs[e.id]))}
                          className="px-2 py-1 bg-brand-800 text-brand-200 rounded text-xs hover:bg-brand-700">✓</button>
                      </div>
                    ) : (
                      <span className={e.rMultiple !== undefined && e.rMultiple >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {e.exitPrice?.toFixed(2)} ({e.rMultiple !== undefined ? `${e.rMultiple >= 0 ? '+' : ''}${e.rMultiple.toFixed(2)}R` : '—'})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                      e.status === 'open' ? 'bg-gray-800 text-gray-400 border-gray-600'
                      : e.status === 'won' ? 'bg-emerald-900 text-emerald-300 border-emerald-700'
                      : e.status === 'breakeven' ? 'bg-gray-800 text-gray-400 border-gray-600'
                      : 'bg-red-900 text-red-300 border-red-700'
                    }`}>
                      {e.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => removeEntry(e.id)} className="text-gray-700 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic text-center py-4">No trades logged yet. Click "Log a New Trade" to start your journal.</p>
      )}
    </div>
  );
}

// ─── 6-Month Roadmap ──────────────────────────────────────────────────────────

function Roadmap() {
  const KEY = 'swing_phase';
  const [phase, setPhase] = useState(() => parseInt(localStorage.getItem(KEY) || '1'));

  useEffect(() => {
    dbLoadPhase().then(remote => {
      if (remote !== null) { setPhase(remote); localStorage.setItem(KEY, remote.toString()); }
    });
  }, []);

  function setP(n: number) {
    setPhase(n);
    localStorage.setItem(KEY, n.toString());
    dbSavePhase(n);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">Track your progress through the 6-month mastery plan. Tap a month to mark it as current.</p>
        <div className="text-xs text-gray-500">Phase <span className="text-brand-400 font-bold">{phase}</span>/6</div>
      </div>
      <div className="w-full bg-gray-800 rounded-full h-2">
        <div className="bg-gradient-to-r from-brand-500 to-teal-400 h-2 rounded-full transition-all" style={{ width: `${((phase - 1) / 5) * 100}%` }} />
      </div>
      <div className="space-y-2">
        {PHASES.map(p => (
          <div key={p.month} onClick={() => setP(p.month)}
            className={`rounded-xl border p-4 cursor-pointer transition-all ${
              phase === p.month
                ? 'bg-brand-950/40 border-brand-700'
                : phase > p.month
                  ? 'bg-emerald-950/20 border-emerald-900 opacity-70'
                  : 'bg-gray-900/30 border-gray-800 hover:border-gray-700'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{phase > p.month ? '✅' : p.emoji}</span>
                <div>
                  <span className={`font-bold text-sm ${phase === p.month ? 'text-brand-300' : phase > p.month ? 'text-emerald-400' : 'text-gray-300'}`}>
                    Month {p.month}: {p.title}
                  </span>
                  {phase === p.month && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-brand-800 text-brand-200 rounded-full">CURRENT</span>}
                </div>
              </div>
              <span className={`text-xs font-semibold ${p.color}`}>{p.goal}</span>
            </div>
            {phase === p.month && (
              <ul className="space-y-1 mt-2">
                {p.tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-gray-400">
                    <span className="text-brand-600 mt-0.5 shrink-0">▸</span> {t}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button onClick={() => setP(Math.max(1, phase - 1))} className="flex-1 py-2 text-xs text-gray-500 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">← Previous Month</button>
        <button onClick={() => setP(Math.min(6, phase + 1))} disabled={phase >= 6}
          className="flex-1 py-2 text-xs text-brand-400 bg-brand-950/40 border border-brand-800 rounded-lg hover:bg-brand-900/40 transition-colors disabled:opacity-40">
          Advance to Month {phase + 1} →
        </button>
      </div>
    </div>
  );
}

// ─── AI Swing Coach ───────────────────────────────────────────────────────────

function buildSwingContext(accountSize: number, entries: JournalEntry[], phase: number) {
  const closed = entries.filter(e => e.status !== 'open');
  const wins = closed.filter(e => e.status === 'won').length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const avgR = closed.length > 0 ? (closed.reduce((a, e) => a + (e.rMultiple || 0), 0) / closed.length).toFixed(2) : '0.00';

  const recent5 = entries.slice(0, 5).map(e =>
    `${e.date} ${e.ticker} [${e.strategy}] ${e.direction} entry:${e.entry} stop:${e.stop} → ${e.status}${e.rMultiple !== undefined ? ` (${e.rMultiple.toFixed(2)}R)` : ''}`
  ).join('\n');

  return `SWING TRADING COACH — Personalized for Sudhakar

TRADER STATUS:
- Training Phase: Month ${phase}/6 (${PHASES[phase - 1]?.title ?? 'Unknown'})
- Account Size: $${accountSize.toLocaleString()}
- Total Trades Logged: ${entries.length} (${closed.length} closed)
- Win Rate: ${winRate}%
- Average R Multiple: ${avgR}

ACTIVE STRATEGIES:
${phase >= 1 ? '✅' : '⏳'} Strategy 1: Trend + Pullback (EMA-based) — available from Month 1
${phase >= 4 ? '✅' : '⏳'} Strategy 2: Breakout + Retest — available from Month 4
${phase >= 5 ? '✅' : '⏳'} Strategy 3: RSI Divergence — available from Month 5

RISK RULES (Non-Negotiable):
- Risk 1% of account per trade ($${(accountSize * 0.01).toFixed(0)} max per trade)
- Max 3 open trades simultaneously  
- Max 2 losing trades per day → stop trading
- Max 6 losing trades per week → stop trading for the week

${recent5 ? `RECENT TRADES:\n${recent5}` : 'No trades logged yet.'}

COACHING INSTRUCTIONS:
You are a specialized swing trading coach. For EVERY response:
1. Identify which of the 3 strategies applies
2. When analyzing a stock: give specific entry, stop loss, and target levels
3. Always calculate position size using the 1% rule
4. Reference which training phase this question relates to
5. Encourage discipline and journaling
6. Keep responses clear and actionable`;
}

function SwingAICoach() {
  const { portfolio } = useInvestmentStore();
  const accountSize = portfolio.totalValue > 0 ? portfolio.totalValue : 50000;
  const phase = parseInt(localStorage.getItem('swing_phase') || '1');
  const journal: JournalEntry[] = (() => { try { return JSON.parse(localStorage.getItem('swing_journal') || '[]'); } catch { return []; } })();

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `👋 I'm your Swing Trading AI Coach. I know your three strategies, your 6-month plan (you're on **Month ${phase}**), and your account size.

Ask me anything:
- *"Analyze NVDA for a pullback entry"*
- *"Is AAPL setting up for a breakout retest?"*
- *"What's my position size if I buy at $150 with a stop at $145?"*
- *"Am I ready to move to Month ${Math.min(phase + 1, 6)}?"*`
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    setInput('');
    const userMsg: ChatMessage = { role: 'user', content: q };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      const history = [...messages, userMsg].slice(-12);
      const context = buildSwingContext(accountSize, journal, phase);
      const { data, error } = await supabase.functions.invoke('market-advisor', {
        body: { mode: 'chat', context, messages: history },
      });
      if (error || !data?.text) throw new Error(error?.message || 'No response');
      setMessages(prev => [...prev, { role: 'assistant', content: data.text }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Could not reach AI coach. Check that your Supabase edge function is deployed and ANTHROPIC_API_KEY is set.\n\n${err instanceof Error ? err.message : ''}` }]);
    } finally {
      setLoading(false);
    }
  }

  const SUGGESTIONS = [
    'Analyze NVDA for a pullback setup',
    'Is SPY in a valid uptrend for Strategy 1?',
    'What is my position size at $200 entry, $193 stop?',
    'How do I identify RSI divergence on a chart?',
    'Review my trading progress for this month',
  ];

  return (
    <div className="space-y-3">
      <div className="bg-gray-900/40 border border-gray-800 rounded-2xl flex flex-col" style={{ height: '400px' }}>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${m.role === 'user' ? 'bg-brand-700' : 'bg-emerald-800'}`}>
                {m.role === 'user' ? <span className="text-xs text-white font-bold">You</span> : <Brain className="w-3.5 h-3.5 text-emerald-200" />}
              </div>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                m.role === 'user' ? 'bg-brand-900/60 text-gray-200 rounded-tr-sm' : 'bg-gray-800/60 text-gray-300 rounded-tl-sm'
              }`}>
                <MessageText content={m.content} />
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-emerald-800 flex items-center justify-center shrink-0">
                <Brain className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
              </div>
              <div className="bg-gray-800/60 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map(j => <div key={j} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${j * 0.15}s` }} />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-gray-800 p-3 flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask your swing trading coach..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:border-brand-500 focus:outline-none"
          />
          <button onClick={send} disabled={!input.trim() || loading}
            className="w-10 h-10 bg-brand-700 hover:bg-brand-600 disabled:opacity-40 rounded-xl flex items-center justify-center transition-colors shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTIONS.map(s => (
          <button key={s} onClick={() => setInput(s)}
            className="text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded-full hover:border-brand-700 hover:text-brand-400 transition-colors">
            {s}
          </button>
        ))}
      </div>
      <button onClick={() => setMessages(prev => [prev[0]])}
        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-400">
        <RefreshCw className="w-3 h-3" /> Clear conversation
      </button>
    </div>
  );
}

/** Minimal inline markdown: bold, italic, code, line breaks */
function MessageText({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap">
      {content.split('\n').map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/);
        return (
          <div key={i}>
            {parts.map((p, j) => {
              if (p.startsWith('**') && p.endsWith('**')) return <strong key={j} className="font-semibold text-white">{p.slice(2, -2)}</strong>;
              if (p.startsWith('*') && p.endsWith('*'))   return <em key={j} className="italic text-gray-300">{p.slice(1, -1)}</em>;
              if (p.startsWith('`') && p.endsWith('`'))   return <code key={j} className="bg-gray-700 text-brand-300 px-1 rounded text-xs font-mono">{p.slice(1, -1)}</code>;
              return p;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function SwingTradingPlaybook() {
  const { portfolio } = useInvestmentStore();
  const phase = parseInt(localStorage.getItem('swing_phase') || '1');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem('swing_journal') || '[]'); } catch { return []; }
  });

  // Keep journalEntries in sync with localStorage changes from TradeJournal sub-component
  useEffect(() => {
    function onStorage() {
      try { setJournalEntries(JSON.parse(localStorage.getItem('swing_journal') || '[]')); } catch { /* ok */ }
    }
    window.addEventListener('storage', onStorage);
    const id = setInterval(onStorage, 3000); // poll every 3s for same-tab changes
    return () => { window.removeEventListener('storage', onStorage); clearInterval(id); };
  }, []);

  const openEntries = journalEntries.filter(e => e.status === 'open');
  const closed = journalEntries.filter(e => e.status !== 'open');
  const wins = closed.filter(e => e.status === 'won').length;

  // Pre-fill journal from scanner result
  function handleScannerAdd(result: ScanResult) {
    const risk = Math.abs(result.entry - result.stop);
    const target = result.entry + risk * 2;
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString().slice(0, 10),
      ticker: result.ticker,
      strategy: result.strategy,
      direction: result.strategy === 'divergence' ? 'long' : 'long',
      entry: result.entry,
      stop: result.stop,
      target,
      status: 'open',
      notes: `Scanner: ${result.reasons.slice(0, 2).join(' | ')}`,
    };
    const next = [newEntry, ...journalEntries];
    setJournalEntries(next);
    localStorage.setItem('swing_journal', JSON.stringify(next));
    dbUpsertEntries([newEntry]);
  }

  // Close open position from monitor
  function handleMonitorClose(id: string, exitPrice: number) {
    const updated = journalEntries.map(e => {
      if (e.id !== id) return e;
      const dist = e.direction === 'long' ? e.entry - e.stop : e.stop - e.entry;
      const gain = e.direction === 'long' ? exitPrice - e.entry : e.entry - exitPrice;
      const rMult = dist > 0 ? gain / dist : 0;
      const status: TradeStatus = rMult >= 0.2 ? 'won' : rMult <= -0.2 ? 'lost' : 'breakeven';
      return { ...e, exitPrice, rMultiple: rMult, status };
    });
    setJournalEntries(updated);
    localStorage.setItem('swing_journal', JSON.stringify(updated));
    const closed2 = updated.find(e => e.id === id);
    if (closed2) dbUpsertEntries([closed2]);
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-950/60 to-gray-900/60 border border-emerald-900 rounded-2xl p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">Swing Trading Playbook</h2>
            <p className="text-sm text-gray-400 mt-1">
              A process-driven, rule-based swing trading system. Three strategies. Six months to mastery. Built for disciplined execution.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Current Phase', val: `Month ${phase}`, sub: PHASES[phase - 1]?.title ?? '', icon: Calendar },
            { label: 'Trades Logged', val: journalEntries.length.toString(), sub: `${closed.length} closed`, icon: BookOpen },
            { label: 'Win Rate', val: closed.length > 0 ? `${Math.round((wins / closed.length) * 100)}%` : '—', sub: `${wins} wins`, icon: Award },
            { label: 'Account', val: portfolio.totalValue > 0 ? `$${(portfolio.totalValue / 1000).toFixed(0)}K` : 'Not set', sub: `1% = $${((portfolio.totalValue || 50000) * 0.01).toFixed(0)}`, icon: DollarSign },
          ].map(m => (
            <div key={m.label} className="bg-gray-900/50 rounded-xl p-3 flex items-center gap-3">
              <m.icon className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-bold text-white">{m.val}</div>
                <div className="text-[10px] text-gray-500">{m.label} · {m.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Core philosophy */}
      <div className="bg-gray-900/40 border border-gray-700 rounded-2xl px-5 py-4">
        <div className="flex items-center gap-2 text-sm text-gray-300">
          <Zap className="w-4 h-4 text-yellow-400 shrink-0" />
          <span><strong className="text-white">Core Takeaway:</strong> Swing trading becomes profitable when you treat it like a <em>process</em>, not a prediction game. One starter strategy → two mature strategies → 6-month discipline timeline.</span>
        </div>
      </div>

      {/* DAILY BRIEFING — top-priority action panel */}
      <Section title="Today's Buy &amp; Sell Decisions" emoji="📋" border="border-yellow-800">
        <p className="text-xs text-gray-400 -mt-1 mb-2">
          Strategy-driven buy/sell decisions for today with exact <strong className="text-white">dollar gain/loss amounts</strong>.
          Sell actions show your P&amp;L if you exit. Buy actions show your potential 2R gain. Based on 1% account risk rule.
        </p>
        <DailyBriefing
          openEntries={openEntries.map(e => ({ id: e.id, ticker: e.ticker, direction: e.direction, entry: e.entry, stop: e.stop, target: e.target, status: e.status }))}
          accountSize={portfolio.totalValue > 0 ? portfolio.totalValue : 50000}
          onAddToJournal={handleScannerAdd}
          onClose={handleMonitorClose}
        />
      </Section>

      {/* DAILY SCANNER — finds today's setups */}
      <Section title="📡 Daily Opportunity Scanner" emoji="" border="border-emerald-900">
        <p className="text-xs text-gray-400 -mt-1 mb-2">
          Scans your watchlist using the three swing strategies (Trend+Pullback, Breakout+Retest, RSI Divergence).
          Results are ranked by setup quality. Click "Add to Journal" to log a trade instantly.
        </p>
        <DailyScanner onAddToJournal={handleScannerAdd} />
      </Section>

      {/* POSITION MONITOR — stop loss alerts */}
      <Section title="⚠️ Open Position Monitor — Stop Loss Alerts" emoji="" border={openEntries.some(() => true) ? 'border-orange-900' : 'border-gray-700'}>
        <p className="text-xs text-gray-400 -mt-1 mb-2">
          Live prices for all open journal trades. Alerts when stop is near or triggered — with a specific reason to act.
          Auto-refreshes every 5 minutes.
        </p>
        <PositionMonitor
          openEntries={openEntries.map(e => ({ id: e.id, ticker: e.ticker, direction: e.direction, entry: e.entry, stop: e.stop, target: e.target, status: e.status }))}
          onClose={handleMonitorClose}
        />
      </Section>

      {/* Strategies */}
      <Section title="Strategies — Setup Checklists" emoji="📊" border="border-gray-700">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {(['pullback', 'breakout', 'divergence'] as Strategy[]).map(id => (
            <StrategyCard key={id} id={id} />
          ))}
        </div>
      </Section>

      {/* Tools row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Position Sizing & Risk/Reward" emoji="💰" border="border-emerald-900" defaultOpen>
          <PositionCalculator />
        </Section>
        <Section title="Risk Guard — Daily & Weekly Limits" emoji="🛡️" border="border-red-900" defaultOpen>
          <RiskGuard />
        </Section>
      </div>

      {/* Journal */}
      <Section title="Trade Journal" emoji="📓" border="border-indigo-900">
        <div className="text-xs text-gray-500 mb-2">
          Log every trade. Review the data weekly. Patterns will emerge.
          <span className="text-brand-400 font-semibold ml-2">No journaling = no feedback loop = no improvement.</span>
        </div>
        <TradeJournal />
      </Section>

      {/* Roadmap */}
      <Section title="6-Month Mastery Roadmap" emoji="🗓️" border="border-brand-900">
        <Roadmap />
      </Section>

      {/* Success metrics */}
      <Section title="What Success Looks Like" emoji="🏆" border="border-yellow-900" defaultOpen={false}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { metric: '2–5 trades/week', desc: 'Quality over quantity', icon: Activity },
            { metric: '1–5% monthly', desc: 'Consistent returns', icon: TrendingUp },
            { metric: '≤ 5% max DD', desc: 'Capital preservation', icon: Shield },
            { metric: '≥ 55% win rate', desc: 'With 2:1 R:R minimum', icon: Target },
            { metric: 'Written plan', desc: 'Every trade, every time', icon: BookOpen },
            { metric: 'Weekly review', desc: 'Metrics-driven feedback', icon: BarChart2 },
          ].map(m => (
            <div key={m.metric} className="bg-gray-800/40 border border-gray-700 rounded-xl p-3 text-center">
              <m.icon className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
              <div className="text-sm font-bold text-white">{m.metric}</div>
              <div className="text-[10px] text-gray-500 mt-0.5">{m.desc}</div>
            </div>
          ))}
        </div>
        <div className="bg-yellow-950/30 border border-yellow-900 rounded-xl p-4 mt-2">
          <h4 className="text-xs font-bold text-yellow-400 mb-2">Your Personalized Strengths (Sudhakar-specific)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400">
            {[
              '✅ Structured plans → you will thrive with the 6-month framework',
              '✅ Repeatable systems → the 3-strategy rulebook plays to your strength',
              '✅ Business-like execution → treat every trade like a business decision',
              '✅ Analytical mindset → metrics-driven weekly review will accelerate growth',
            ].map(s => <div key={s}>{s}</div>)}
          </div>
        </div>
      </Section>

      {/* AI Coach */}
      <Section title="AI Swing Coach — Ask Anything" emoji="🤖" border="border-brand-900">
        <div className="flex items-start gap-3 mb-3 bg-brand-950/30 border border-brand-900 rounded-xl p-3">
          <Brain className="w-4 h-4 text-brand-400 shrink-0 mt-0.5" />
          <p className="text-xs text-gray-400">
            Your AI coach knows your three strategies, your 6-month plan, and your account stats. Ask it to analyze any stock, calculate position sizes, review your progress, or explain any concept.
            <span className="text-yellow-500 ml-1">⚠️ Requires Supabase + ANTHROPIC_API_KEY configured.</span>
          </p>
        </div>
        <SwingAICoach />
      </Section>
    </div>
  );
}
