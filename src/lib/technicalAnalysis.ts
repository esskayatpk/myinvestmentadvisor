/**
 * Technical Analysis calculations from raw price history.
 * All calculations are performed client-side — no API key required.
 *
 * Key exports used by BuySellSignals, MarketScanner, and SwingScanner:
 *   calcRSI        — momentum oscillator 0–100
 *   calcMACD       — trend/momentum convergence indicator
 *   calcATR        — volatility used for stop-loss sizing
 *   calcBollingerBands — mean-reversion and squeeze detection
 *   lastEMA/lastSMA — single-value moving averages for current price context
 *   computeSignal  — full 5-pillar scoring engine (Trend/Location/Volume/RR/Structure)
 */

import type { PriceBar, TechnicalIndicators, MACD, BollingerBands } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Recursive EMA: seeds from a simple average for the first period, then applies
// the smoothing factor k = 2/(period+1) to weight recent prices more heavily.
function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let emaPrev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(emaPrev);
  for (let i = period; i < values.length; i++) {
    const curr = values[i] * k + emaPrev * (1 - k);
    result.push(curr);
    emaPrev = curr;
  }
  return result;
}

function sma(values: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

// ─── RSI ─────────────────────────────────────────────────────────────────────
// Wilder's smoothed RSI: uses an exponential running average of gains/losses
// rather than a simple average, giving more weight to recent momentum.
// Returns 50 (neutral) when there is insufficient history.
export function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50; // not enough data → neutral

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((d) => (d > 0 ? d : 0));
  const losses = changes.map((d) => (d < 0 ? -d : 0));

  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

// ─── MACD ─────────────────────────────────────────────────────────────────────
// Subtracts the slower 26-period EMA from the faster 12-period EMA.
// The 9-period signal line smooths the result; the histogram shows divergence.
// A positive histogram means bullish momentum is accelerating.
export function calcMACD(closes: number[]): MACD {
  if (closes.length < 35) {
    return { macdLine: 0, signalLine: 0, histogram: 0 };
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);

  // Align arrays (ema26 is shorter)
  const offset = ema12.length - ema26.length;
  const macdLine = ema26.map((v, i) => ema12[i + offset] - v);
  const signalLine = ema(macdLine, 9);
  const sigOffset = macdLine.length - signalLine.length;
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const lastHistogram = lastMACD - lastSignal;

  return {
    macdLine: parseFloat(lastMACD.toFixed(4)),
    signalLine: parseFloat(lastSignal.toFixed(4)),
    histogram: parseFloat(lastHistogram.toFixed(4)),
  };

  void sigOffset; // suppress unused warning — used for alignment awareness
}

// ─── Bollinger Bands ─────────────────────────────────────────────────────────

export function calcBollingerBands(closes: number[], period = 20, multiplier = 2): BollingerBands {
  if (closes.length < period) {
    const last = closes[closes.length - 1] ?? 0;
    return { upper: last, middle: last, lower: last, bandwidth: 0 };
  }
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  const stdDev = Math.sqrt(variance);
  const upper = mean + multiplier * stdDev;
  const lower = mean - multiplier * stdDev;
  const bandwidth = ((upper - lower) / mean) * 100;
  return {
    upper: parseFloat(upper.toFixed(4)),
    middle: parseFloat(mean.toFixed(4)),
    lower: parseFloat(lower.toFixed(4)),
    bandwidth: parseFloat(bandwidth.toFixed(2)),
  };
}

// ─── ATR (Average True Range) ─────────────────────────────────────────────────
// True Range accounts for overnight gaps by comparing today's range against the
// previous close, not just high-minus-low. Used to size stop-losses adaptively.
export function calcATR(bars: PriceBar[], period = 14): number {
  if (bars.length < period + 1) return 0;
  const trueRanges = bars.slice(1).map((bar, i) => {
    const prev = bars[i].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - prev), Math.abs(bar.low - prev));
  });
  const recent = trueRanges.slice(-period);
  return parseFloat((recent.reduce((a, b) => a + b, 0) / period).toFixed(4));
}

