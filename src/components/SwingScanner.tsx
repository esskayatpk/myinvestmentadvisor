/**
 * Swing Trading Scanner & Open Position Monitor
 * Applies all three swing strategies using live market data + technical analysis.
 * Provides daily trade opportunities and real-time stop-loss alerts.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle, TrendingUp, RefreshCw,
  PlusCircle, CheckCircle2, XCircle, Activity, Target,
  Bell, ChevronDown, ChevronUp, Clock, DollarSign, ArrowUpCircle, ArrowDownCircle, Minus,
} from 'lucide-react';
import { fetchQuotes, fetchPriceHistory } from '../lib/marketData';
import {
  calcRSI, calcMACD, calcATR, calcBollingerBands,
  lastEMA,
} from '../lib/technicalAnalysis';
import type { PriceBar } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Strategy = 'pullback' | 'breakout' | 'divergence';

export interface JournalEntryMin {
  id: string; ticker: string; direction: 'long' | 'short';
  entry: number; stop: number; target: number; status: string;
}

export interface ScanResult {
  ticker: string;
  name: string;
  strategy: Strategy;
  price: number;
  entry: number;
  stop: number;
  target2R: number;
  target3R: number;
  rrRatio: number;
  confidence: number;
  reasons: string[];
  atr: number;
  rsi: number;
  ema20: number;
  ema50: number;
}

export type AlertLevel = 'stop_hit' | 'near_stop' | 'take_partial' | 'trail_stop' | 'on_track';

export interface PositionStatus {
  entry: JournalEntryMin;
  currentPrice: number;
  pctToStop: number;
  pctToTarget: number;
  currentR: number;
  unrealizedPct: number;
  alert: AlertLevel;
  trailingStop?: number;
  sellReasons: string[];
}

// ─── Default Watchlist ────────────────────────────────────────────────────────

export const DEFAULT_WATCHLIST = [
  'AAPL', 'NVDA', 'MSFT', 'AMD', 'META', 'GOOGL', 'TSLA',
  'AMZN', 'JPM', 'GS', 'NFLX', 'CRM', 'AVGO', 'PLTR',
  'SPY', 'QQQ', 'IWM', 'UBER', 'ARM', 'MRVL',
];

// ─── Core scanner logic ───────────────────────────────────────────────────────
// Each detect* function scores a setup 0–100 using additive confidence points.
// Conditions add or subtract points; the function returns valid=true only if the
// total reaches the minimum threshold, preventing low-quality signals.

function detectPullback(closes: number[], bars: PriceBar[], price: number): {
  valid: boolean; confidence: number; reasons: string[];
  entry: number; stop: number; atr: number;
} {
  const reasons: string[] = [];
  let confidence = 0;
  const atr = calcATR(bars, 14);
  const ema20 = lastEMA(closes, 20);
  const ema50 = lastEMA(closes, 50);
  const rsi = calcRSI(closes, 14);
  const macd = calcMACD(closes);

  // Must be in uptrend — hard requirement; fail-fast if price is below the trend filter.
  if (price > ema20) { confidence += 20; reasons.push('Price above 20-EMA — uptrend intact'); }
  else return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, atr };

  if (price > ema50) { confidence += 15; reasons.push('Price above 50-EMA — medium-term bullish'); }
  else { confidence -= 10; }

  // Must be pulling back toward 20-EMA
  const pctFromEMA20 = ((price - ema20) / ema20) * 100;
  if (pctFromEMA20 >= -1 && pctFromEMA20 <= 4) {
    confidence += 25; reasons.push(`Price within ${pctFromEMA20.toFixed(1)}% of 20-EMA — ideal pullback zone`);
  } else if (pctFromEMA20 > 8) {
    confidence -= 20; reasons.push('Price too extended above 20-EMA — wait for pullback');
  }

  // RSI cooling but not oversold
  if (rsi >= 38 && rsi <= 58) { confidence += 20; reasons.push(`RSI ${rsi.toFixed(0)} — momentum cooling, not oversold`); }
  else if (rsi < 35) { confidence += 5; reasons.push(`RSI ${rsi.toFixed(0)} — oversold, bounce possible but risky`); }
  else if (rsi > 65) { confidence -= 15; reasons.push(`RSI ${rsi.toFixed(0)} — overbought, not a pullback entry`); }

  // MACD confirmation
  if (macd.histogram > 0) { confidence += 10; reasons.push('MACD histogram positive — bullish momentum'); }
  else if (macd.histogram < -0.05) { confidence -= 5; reasons.push('MACD histogram negative — momentum weakening'); }

  // Higher lows in last 20 bars?
  const recent20Lows = bars.slice(-20).map(b => b.low);
  const firstHalf = Math.min(...recent20Lows.slice(0, 10));
  const secondHalf = Math.min(...recent20Lows.slice(10));
  if (secondHalf > firstHalf) { confidence += 10; reasons.push('Higher lows pattern confirmed — healthy pullback structure'); }

  const entry = price;
  const swingLow = Math.min(...bars.slice(-5).map(b => b.low));
  const stop = Math.max(swingLow - atr * 0.3, price - atr * 1.5);

  return { valid: confidence >= 50, confidence: Math.min(confidence, 95), reasons, entry, stop, atr };
}

function detectBreakoutRetest(closes: number[], bars: PriceBar[], price: number): {
  valid: boolean; confidence: number; reasons: string[];
  entry: number; stop: number; resistanceLevel: number; atr: number;
} {
  const reasons: string[] = [];
  let confidence = 0;
  const atr = calcATR(bars, 14);
  const rsi = calcRSI(closes, 14);
  const bb = calcBollingerBands(closes, 20, 2);

  // Find prior resistance: highest close in bars 40-5 ago (avoid very recent)
  const priorBars = bars.slice(-50, -5);
  if (priorBars.length < 10) return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, resistanceLevel: 0, atr };
  const resistanceLevel = Math.max(...priorBars.map(b => b.high));

  // Price must be above the resistance (breakout confirmed)
  if (price <= resistanceLevel) return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, resistanceLevel, atr };

  // Breakout must have happened recently (within last 10 bars)
  const brokeOutRecently = bars.slice(-10).some(b => b.close > resistanceLevel);
  if (!brokeOutRecently) return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, resistanceLevel, atr };

  confidence += 20;
  reasons.push(`Breakout confirmed above $${resistanceLevel.toFixed(2)} resistance`);

  // Price should be retesting the level (within 4% above resistance)
  const pctAboveResistance = ((price - resistanceLevel) / resistanceLevel) * 100;
  if (pctAboveResistance >= 0 && pctAboveResistance <= 4) {
    confidence += 30; reasons.push(`Price retesting breakout level — ${pctAboveResistance.toFixed(1)}% above prior resistance`);
  } else if (pctAboveResistance > 8) {
    confidence -= 15; reasons.push('Price too far from breakout level — wait for deeper retest');
  }

  // Volume confirmation (if available — recent bars should show declining volume on retest)
  const recentVol = bars.slice(-3).reduce((a, b) => a + b.volume, 0) / 3;
  const avgVol = bars.slice(-20).reduce((a, b) => a + b.volume, 0) / 20;
  if (recentVol < avgVol * 0.8) { confidence += 15; reasons.push('Volume decreasing on retest — healthy consolidation'); }
  else if (recentVol > avgVol * 1.5) { confidence += 10; reasons.push('Volume elevated on retest — high interest at this level'); }

  // RSI holding above 50 during retest
  if (rsi >= 50) { confidence += 15; reasons.push(`RSI ${rsi.toFixed(0)} — staying above 50 during retest (bullish)`); }
  else { confidence -= 10; }

  // MACD bullish
  const macdBr = calcMACD(closes);
  if (macdBr.histogram > 0) { confidence += 10; reasons.push('MACD bullish — momentum supports continuation'); }

  // BB — not overbought
  if (price < bb.upper) { confidence += 5; reasons.push('Price below upper Bollinger Band — not overbought'); }

  const entry = price;
  const stop = resistanceLevel - atr * 0.5;

  return { valid: confidence >= 55, confidence: Math.min(confidence, 92), reasons, entry, stop, resistanceLevel, atr };
}

function detectRSIDivergence(closes: number[], bars: PriceBar[], price: number): {
  valid: boolean; confidence: number; reasons: string[];
  entry: number; stop: number; atr: number; type: 'bullish' | 'bearish';
} {
  const reasons: string[] = [];
  let confidence = 0;
  const atr = calcATR(bars, 14);

  if (closes.length < 30) return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, atr, type: 'bullish' };

  // Compute RSI at two different points to detect divergence
  const rsiNow = calcRSI(closes.slice(-15), 14);
  const rsiPrior = calcRSI(closes.slice(-30, -10), 14);

  // Find price lows in two windows
  const recentLow = Math.min(...closes.slice(-8));
  const priorLow  = Math.min(...closes.slice(-25, -8));

  // BULLISH DIVERGENCE: Price making lower low, RSI making higher low
  if (recentLow < priorLow && rsiNow > rsiPrior) {
    confidence += 35;
    reasons.push(`Bullish divergence: price lower low ($${recentLow.toFixed(2)}) but RSI higher low (${rsiNow.toFixed(0)} vs ${rsiPrior.toFixed(0)})`);

    // Near support? (price near lower Bollinger Band)
    const bb = calcBollingerBands(closes, 20, 2);
    if (price < bb.middle && price > bb.lower) {
      confidence += 20; reasons.push('Price between lower BB and midline — potential bounce zone');
    }
    if (price <= bb.lower * 1.02) {
      confidence += 25; reasons.push('Price at lower Bollinger Band — statistically oversold, high bounce probability');
    }

    // Reversal candle in last 3 bars?
    const lastBar = bars[bars.length - 1];
    const bodySize = Math.abs(lastBar.close - lastBar.open);
    const wickSize = lastBar.high - Math.max(lastBar.close, lastBar.open);
    if (lastBar.close > lastBar.open && bodySize > (lastBar.high - lastBar.low) * 0.5) {
      confidence += 15; reasons.push('Strong bullish candle confirming reversal');
    } else if (wickSize > bodySize * 1.5) {
      confidence += 10; reasons.push('Long lower wick shows sellers being rejected at this level');
    }

    const entry = price;
    const stop = Math.min(...bars.slice(-5).map(b => b.low)) - atr * 0.3;
    return { valid: confidence >= 55, confidence: Math.min(confidence, 90), reasons, entry, stop, atr, type: 'bullish' };
  }

  // BEARISH DIVERGENCE: Price making higher high, RSI making lower high
  const recentHigh = Math.max(...closes.slice(-8));
  const priorHigh  = Math.max(...closes.slice(-25, -8));
  if (recentHigh > priorHigh && rsiNow < rsiPrior) {
    confidence += 30;
    reasons.push(`Bearish divergence: price higher high ($${recentHigh.toFixed(2)}) but RSI lower high (${rsiNow.toFixed(0)} vs ${rsiPrior.toFixed(0)})`);
    if (rsiNow > 65) { confidence += 20; reasons.push(`RSI ${rsiNow.toFixed(0)} — overbought territory, reversal risk elevated`); }
    const entry = price;
    const stop = Math.max(...bars.slice(-5).map(b => b.high)) + atr * 0.3;
    return { valid: confidence >= 50, confidence: Math.min(confidence, 88), reasons, entry, stop, atr, type: 'bearish' };
  }

  return { valid: false, confidence: 0, reasons: [], entry: 0, stop: 0, atr, type: 'bullish' };
}

async function analyzeStock(ticker: string, nameMap: Record<string, string>): Promise<ScanResult | null> {
  try {
    const bars = await fetchPriceHistory(ticker, '6mo', '1d');
    if (bars.length < 50) return null;

    const closes = bars.map(b => b.close);
    const price = closes[closes.length - 1];
    const ema20 = lastEMA(closes, 20);
    const ema50 = lastEMA(closes, 50);
    const rsi = calcRSI(closes, 14);

    // Try each strategy in priority order
    const pullback  = detectPullback(closes, bars, price);
    const breakout  = detectBreakoutRetest(closes, bars, price);
    const divergence = detectRSIDivergence(closes, bars, price);

    // Pick highest-confidence valid signal
    const candidates = [
      pullback.valid  ? { strategy: 'pullback'    as Strategy, ...pullback }  : null,
      breakout.valid  ? { strategy: 'breakout'    as Strategy, ...breakout }  : null,
      divergence.valid ? { strategy: 'divergence' as Strategy, ...divergence } : null,
    ].filter(Boolean).sort((a, b) => (b!.confidence) - (a!.confidence));

    const best = candidates[0];
    if (!best) return null;

    const risk = Math.abs(best.entry - best.stop);
    if (risk <= 0) return null;
    const target2R = best.strategy === 'divergence' && (divergence as { type: string }).type === 'bearish'
      ? best.entry - risk * 2
      : best.entry + risk * 2;
    const target3R = best.strategy === 'divergence' && (divergence as { type: string }).type === 'bearish'
      ? best.entry - risk * 3
      : best.entry + risk * 3;

    return {
      ticker,
      name: nameMap[ticker] ?? ticker,
      strategy: best.strategy,
      price,
      entry: best.entry,
      stop: best.stop,
      target2R,
      target3R,
      rrRatio: parseFloat((risk > 0 ? (Math.abs(target2R - best.entry) / risk) : 0).toFixed(2)),
      confidence: best.confidence,
      reasons: best.reasons.slice(0, 4),
      atr: best.atr,
      rsi,
      ema20,
      ema50,
    };
  } catch {
    return null;
  }
}

// ─── Position Monitor logic ───────────────────────────────────────────────────

// buildPositionStatus evaluates a single open trade against its current market
// price and returns a structured alert with trailing-stop guidance and sell reasons.
// R-multiple = (current gain) ÷ (original risk distance); negative = losing trade.
function buildPositionStatus(entry: JournalEntryMin, currentPrice: number): PositionStatus {
  const isLong = entry.direction === 'long';
  const risk = Math.abs(entry.entry - entry.stop);
  const currentGain = isLong ? currentPrice - entry.entry : entry.entry - currentPrice;
  const currentR = risk > 0 ? currentGain / risk : 0;
  const distToStop = isLong ? currentPrice - entry.stop : entry.stop - currentPrice;
  const pctToStop = (distToStop / entry.entry) * 100;
  const distToTarget = isLong ? entry.target - currentPrice : currentPrice - entry.target;
  const pctToTarget = (distToTarget / entry.entry) * 100;
  const unrealizedPct = (currentGain / entry.entry) * 100;

  const sellReasons: string[] = [];
  let alert: AlertLevel = 'on_track';
  let trailingStop: number | undefined;

  if (pctToStop <= 0) {
    // Stop hit
    alert = 'stop_hit';
    sellReasons.push(`Stop loss at $${entry.stop.toFixed(2)} triggered — exit to preserve capital`);
    sellReasons.push(`Price moved ${Math.abs(pctToStop).toFixed(1)}% below your stop level`);
    sellReasons.push('Rule: Honor every stop loss without hesitation — one bad stop breaks the system');
    if (currentR < -1) sellReasons.push(`Loss of ${Math.abs(currentR).toFixed(2)}R — exceeds 1R risk budget, immediate action required`);
  } else if (pctToStop <= 2) {
    // Near stop — warning
    alert = 'near_stop';
    sellReasons.push(`Price within ${pctToStop.toFixed(1)}% of stop ($${entry.stop.toFixed(2)}) — monitor very closely`);
    sellReasons.push('Prepare to exit. Do not lower your stop loss to "give it more room"');
    if (currentR < 0) sellReasons.push('Currently at a loss — stick to your plan');
  } else if (currentR >= 2) {
    // At 2R target — consider partial exit
    alert = 'take_partial';
    sellReasons.push(`Trade at +${currentR.toFixed(2)}R — approaching 2R target of $${entry.target.toFixed(2)}`);
    sellReasons.push('Per scale-out rules: sell 50% of position here, let rest run');
    sellReasons.push('Consider moving stop to breakeven to protect gains on remaining position');
    trailingStop = entry.entry; // move to breakeven
  } else if (currentR >= 1) {
    // At 1R — trail to breakeven
    alert = 'trail_stop';
    sellReasons.push(`Trade at +${currentR.toFixed(2)}R — move stop to breakeven ($${entry.entry.toFixed(2)})`);
    sellReasons.push('This ensures worst case = no loss. Let the trade run toward 2R target');
    trailingStop = entry.entry;
  }

  return { entry, currentPrice, pctToStop, pctToTarget, currentR, unrealizedPct, alert, trailingStop, sellReasons };
}

// ─── Daily Briefing — buy/sell decisions with $ amounts ──────────────────────

interface BriefingDecision {
  type: 'sell_stop' | 'sell_target' | 'sell_partial' | 'trail_stop' | 'buy';
  ticker: string;
  name?: string;
  strategy?: string;
  currentPrice: number;
  entry: number;
  stop?: number;
  target?: number;
  shares: number;
  dollarPnl: number;         // + = gain, - = loss
  dollarGainAtTarget?: number;
  accountRisk: number;
  reason: string;
  urgency: 'critical' | 'high' | 'normal';
  entryMin?: JournalEntryMin;
}

// Shares = (account × riskPct%) ÷ stop_distance — the standard 1% risk rule.
// Math.floor ensures we never exceed the risk budget due to rounding.
function calcShares(accountSize: number, entry: number, stop: number, riskPct = 1): number {
  const risk = accountSize * (riskPct / 100);
  const stopDist = Math.abs(entry - stop);
  return stopDist > 0 ? Math.floor(risk / stopDist) : 0;
}

interface BriefingProps {
  openEntries: JournalEntryMin[];
  accountSize: number;
  onAddToJournal: (r: ScanResult) => void;
  onClose: (id: string, exitPrice: number) => void;
}

const BRIEFING_SCAN_LIST = ['AAPL', 'NVDA', 'MSFT', 'AMD', 'META', 'GOOGL', 'SPY', 'QQQ', 'AMZN', 'JPM'];

export function DailyBriefing({ openEntries, accountSize, onAddToJournal, onClose }: BriefingProps) {
  const [decisions, setDecisions]   = useState<BriefingDecision[]>([]);
  const [loading, setLoading]       = useState(false);
  const [lastRun, setLastRun]       = useState('');
  const [exitInputs, setExitInputs] = useState<Record<string, string>>({});

  const run = useCallback(async () => {
    setLoading(true);
    const all: BriefingDecision[] = [];

    // ── SELL decisions: check all open positions ──────────────────────────
    if (openEntries.length > 0) {
      const tickers = [...new Set(openEntries.map(e => e.ticker))];
      const quotes  = await fetchQuotes(tickers).catch(() => ({} as Record<string, { price: number }>));

      openEntries.forEach(e => {
        const q = (quotes as Record<string, { price: number }>)[e.ticker];
        const price = q?.price ?? e.entry;
        const isLong  = e.direction === 'long';
        const shares  = calcShares(accountSize, e.entry, e.stop);
        const gain    = isLong ? price - e.entry : e.entry - price;
        const dollarPnl = shares * gain;
        const risk    = Math.abs(e.entry - e.stop);
        const rMult   = risk > 0 ? gain / risk : 0;
        const pctAboveStop = isLong
          ? ((price - e.stop) / e.stop) * 100
          : ((e.stop - price) / e.stop) * 100;

        if (pctAboveStop <= 0) {
          // Stop hit
          all.push({
            type: 'sell_stop', ticker: e.ticker, currentPrice: price,
            entry: e.entry, stop: e.stop, shares,
            dollarPnl, accountRisk: shares * risk,
            reason: `Stop loss at $${e.stop.toFixed(2)} triggered. Protecting capital — exit immediately.`,
            urgency: 'critical', entryMin: e,
          });
        } else if (pctAboveStop <= 2) {
          // Near stop
          all.push({
            type: 'trail_stop', ticker: e.ticker, currentPrice: price,
            entry: e.entry, stop: e.stop, shares,
            dollarPnl, accountRisk: shares * risk,
            reason: `Price within ${pctAboveStop.toFixed(1)}% of stop. Prepare to exit. Do not move stop down.`,
            urgency: 'high', entryMin: e,
          });
        } else if (rMult >= 2) {
          // At or past 2R target
          const dollarGainAtTarget = shares * risk * 2;
          all.push({
            type: 'sell_target', ticker: e.ticker, currentPrice: price,
            entry: e.entry, target: e.target, shares: Math.floor(shares / 2),
            dollarPnl: dollarPnl,
            dollarGainAtTarget,
            accountRisk: shares * risk,
            reason: `Target reached at +${rMult.toFixed(1)}R. Scale out 50% here. Move stop to breakeven on remaining.`,
            urgency: 'high', entryMin: e,
          });
        } else if (rMult >= 1) {
          // At 1R — trail to breakeven
          all.push({
            type: 'trail_stop', ticker: e.ticker, currentPrice: price,
            entry: e.entry, stop: e.entry, shares,
            dollarPnl, accountRisk: 0,
            reason: `Up ${rMult.toFixed(1)}R. Move stop to breakeven ($${e.entry.toFixed(2)}) — risk-free trade.`,
            urgency: 'normal', entryMin: e,
          });
        }
      });
    }

    // ── BUY decisions: quick scan of top liquid stocks ────────────────────
    const nameMap: Record<string, string> = {};
    const q2 = await fetchQuotes(BRIEFING_SCAN_LIST).catch(() => ({}));
    Object.entries(q2).forEach(([t, q]) => { nameMap[t] = (q as { shortName?: string }).shortName ?? t; });

    const buyResults: ScanResult[] = [];
    for (const ticker of BRIEFING_SCAN_LIST.slice(0, 8)) {
      const r = await analyzeStock(ticker, nameMap);
      if (r && r.confidence >= 60) buyResults.push(r);
      if (buyResults.length >= 3) break;
    }

    buyResults.forEach(r => {
      const shares = calcShares(accountSize, r.entry, r.stop);
      const risk   = Math.abs(r.entry - r.stop);
      const dollarGainAtTarget = shares * risk * 2;
      all.push({
        type: 'buy', ticker: r.ticker, name: r.name, strategy: r.strategy,
        currentPrice: r.price, entry: r.entry, stop: r.stop, target: r.target2R,
        shares, dollarPnl: 0,
        dollarGainAtTarget,
        accountRisk: shares * risk,
        reason: r.reasons.slice(0, 2).join(' · '),
        urgency: r.confidence >= 75 ? 'high' : 'normal',
      });
    });

    // Sort: critical first, then buys
    all.sort((a, b) => {
      const o: Record<string, number> = { critical: 0, high: 1, normal: 2 };
      if (a.urgency !== b.urgency) return o[a.urgency] - o[b.urgency];
      if (a.type === 'sell_stop') return -1;
      if (b.type === 'sell_stop') return 1;
      return 0;
    });

    setDecisions(all);
    setLastRun(new Date().toLocaleTimeString());
    setLoading(false);
  }, [openEntries, accountSize]);

  // Auto-runs on mount so the briefing is ready when the user opens the tab.
  // useCallback dependency array ensures it re-runs if account size or open positions change.
  useEffect(() => { run(); }, [run]);

  const sells  = decisions.filter(d => d.type === 'sell_stop' || d.type === 'sell_target' || d.type === 'sell_partial');
  const trails  = decisions.filter(d => d.type === 'trail_stop');
  const buys    = decisions.filter(d => d.type === 'buy');
  // Net dollar outcome if the user follows every sell action (gains minus losses).
  const netPnl  = sells.reduce((a, d) => a + d.dollarPnl, 0);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">{today}</h3>
          {lastRun && <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Clock className="w-3 h-3" /> Updated {lastRun}</div>}
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-900/40 border border-emerald-800 text-emerald-400 rounded-lg hover:bg-emerald-800/60 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Running…' : 'Refresh'}
        </button>
      </div>

      {loading && decisions.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-6 animate-pulse">Fetching prices and scanning setups…</div>
      )}

      {/* Net P&L banner */}
      {sells.length > 0 && (
        <div className={`rounded-2xl border p-4 flex items-center justify-between ${netPnl >= 0 ? 'bg-emerald-950/40 border-emerald-800' : 'bg-red-950/40 border-red-800'}`}>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Net P&amp;L if you take all sell actions today</div>
            <div className={`text-2xl font-black mt-1 ${netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netPnl >= 0 ? '+' : ''}{netPnl.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
            </div>
          </div>
          <DollarSign className={`w-8 h-8 opacity-30 ${netPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`} />
        </div>
      )}

      {/* SELL / ACTION decisions */}
      {(sells.length > 0 || trails.length > 0) && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <ArrowDownCircle className="w-3.5 h-3.5 text-red-400" /> Positions Requiring Action Today
          </div>
          {[...sells, ...trails].map((d, i) => {
            const isStop    = d.type === 'sell_stop';
            const isTarget  = d.type === 'sell_target';
            const isTrail   = d.type === 'trail_stop';
            const borderCls = isStop ? 'border-red-800 bg-red-950/40' : isTarget ? 'border-emerald-800 bg-emerald-950/30' : 'border-indigo-800 bg-indigo-950/30';
            const icon      = isStop ? <XCircle className="w-4 h-4 text-red-400 shrink-0" /> : isTarget ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <TrendingUp className="w-4 h-4 text-indigo-400 shrink-0" />;
            const label     = isStop ? '🛑 EXIT — STOP HIT' : isTarget ? '✅ TAKE PROFITS — TARGET' : '📈 MOVE TRAILING STOP';

            return (
              <div key={i} className={`rounded-xl border ${borderCls} p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {icon}
                    <div>
                      <div className="font-black text-white text-sm">{d.ticker}</div>
                      <div className={`text-xs font-semibold ${isStop ? 'text-red-400' : isTarget ? 'text-emerald-400' : 'text-indigo-400'}`}>{label}</div>
                    </div>
                  </div>
                  {!isTrail && (
                    <div className="text-right">
                      <div className={`text-xl font-black ${d.dollarPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {d.dollarPnl >= 0 ? '+' : ''}{d.dollarPnl.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                      </div>
                      <div className="text-[10px] text-gray-500">{d.shares} shares × ${Math.abs(d.currentPrice - d.entry).toFixed(2)}/sh</div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-center">
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <div className="text-gray-500">Entry</div>
                    <div className="font-semibold text-gray-300">${d.entry.toFixed(2)}</div>
                  </div>
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <div className="text-gray-500">Current</div>
                    <div className={`font-bold ${d.currentPrice >= d.entry ? 'text-emerald-400' : 'text-red-400'}`}>${d.currentPrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-gray-900/40 rounded-lg p-2">
                    <div className="text-gray-500">Shares</div>
                    <div className="font-semibold text-gray-300">{d.shares}</div>
                  </div>
                </div>

                <div className={`text-xs rounded-lg px-3 py-2 ${isStop ? 'bg-red-950/60 text-red-300' : isTarget ? 'bg-emerald-950/60 text-emerald-300' : 'bg-indigo-950/60 text-indigo-300'}`}>
                  {d.reason}
                </div>

                {isStop && d.entryMin && (
                  <div className="flex items-center gap-2">
                    <input type="number" value={exitInputs[d.entryMin.id] || d.currentPrice.toFixed(2)}
                      onChange={e => setExitInputs(p => ({ ...p, [d.entryMin!.id]: e.target.value }))}
                      className="flex-1 bg-gray-900 border border-red-800 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
                      placeholder="Exit price" />
                    <button onClick={() => {
                      const p = parseFloat(exitInputs[d.entryMin!.id] || d.currentPrice.toFixed(2));
                      if (p > 0) onClose(d.entryMin!.id, p);
                    }} className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-red-100 text-sm font-bold rounded-lg transition-colors">
                      Exit Now
                    </button>
                  </div>
                )}
                {isTarget && d.entryMin && (
                  <button onClick={() => onClose(d.entryMin!.id, d.currentPrice)}
                    className="w-full py-2 bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-sm font-bold rounded-lg transition-colors">
                    Take Profits — Close at ${d.currentPrice.toFixed(2)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* BUY decisions */}
      {buys.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-2">
            <ArrowUpCircle className="w-3.5 h-3.5 text-emerald-400" /> Buy Opportunities Today
          </div>
          {buys.map((d, i) => (
            <div key={i} className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-black text-white text-sm">{d.ticker} <span className="text-gray-500 font-normal text-xs">{d.name}</span></div>
                  <div className="text-xs text-emerald-400 font-semibold capitalize">{d.strategy?.replace('pullback','Trend+Pullback').replace('breakout','Breakout+Retest').replace('divergence','RSI Divergence')}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Potential 2R gain</div>
                  <div className="text-lg font-black text-emerald-400">
                    +{d.dollarGainAtTarget?.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[10px] text-gray-500">{d.shares} sh × ${d.target ? (d.target - d.entry).toFixed(2) : '—'}/sh</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs text-center">
                {[
                  { label: 'Entry',    val: `$${d.entry.toFixed(2)}`,            cls: 'text-white' },
                  { label: 'Stop',     val: `$${d.stop?.toFixed(2) ?? '—'}`,     cls: 'text-red-400' },
                  { label: '2R Target',val: `$${d.target?.toFixed(2) ?? '—'}`,   cls: 'text-emerald-400' },
                  { label: 'Risk',     val: d.accountRisk.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }), cls: 'text-orange-400' },
                ].map(m => (
                  <div key={m.label} className="bg-gray-900/50 rounded-lg p-2">
                    <div className="text-gray-600">{m.label}</div>
                    <div className={`font-bold ${m.cls}`}>{m.val}</div>
                  </div>
                ))}
              </div>

              <div className="text-xs text-gray-400 bg-gray-900/40 rounded-lg px-3 py-2">{d.reason}</div>

              <button onClick={() => {
                if (!d.stop || !d.target) return;
                onAddToJournal({ ticker: d.ticker, name: d.name ?? d.ticker, strategy: (d.strategy as Strategy) ?? 'pullback', price: d.currentPrice, entry: d.entry, stop: d.stop, target2R: d.target, target3R: d.target + (d.target - d.entry) * 0.5, rrRatio: 2, confidence: 70, reasons: [d.reason], atr: 0, rsi: 50, ema20: d.entry, ema50: d.entry });
              }} className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-900/60 border border-emerald-700 text-emerald-300 text-sm font-semibold rounded-lg hover:bg-emerald-800/60 transition-colors">
                <PlusCircle className="w-4 h-4" /> Add to Journal &amp; Trade
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && decisions.length === 0 && lastRun && (
        <div className="flex items-center gap-3 bg-gray-900/40 border border-gray-800 rounded-xl p-4">
          <Minus className="w-5 h-5 text-gray-600 shrink-0" />
          <div>
            <div className="text-sm text-gray-300 font-semibold">No actions required today</div>
            <div className="text-xs text-gray-600 mt-0.5">All open positions are within normal parameters. No qualifying new setups found. Patience is a strategy.</div>
          </div>
        </div>
      )}

      <p className="text-[10px] text-gray-700 text-center">Dollar amounts calculated using 1% account risk rule. Shares = (Account × 1%) ÷ Stop distance. For educational purposes only.</p>
    </div>
  );
}

// ─── Daily Opportunity Scanner ────────────────────────────────────────────────

const STRATEGY_META = {
  pullback:   { label: 'Trend + Pullback', color: 'text-emerald-400', bg: 'bg-emerald-950/30', border: 'border-emerald-900' },
  breakout:   { label: 'Breakout + Retest', color: 'text-indigo-400', bg: 'bg-indigo-950/30', border: 'border-indigo-900' },
  divergence: { label: 'RSI Divergence',   color: 'text-purple-400',  bg: 'bg-purple-950/30',  border: 'border-purple-900'  },
};

interface ScannerProps {
  onAddToJournal: (result: ScanResult) => void;
}

export function DailyScanner({ onAddToJournal }: ScannerProps) {
  const [watchlist, setWatchlist] = useState<string[]>(DEFAULT_WATCHLIST);
  const [customInput, setCustomInput] = useState('');
  const [results, setResults]   = useState<ScanResult[]>([]);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<string>('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const runScan = useCallback(async () => {
    setScanning(true);
    setResults([]);
    setProgress({ done: 0, total: watchlist.length });

    // Batch-fetch quotes first for name map
    const quotes = await fetchQuotes(watchlist).catch(() => ({}));
    const nameMap: Record<string, string> = {};
    Object.entries(quotes).forEach(([t, q]) => { nameMap[t] = q.shortName ?? t; });

    const found: ScanResult[] = [];
    for (const ticker of watchlist) {
      const result = await analyzeStock(ticker, nameMap);
      if (result) found.push(result);
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    found.sort((a, b) => b.confidence - a.confidence);
    setResults(found);
    setLastScan(new Date().toLocaleTimeString());
    setScanning(false);
  }, [watchlist]);

  function addTicker() {
    const tickers = customInput.toUpperCase().split(/[\s,]+/).filter(t => t.length > 0 && !watchlist.includes(t));
    if (tickers.length) { setWatchlist(w => [...new Set([...w, ...tickers])]); }
    setCustomInput('');
  }

  function removeTicker(t: string) { setWatchlist(w => w.filter(x => x !== t)); }

  const alertBadge = (c: number) =>
    c >= 75 ? 'bg-emerald-900 text-emerald-200 border-emerald-700'
    : c >= 55 ? 'bg-yellow-900/70 text-yellow-300 border-yellow-800'
    : 'bg-gray-800 text-gray-400 border-gray-700';

  return (
    <div className="space-y-4">
      {/* Watchlist */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {watchlist.map(t => (
            <span key={t} className="flex items-center gap-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-1 rounded-full">
              {t}
              <button onClick={() => removeTicker(t)} className="text-gray-600 hover:text-red-400 ml-0.5">×</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={customInput} onChange={e => setCustomInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addTicker()}
            placeholder="Add tickers (AAPL, MSFT…)" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:border-brand-500 focus:outline-none" />
          <button onClick={addTicker} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg transition-colors">Add</button>
          <button onClick={() => setWatchlist(DEFAULT_WATCHLIST)} className="px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-500 text-sm rounded-lg hover:bg-gray-700 transition-colors">Reset</button>
        </div>
      </div>

      {/* Scan button */}
      <div className="flex items-center gap-3">
        <button onClick={runScan} disabled={scanning}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-800 hover:bg-emerald-700 disabled:opacity-50 text-emerald-100 font-semibold text-sm rounded-xl transition-colors">
          {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {scanning ? `Scanning… ${progress.done}/${progress.total}` : "Run Today's Scan"}
        </button>
        {lastScan && <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" /> Last scan: {lastScan}</span>}
      </div>

      {scanning && (
        <div className="w-full bg-gray-800 rounded-full h-2">
          <div className="bg-emerald-500 h-2 rounded-full transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-gray-200">
              {results.length} Setup{results.length !== 1 ? 's' : ''} Found
            </h4>
            <span className="text-xs text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          </div>

          {results.map(r => {
            const meta = STRATEGY_META[r.strategy];
            const isOpen = expanded === r.ticker;
            return (
              <div key={r.ticker} className={`rounded-xl border ${meta.border} ${meta.bg} overflow-hidden`}>
                <button onClick={() => setExpanded(isOpen ? null : r.ticker)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
                  {/* Ticker */}
                  <div className="w-16 shrink-0">
                    <div className="font-bold text-white text-sm">{r.ticker}</div>
                    <div className="text-[10px] text-gray-500 truncate">{r.name}</div>
                  </div>

                  {/* Strategy badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${meta.border} ${meta.color} bg-gray-900/60`}>
                    {meta.label}
                  </span>

                  {/* Price/entry */}
                  <div className="flex-1 grid grid-cols-3 gap-2 text-xs text-center">
                    <div>
                      <div className="text-gray-500">Price</div>
                      <div className="font-semibold text-gray-200">${r.price.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">Stop</div>
                      <div className="font-semibold text-red-400">${r.stop.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500">2R Target</div>
                      <div className="font-semibold text-emerald-400">${r.target2R.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* Confidence */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border shrink-0 ${alertBadge(r.confidence)}`}>
                    {r.confidence}%
                  </span>

                  {isOpen ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Trade plan */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                      {[
                        { label: 'Entry', val: `$${r.entry.toFixed(2)}`, cls: 'text-white' },
                        { label: 'Stop Loss', val: `$${r.stop.toFixed(2)}`, cls: 'text-red-400' },
                        { label: '2R Target', val: `$${r.target2R.toFixed(2)}`, cls: 'text-brand-400' },
                        { label: '3R Target', val: `$${r.target3R.toFixed(2)}`, cls: 'text-teal-400' },
                        { label: 'R:R Ratio', val: `1:${r.rrRatio.toFixed(1)}`, cls: r.rrRatio >= 2 ? 'text-emerald-400' : 'text-yellow-400' },
                      ].map(m => (
                        <div key={m.label} className="bg-gray-900/60 rounded-lg p-2 text-center">
                          <div className="text-gray-600 mb-0.5">{m.label}</div>
                          <div className={`font-bold ${m.cls}`}>{m.val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Technical context */}
                    <div className="grid grid-cols-3 gap-2 text-xs text-center">
                      <div className="bg-gray-900/40 rounded-lg p-2">
                        <div className="text-gray-500">RSI</div>
                        <div className={`font-bold ${r.rsi > 65 ? 'text-red-400' : r.rsi < 35 ? 'text-emerald-400' : 'text-gray-300'}`}>{r.rsi.toFixed(0)}</div>
                      </div>
                      <div className="bg-gray-900/40 rounded-lg p-2">
                        <div className="text-gray-500">20-EMA</div>
                        <div className="font-bold text-gray-300">${r.ema20.toFixed(2)}</div>
                      </div>
                      <div className="bg-gray-900/40 rounded-lg p-2">
                        <div className="text-gray-500">ATR-14</div>
                        <div className="font-bold text-gray-300">${r.atr.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Reasons */}
                    <div className="space-y-1">
                      {r.reasons.map((reason, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-400">
                          <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${meta.color}`} />
                          {reason}
                        </div>
                      ))}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => onAddToJournal(r)}
                        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${meta.border} ${meta.color} bg-gray-900/60 hover:bg-gray-800/60`}>
                        <PlusCircle className="w-3.5 h-3.5" /> Add to Journal
                      </button>
                      <a href={`https://finance.yahoo.com/chart/${r.ticker}`} target="_blank" rel="noreferrer"
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 bg-gray-900/40 hover:bg-gray-800/40 transition-colors">
                        View Chart ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!scanning && results.length === 0 && lastScan && (
        <p className="text-xs text-gray-600 italic text-center py-4">
          No qualifying setups found in current watchlist. Market conditions may not favor any of the three strategies right now — patience is a strategy.
        </p>
      )}
    </div>
  );
}

// ─── Open Position Monitor ────────────────────────────────────────────────────

const ALERT_CONFIG: Record<AlertLevel, { label: string; icon: React.ComponentType<{className?: string}>; cls: string; bg: string }> = {
  stop_hit:     { label: '🛑 STOP HIT — EXIT NOW',    icon: XCircle,       cls: 'text-red-300',     bg: 'bg-red-950/60 border-red-700'          },
  near_stop:    { label: '⚠️ Near Stop — Watch Closely', icon: AlertTriangle, cls: 'text-orange-300', bg: 'bg-orange-950/50 border-orange-800'      },
  take_partial: { label: '🎯 2R Target — Scale Out',   icon: Target,        cls: 'text-emerald-300', bg: 'bg-emerald-950/40 border-emerald-800'    },
  trail_stop:   { label: '📈 Up 1R — Move Stop to B/E', icon: TrendingUp,   cls: 'text-brand-300',   bg: 'bg-indigo-950/40 border-indigo-800'      },
  on_track:     { label: '✅ On Track',                icon: CheckCircle2,  cls: 'text-gray-400',    bg: 'bg-gray-900/40 border-gray-800'          },
};

interface MonitorProps {
  openEntries: JournalEntryMin[];
  onClose: (id: string, exitPrice: number) => void;
}

export function PositionMonitor({ openEntries, onClose }: MonitorProps) {
  const [statuses, setStatuses] = useState<PositionStatus[]>([]);
  const [loading, setLoading]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState('');
  const [exitInputs, setExitInputs] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    if (openEntries.length === 0) return;
    setLoading(true);
    try {
      const tickers = [...new Set(openEntries.map(e => e.ticker))];
      const quotes  = await fetchQuotes(tickers);
      const updated = openEntries.map(entry => {
        const q = quotes[entry.ticker];
        const price = q?.price ?? entry.entry;
        return buildPositionStatus(entry, price);
      }).sort((a, b) => {
        const order: AlertLevel[] = ['stop_hit', 'near_stop', 'take_partial', 'trail_stop', 'on_track'];
        return order.indexOf(a.alert) - order.indexOf(b.alert);
      });
      setStatuses(updated);
      setLastRefresh(new Date().toLocaleTimeString());
    } finally {
      setLoading(false);
    }
  }, [openEntries]);

  // Auto-refresh on mount and every 5 minutes
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [refresh]);

  if (openEntries.length === 0) {
    return (
      <div className="text-center py-8 text-gray-600 text-sm">
        No open trades to monitor. Add trades to your journal to track them here.
      </div>
    );
  }

  const criticalCount = statuses.filter(s => s.alert === 'stop_hit' || s.alert === 'near_stop').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className={`w-4 h-4 ${criticalCount > 0 ? 'text-red-400 animate-pulse' : 'text-gray-500'}`} />
          <span className="text-sm text-gray-300 font-semibold">
            {openEntries.length} Open Position{openEntries.length !== 1 ? 's' : ''}
            {criticalCount > 0 && <span className="ml-2 text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full">{criticalCount} ALERT</span>}
          </span>
        </div>
        <button onClick={refresh} disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Refreshing…' : lastRefresh ? `Updated ${lastRefresh}` : 'Refresh prices'}
        </button>
      </div>

      {loading && statuses.length === 0 && (
        <div className="text-xs text-gray-600 text-center py-4 animate-pulse">Fetching live prices…</div>
      )}

      {statuses.map(s => {
        const cfg = ALERT_CONFIG[s.alert];
        const Icon = cfg.icon;
        const rCls = s.currentR >= 1 ? 'text-emerald-400' : s.currentR <= -0.5 ? 'text-red-400' : 'text-gray-400';
        const pctCls = s.unrealizedPct >= 1 ? 'text-emerald-400' : s.unrealizedPct <= -1 ? 'text-red-400' : 'text-gray-400';

        return (
          <div key={s.entry.id} className={`rounded-xl border p-4 space-y-3 ${cfg.bg}`}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${cfg.cls} shrink-0`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{s.entry.ticker}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${s.entry.direction === 'long' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
                      {s.entry.direction === 'long' ? '↑ LONG' : '↓ SHORT'}
                    </span>
                  </div>
                  <span className={`text-xs font-semibold ${cfg.cls}`}>{cfg.label}</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-black text-white">${s.currentPrice.toFixed(2)}</div>
                <div className={`text-xs font-semibold ${pctCls}`}>
                  {s.unrealizedPct >= 0 ? '+' : ''}{s.unrealizedPct.toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-4 gap-2 text-xs text-center">
              <div className="bg-gray-900/40 rounded-lg p-2">
                <div className="text-gray-500">Entry</div>
                <div className="font-semibold text-gray-300">${s.entry.entry.toFixed(2)}</div>
              </div>
              <div className="bg-gray-900/40 rounded-lg p-2">
                <div className="text-gray-500">Stop</div>
                <div className="font-semibold text-red-400">${s.entry.stop.toFixed(2)}</div>
              </div>
              <div className="bg-gray-900/40 rounded-lg p-2">
                <div className="text-gray-500">Target</div>
                <div className="font-semibold text-emerald-400">${s.entry.target.toFixed(2)}</div>
              </div>
              <div className="bg-gray-900/40 rounded-lg p-2">
                <div className="text-gray-500">Current R</div>
                <div className={`font-bold ${rCls}`}>{s.currentR >= 0 ? '+' : ''}{s.currentR.toFixed(2)}R</div>
              </div>
            </div>

            {/* Progress bars */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-20 shrink-0">% to stop</span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${s.pctToStop <= 2 ? 'bg-red-500' : s.pctToStop <= 5 ? 'bg-yellow-500' : 'bg-gray-600'}`}
                    style={{ width: `${Math.max(0, Math.min(100 - (s.pctToStop / 10) * 100, 100))}%` }} />
                </div>
                <span className={`font-semibold ${s.pctToStop <= 2 ? 'text-red-400' : 'text-gray-400'}`}>{s.pctToStop.toFixed(1)}%</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-600 w-20 shrink-0">% to target</span>
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div className="bg-emerald-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.max(0, 100 - (s.pctToTarget / 15) * 100)}%` }} />
                </div>
                <span className="text-gray-400 font-semibold">{s.pctToTarget.toFixed(1)}%</span>
              </div>
            </div>

            {/* Sell reasons / action guidance */}
            {s.sellReasons.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-white/10">
                {s.sellReasons.map((r, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs ${i === 0 ? cfg.cls : 'text-gray-500'}`}>
                    {i === 0
                      ? <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      : <span className="w-3 h-3 mt-0.5 shrink-0 text-center text-gray-700">▸</span>}
                    {r}
                  </div>
                ))}
              </div>
            )}

            {/* Trailing stop suggestion */}
            {s.trailingStop !== undefined && (
              <div className="bg-indigo-950/40 border border-indigo-800 rounded-lg px-3 py-2 text-xs text-indigo-300 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                Move stop to <span className="font-bold text-white">${s.trailingStop.toFixed(2)}</span> (breakeven) — risk-free trade from here
              </div>
            )}

            {/* Close trade input */}
            {s.alert === 'stop_hit' && (
              <div className="flex items-center gap-2">
                <input type="number" value={exitInputs[s.entry.id] || ''} onChange={e => setExitInputs(p => ({ ...p, [s.entry.id]: e.target.value }))}
                  className="flex-1 bg-gray-900 border border-red-800 rounded-lg px-3 py-1.5 text-sm text-white focus:border-red-600 focus:outline-none"
                  placeholder="Exit price" />
                <button onClick={() => { const p = parseFloat(exitInputs[s.entry.id] || ''); if (p > 0) onClose(s.entry.id, p); }}
                  className="px-4 py-1.5 bg-red-800 hover:bg-red-700 text-red-100 text-sm font-semibold rounded-lg transition-colors">
                  Close Trade
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Disclaimer */}
      <p className="text-[10px] text-gray-700 text-center pt-2">
        Prices are delayed/cached. Always verify with your broker before acting. This is not financial advice.
      </p>
    </div>
  );
}