// ─── SMA at specific period ───────────────────────────────────────────────────
// lastSMA/lastEMA return only the final (most recent) value — avoids allocating
// a full array when only the current-bar level is needed.
export function lastSMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const slice = closes.slice(-period);
  return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(4));
}

export function lastEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const result = ema(closes, period);
  return parseFloat((result[result.length - 1] ?? 0).toFixed(4));
}

// ─── 5-Pillar Trade Analysis (woofstreets framework) ─────────────────────────
//
// Before placing any trade, evaluate:
//   1. TREND      — Higher Highs + Higher Lows, price above 21 EMA
//   2. LOCATION   — Near 21 EMA / support, not chasing resistance
//   3. VOLUME     — High vol on breakout, low vol on pullback
//   4. RISK:REWARD — ATR-based stop; minimum 1:2, preferred 1:3+
//   5. STRUCTURE  — Tight / consolidating → expansion (not random/volatile)
//
// Formula: TREND + SETUP + RISK MANAGEMENT = CONSISTENT PROFITS
// ─────────────────────────────────────────────────────────────────────────────

// ── Pillar 1: Trend ──────────────────────────────────────────────────────────

function assessTrend(
  bars: PriceBar[],
  ema21: number,
  sma50: number,
  sma200: number,
): { direction: 'uptrend' | 'downtrend' | 'sideways'; score: number; reasons: string[]; hasHHHL: boolean } {
  const reasons: string[] = [];
  let score = 0;

  const price = bars[bars.length - 1]?.close ?? 0;
  const lookback = Math.min(20, bars.length);
  const recent = bars.slice(-lookback);
  const half = Math.floor(recent.length / 2);

  // Higher Highs / Higher Lows detection: compares average highs and lows of
  // the first and second half of a 20-bar window — more robust than exact peaks.
  const avgH1 = recent.slice(0, half).reduce((s, b) => s + b.high, 0) / half;
  const avgH2 = recent.slice(half).reduce((s, b) => s + b.high, 0) / (recent.length - half);
  const avgL1 = recent.slice(0, half).reduce((s, b) => s + b.low, 0) / half;
  const avgL2 = recent.slice(half).reduce((s, b) => s + b.low, 0) / (recent.length - half);

  const hasHHHL = avgH2 > avgH1 * 1.002 && avgL2 > avgL1 * 1.002;
  const hasLHLL = avgH2 < avgH1 * 0.998 && avgL2 < avgL1 * 0.998;

  if (hasHHHL) {
    score += 12;
    reasons.push('Higher Highs + Higher Lows — confirmed uptrend structure (Pillar 1)');
  } else if (hasLHLL) {
    score -= 12;
    reasons.push('Lower Highs + Lower Lows — confirmed downtrend structure (Pillar 1)');
  } else {
    reasons.push('No clear HH/HL or LH/LL pattern — sideways / choppy price action');
  }

  // Price vs 21 EMA — primary trend filter
  if (ema21 > 0) {
    if (price > ema21) {
      score += 10;
      reasons.push(`Price above 21 EMA ($${ema21.toFixed(2)}) — trend intact, long bias valid`);
    } else {
      score -= 10;
      reasons.push(`Price below 21 EMA ($${ema21.toFixed(2)}) — trend broken, avoid new longs`);
    }
  }

  // Long-term trend filters
  if (price > sma200) {
    score += 6;
    reasons.push('Price above 200-day SMA — long-term uptrend intact');
  } else {
    score -= 6;
    reasons.push('Price below 200-day SMA — long-term downtrend');
  }

  if (sma50 > sma200 && price > sma50) {
    score += 4;
    reasons.push('Price > SMA50 > SMA200 — full bull alignment');
  } else if (sma50 < sma200 && price < sma50) {
    score -= 4;
    reasons.push('Price < SMA50 < SMA200 — full bear alignment');
  }

  const direction =
    score >= 10 ? 'uptrend'
    : score <= -10 ? 'downtrend'
    : 'sideways';

  return { direction, score, reasons, hasHHHL };
}

// ── Pillar 2: Location (where are you buying?) ───────────────────────────────
//   Valid buy locations: near 21 EMA, near support, OR near breakout retest

function assessLocation(
  bars: PriceBar[],
  price: number,
  ema21: number,
  bbLower: number,
  bbUpper: number,
): { nearEma21: boolean; nearSupport: boolean; nearBreakoutRetest: boolean; atResistance: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const distPct = ema21 > 0 ? Math.abs(price - ema21) / ema21 * 100 : 999;
  const aboveEma21 = price > ema21;
  const nearEma21 = distPct <= 3;
  const nearSupport = price <= bbLower * 1.02;
  const atResistance = price >= bbUpper * 0.98;

  // Breakout retest: price closed above a prior swing high (breakout), now pulling back to test as support
  let nearBreakoutRetest = false;
  if (bars.length >= 10) {
    const priorWindow = bars.slice(Math.max(0, bars.length - 35), bars.length - 4);
    const recentBars  = bars.slice(-5);
    if (priorWindow.length >= 5) {
      const priorHigh   = Math.max(...priorWindow.map(b => b.high));
      const hadBreakout = recentBars.some(b => b.close > priorHigh * 1.005);
      nearBreakoutRetest = hadBreakout && price >= priorHigh * 0.97 && price <= priorHigh * 1.05 && aboveEma21;
      if (nearBreakoutRetest) {
        score += 15;
        reasons.push(`Price retesting breakout level $${priorHigh.toFixed(2)} as support — ideal re-entry after breakout (Pillar 2)`);
      }
    }
  }

  if (nearEma21 && aboveEma21) {
    score += 18;
    reasons.push(`Price ${distPct.toFixed(1)}% above 21 EMA — ideal buy location near dynamic support (Pillar 2)`);
  } else if (nearEma21 && !aboveEma21) {
    score += 5;
    reasons.push(`Price testing 21 EMA from below (+${distPct.toFixed(1)}%) — watch for reclaim before entering`);
  } else if (aboveEma21 && distPct > 8 && !nearBreakoutRetest) {
    score -= 10;
    reasons.push(`Price extended ${distPct.toFixed(1)}% above 21 EMA — poor location, wait for pullback to EMA`);
  }

  if (nearSupport) {
    score += 10;
    reasons.push('Price near lower Bollinger Band — institutional support zone, risk is well-defined');
  }

  // Don't penalise resistance if we're in a valid breakout retest (prior high → new support)
  if (atResistance && !nearBreakoutRetest) {
    score -= 12;
    reasons.push('Price at upper Bollinger Band — resistance zone, unfavourable R:R for new entries');
  }

  if (score === 0 && reasons.length === 0) {
    reasons.push(`Price ${distPct.toFixed(1)}% from 21 EMA — neutral location, closer to EMA = lower risk`);
  }

  return { nearEma21, nearSupport, nearBreakoutRetest, atResistance, score, reasons };
}

// ── Pillar 3: Volume ─────────────────────────────────────────────────────────

function assessVolume(bars: PriceBar[]): {
  isBreakoutVolume: boolean;
  isLowVolumePullback: boolean;
  score: number;
  reasons: string[];
} {
  if (bars.length < 6) {
    return { isBreakoutVolume: false, isLowVolumePullback: false, score: 0, reasons: ['Insufficient data for volume analysis'] };
  }

  const lookback = Math.min(20, bars.length - 1);
  const baseline = bars.slice(-(lookback + 1), -1);
  // Trim top 2 outlier days (earnings/splits) so they don't inflate the baseline
  const sortedVols = [...baseline.map(b => b.volume)].sort((a, b) => a - b);
  const trimmed    = sortedVols.length > 4 ? sortedVols.slice(0, -2) : sortedVols;
  const avgVol     = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;

  const last5 = bars.slice(-5);
  const upDays  = last5.filter((b) => b.close > b.open);
  const downDays = last5.filter((b) => b.close <= b.open);

  const avgUpVol   = upDays.length   ? upDays.reduce((s, b) => s + b.volume, 0)   / upDays.length   : 0;
  const avgDownVol = downDays.length ? downDays.reduce((s, b) => s + b.volume, 0) / downDays.length : 0;

  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2];
  const isBreakout = lastBar.close > prevBar.high;
  const isBreakoutVolume = isBreakout && lastBar.volume > avgVol * 1.5;

  // Low-volume pullback = down-days have below-average volume → selling pressure weak
  const isLowVolumePullback =
    downDays.length > 0 && upDays.length > 0 &&
    avgDownVol < avgVol * 0.8 && avgUpVol >= avgVol * 0.8;

  let score = 0;
  const reasons: string[] = [];

  if (isBreakoutVolume) {
    score += 18;
    reasons.push('Breakout on 1.5× average volume — institutional buying confirmed (Pillar 3)');
  }

  if (isLowVolumePullback) {
    score += 12;
    reasons.push('Low-volume pullback — weak selling pressure, healthy retracement (Pillar 3)');
  }

  // Distribution: heavy volume on down-days
  if (downDays.length > 0 && avgDownVol > avgVol * 1.3) {
    score -= 15;
    reasons.push('Above-average volume on down-days — distribution / institutional selling (Pillar 3)');
  }

  // Up-day dominance with above-average volume
  if (!isBreakoutVolume && upDays.length >= 3 && avgUpVol > avgVol * 1.1) {
    score += 8;
    reasons.push('Consistent above-average volume on up-days — accumulation pattern');
  }

  if (reasons.length === 0) {
    reasons.push('Volume near average — no strong institutional signal; wait for confirmation');
  }

  return { isBreakoutVolume, isLowVolumePullback, score, reasons };
}

// ── Pillar 4: Risk:Reward (calculated from ATR) ──────────────────────────────

function assessRiskReward(
  price: number,
  atr: number,
): { stopLoss: number; targetPrice: number; ratio: number; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  // Stop-loss: 1.5× ATR below current price (standard practice)
  const stopLoss = parseFloat((price - atr * 1.5).toFixed(2));
  const riskAmt = price - stopLoss;

  // Preferred target: 3× ATR above current price (1:2 R:R minimum)
  const targetPrice = parseFloat((price + atr * 3).toFixed(2));
  const ratio = riskAmt > 0 ? parseFloat((atr * 3 / riskAmt).toFixed(2)) : 0;

  if (ratio >= 3) {
    score += 15;
    reasons.push(`R:R ${ratio.toFixed(1)}:1 — preferred setup (1:3+); risk $${riskAmt.toFixed(2)}, target $${targetPrice} (Pillar 4)`);
  } else if (ratio >= 2) {
    score += 8;
    reasons.push(`R:R ${ratio.toFixed(1)}:1 — acceptable setup (min 1:2); stop at $${stopLoss}, target $${targetPrice} (Pillar 4)`);
  } else if (ratio > 0) {
    score -= 12;
    reasons.push(`R:R ${ratio.toFixed(1)}:1 — below 1:2 minimum; risk/reward unfavourable, skip this trade (Pillar 4)`);
  } else {
    reasons.push('Cannot calculate R:R — insufficient ATR data');
  }

  return { stopLoss, targetPrice, ratio, score, reasons };
}

// ── Pillar 5: Market Structure ────────────────────────────────────────────────

function assessStructure(
  bars: PriceBar[],
  bbBandwidth: number,
): { isConsolidating: boolean; isExpanding: boolean; isTightPriceAction: boolean; score: number; reasons: string[] } {
  if (bars.length < 10) {
    return { isConsolidating: false, isExpanding: false, isTightPriceAction: false, score: 0, reasons: [] };
  }

  const recent = bars.slice(-10);
  const prev   = bars.slice(-20, -10);

  // Average daily range as % of close
  const recentRange = recent.reduce((s, b) => s + (b.high - b.low) / b.close * 100, 0) / recent.length;
  const prevRange   = prev.length
    ? prev.reduce((s, b) => s + (b.high - b.low) / b.close * 100, 0) / prev.length
    : recentRange;

  const isTightPriceAction = recentRange < 1.5;      // daily moves < 1.5% = controlled
  const isConsolidating    = bbBandwidth < 10;        // BB squeeze = low volatility
  const isExpanding        = recentRange > prevRange * 1.3 && bbBandwidth > 12;

  let score = 0;
  const reasons: string[] = [];

  if (isTightPriceAction) {
    score += 8;
    reasons.push('Tight price action (daily range < 1.5%) — controlled movement, potential energy building (Pillar 5)');
  }

  if (isConsolidating) {
    score += 6;
    reasons.push('Bollinger Band squeeze — low-volatility consolidation, breakout may be near');
  }

  if (isExpanding) {
    score += 6;
    reasons.push('Price expanding after consolidation — momentum igniting, strong structure (Pillar 5)');
  }

  if (bbBandwidth > 30) {
    score -= 12;
    reasons.push('BB bandwidth > 30% — high volatility, random price action, weak structure (Pillar 5)');
  }

  if (recentRange > 3) {
    score -= 8;
    reasons.push('Wide daily candles (>3% range) — unpredictable; hard to define clean risk');
  }

  if (reasons.length === 0) {
    reasons.push('Normal price structure — no extremes detected');
  }

  return { isConsolidating, isExpanding, isTightPriceAction, score, reasons };
}

// ── Momentum confirmation (RSI + MACD) ───────────────────────────────────────

function assessMomentum(
  rsi: number,
  macd: { histogram: number; macdLine: number; signalLine: number },
  prevHistogram = macd.histogram,
): {
  score: number;
  reasons: string[];
} {
  let score = 0;
  const reasons: string[] = [];

  if (rsi < 30) {
    score += 18;
    reasons.push(`RSI oversold (${rsi.toFixed(1)}) — potential mean-reversion bounce`);
  } else if (rsi < 45) {
    score += 7;
    reasons.push(`RSI below midline (${rsi.toFixed(1)}) — momentum cooling, mild bullish setup`);
  } else if (rsi > 70) {
    score -= 18;
    reasons.push(`RSI overbought (${rsi.toFixed(1)}) — caution, consider taking profits`);
  } else if (rsi > 60) {
    score -= 7;
    reasons.push(`RSI elevated (${rsi.toFixed(1)}) — momentum slowing`);
  }

  if (macd.histogram > 0 && macd.macdLine > macd.signalLine) {
    const expanding = macd.histogram > prevHistogram;
    score += expanding ? 12 : 6;
    reasons.push(expanding
      ? 'MACD bullish + histogram expanding — accelerating upward momentum (Momentum)'
      : 'MACD bullish but histogram contracting — uptrend may be losing steam, watch carefully (Momentum)');
  } else if (macd.histogram < 0 && macd.macdLine < macd.signalLine) {
    const expanding = macd.histogram < prevHistogram;
    score += expanding ? -12 : -5;
    reasons.push(expanding
      ? 'MACD bearish + histogram expanding — selling pressure accelerating (Momentum)'
      : 'MACD bearish but histogram contracting — selling pressure may be easing (Momentum)');
  }

  return { score, reasons };
}

// ─── Main scoring function ────────────────────────────────────────────────────

export interface SignalScore {
  score: number;              // -100 (strong sell) to +100 (strong buy)
  reasons: string[];
  trendDirection: 'uptrend' | 'downtrend' | 'sideways';
  stopLoss: number;
  targetPrice: number;
  riskRewardRatio: number;
  preTradeChecklist: {
    trendStrong: boolean;
    priceAboveEma21: boolean;
    volumeHealthy: boolean;
    supportNearby: boolean;
    riskRewardGood: boolean;
    structureIntact: boolean;
    stopLossDefined: boolean;
    checksPassed: number;
  };
}

export function scoreIndicators(indicators: TechnicalIndicators): SignalScore {
  const bars  = indicators.priceHistory;
  const price = bars[bars.length - 1]?.close ?? 0;

  // ── Run all 5 pillars ──
  const closes = bars.map(b => b.close);
  const macdPrevHistogram = closes.length >= 37
    ? calcMACD(closes.slice(0, -1)).histogram
    : indicators.macd.histogram;

  const trend    = assessTrend(bars, indicators.ema21, indicators.sma50, indicators.sma200);
  const location = assessLocation(bars, price, indicators.ema21, indicators.bollingerBands.lower, indicators.bollingerBands.upper);
  const volume   = assessVolume(bars);
  const rr       = assessRiskReward(price, indicators.atr14);
  const structure = assessStructure(bars, indicators.bollingerBands.bandwidth);
  const momentum = assessMomentum(indicators.rsi14, indicators.macd, macdPrevHistogram);

  const score = Math.max(-100, Math.min(100,
    trend.score + location.score + volume.score + rr.score + structure.score + momentum.score,
  ));

  // Flatten reasons, grouped by pillar
  const reasons: string[] = [
    ...trend.reasons,
    ...location.reasons,
    ...volume.reasons,
    ...structure.reasons,
    ...momentum.reasons,
    ...rr.reasons,
  ];

  // ── Pre-trade checklist (7 items — No Checklist, No Trade) ──
  const trendStrong     = trend.direction === 'uptrend';
  const priceAboveEma21 = indicators.ema21 > 0 && price > indicators.ema21;
  const volumeHealthy   = volume.isBreakoutVolume || volume.isLowVolumePullback || volume.score > 0;
  const supportNearby   = location.nearEma21 || location.nearSupport || location.nearBreakoutRetest;
  const riskRewardGood  = rr.ratio >= 2;   // minimum 1:2 R:R (preferred 1:3+)
  const structureIntact = structure.isTightPriceAction || structure.isConsolidating || structure.isExpanding;
  const stopLossDefined = indicators.atr14 > 0;

  const checksPassed = [trendStrong, priceAboveEma21, volumeHealthy, supportNearby, riskRewardGood, structureIntact, stopLossDefined]
    .filter(Boolean).length;

  return {
    score,
    reasons,
    trendDirection: trend.direction,
    stopLoss: rr.stopLoss,
    targetPrice: rr.targetPrice,
    riskRewardRatio: rr.ratio,
    preTradeChecklist: {
      trendStrong,
      priceAboveEma21,
      volumeHealthy,
      supportNearby,
      riskRewardGood,
      structureIntact,
      stopLossDefined,
      checksPassed,
    },
  };
}

// ─── Master compute function ─────────────────────────────────────────────────

export function computeIndicators(ticker: string, bars: PriceBar[]): TechnicalIndicators {
  const closes = bars.map((b) => b.close);

  return {
    ticker,
    rsi14: calcRSI(closes),
    macd: calcMACD(closes),
    sma20: lastSMA(closes, 20),
    sma50: lastSMA(closes, 50),
    sma200: lastSMA(closes, 200),
    ema12: lastEMA(closes, 12),
    ema21: lastEMA(closes, 21),
    ema26: lastEMA(closes, 26),
    bollingerBands: calcBollingerBands(closes),
    atr14: calcATR(bars),
    priceHistory: bars.slice(-90),
  };
}

// Re-export sma for any consumers that need the full array
export { sma };
