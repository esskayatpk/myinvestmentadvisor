/**
 * Trading session utilities — Day Trader Playbook integration
 * All times are US Eastern (NYSE market hours).
 */

export interface TradingSession {
  id: string;
  label: string;
  emoji: string;
  description: string;
  playbookAdvice: string;
  canTrade: boolean;
  sizeMultiplier: number;    // 0=no trade, 0.5=half, 1=full
  colorKey: 'green' | 'amber' | 'orange' | 'red' | 'blue' | 'gray';
  // minutes from midnight ET
  startMin: number;
  endMin: number;
}

export const TRADING_SESSIONS: TradingSession[] = [
  {
    id: 'pre_market',
    label: 'Pre-Market Prep',
    emoji: '🌅',
    description: '4:00 – 9:30 AM ET',
    playbookAdvice: 'Build watchlist · Mark key levels · Write trade plan. If it\'s not written, it doesn\'t exist.',
    canTrade: false,
    sizeMultiplier: 0,
    colorKey: 'blue',
    startMin: 240, endMin: 570,
  },
  {
    id: 'opening_bell',
    label: 'Opening Bell 🔔',
    emoji: '⚠️',
    description: '9:30 – 10:00 AM ET',
    playbookAdvice: 'Observe first 15–30 min. High volatility. Only near-perfect setups. No first-5-min impulse trades.',
    canTrade: true,
    sizeMultiplier: 0.5,
    colorKey: 'amber',
    startMin: 570, endMin: 600,
  },
  {
    id: 'prime_window',
    label: 'Prime Window ✅',
    emoji: '💰',
    description: '10:00 – 11:30 AM ET',
    playbookAdvice: 'Highest-probability window. Execute pre-planned setups only. Full position sizing allowed.',
    canTrade: true,
    sizeMultiplier: 1.0,
    colorKey: 'green',
    startMin: 600, endMin: 690,
  },
  {
    id: 'lunch_chop',
    label: 'Lunch Chop',
    emoji: '🥱',
    description: '11:30 AM – 1:30 PM ET',
    playbookAdvice: 'Volume thins, spreads widen. Reduce size by 50% or STOP trading. No boredom trades.',
    canTrade: false,
    sizeMultiplier: 0.5,
    colorKey: 'orange',
    startMin: 690, endMin: 810,
  },
  {
    id: 'afternoon',
    label: 'Afternoon Window',
    emoji: '📈',
    description: '1:30 – 3:30 PM ET',
    playbookAdvice: 'Volume returns. Confirmed setups only. If daily P&L target hit — screen goes dark.',
    canTrade: true,
    sizeMultiplier: 0.75,
    colorKey: 'blue',
    startMin: 810, endMin: 930,
  },
  {
    id: 'power_hour',
    label: 'Power Hour ⚡',
    emoji: '⚡',
    description: '3:30 – 4:00 PM ET',
    playbookAdvice: 'Institutional rebalancing. Strong momentum possible. Begin flattening positions before close.',
    canTrade: true,
    sizeMultiplier: 0.75,
    colorKey: 'amber',
    startMin: 930, endMin: 960,
  },
  {
    id: 'after_hours',
    label: 'After Hours',
    emoji: '📓',
    description: '4:00 – 8:00 PM ET',
    playbookAdvice: 'Market closed. Journal every trade now. Review stats. Identify one thing to improve tomorrow.',
    canTrade: false,
    sizeMultiplier: 0,
    colorKey: 'gray',
    startMin: 960, endMin: 1200,
  },
  {
    id: 'overnight',
    label: 'Market Closed',
    emoji: '🌙',
    description: 'Overnight / Weekend',
    playbookAdvice: 'Full disconnect. No market content. Protect your mental bandwidth — it is finite.',
    canTrade: false,
    sizeMultiplier: 0,
    colorKey: 'gray',
    startMin: 0, endMin: 240,
  },
];

/** Get current Eastern time as total minutes from midnight. */
function getETMinutes(): { totalMinutes: number; isWeekend: boolean; etTime: string } {
  const etString = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  const totalMinutes = etDate.getHours() * 60 + etDate.getMinutes();
  const isWeekend = etDate.getDay() === 0 || etDate.getDay() === 6;
  const etTime = etDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return { totalMinutes, isWeekend, etTime };
}

export interface SessionStatus {
  session: TradingSession;
  etTime: string;
  isWeekend: boolean;
  minutesRemaining: number;
}

export function getCurrentSession(): SessionStatus {
  const { totalMinutes, isWeekend, etTime } = getETMinutes();

  if (isWeekend) {
    const weekend = TRADING_SESSIONS.find(s => s.id === 'overnight')!;
    return { session: weekend, etTime, isWeekend: true, minutesRemaining: 0 };
  }

  for (const session of TRADING_SESSIONS) {
    if (totalMinutes >= session.startMin && totalMinutes < session.endMin) {
      return {
        session,
        etTime,
        isWeekend: false,
        minutesRemaining: session.endMin - totalMinutes,
      };
    }
  }

  // Default fallback (e.g. very early AM)
  const closed = TRADING_SESSIONS.find(s => s.id === 'overnight')!;
  return { session: closed, etTime, isWeekend: false, minutesRemaining: 0 };
}

/** Map a signal action + checklist score to a playbook setup quality tier. */
export type SetupQuality = 'A+' | 'A' | 'B' | null;

export function getSetupQuality(
  action: string,
  confidence: number,
  checksPassed: number,
): SetupQuality {
  if ((action === 'STRONG_BUY' || action === 'STRONG_SELL') && checksPassed === 7 && confidence >= 60) return 'A+';
  if ((action === 'BUY' || action === 'SELL') && checksPassed >= 6 && confidence >= 40) return 'A';
  if (action === 'WATCH' || (confidence >= 20 && checksPassed >= 4)) return 'B';
  return null;
}

/** Infer a playbook setup type from technical indicators. */
export interface SetupType {
  name: string;
  emoji: string;
  description: string;
}

export function detectSetupType(params: {
  rsi: number;
  macdHistogram: number;
  priceVsEma21: number;   // (price - ema21) / ema21
  priceVsSma20: number;   // (price - sma20) / sma20
  sma20VsSma50: number;   // (sma20 - sma50) / sma50
  atLowerBB: boolean;     // price near lower Bollinger Band
  changePercent: number;  // today's % change
  isUptrend: boolean;
}): SetupType {
  const { rsi, macdHistogram, priceVsEma21, priceVsSma20, sma20VsSma50, atLowerBB, changePercent, isUptrend } = params;

  const macdBullish = macdHistogram > 0;
  const bigMove = Math.abs(changePercent) >= 1.5;
  const nearEma = Math.abs(priceVsEma21) < 0.015;       // within 1.5% of EMA21
  const rsiPulledBack = rsi >= 45 && rsi <= 65;
  const rsiOversold = rsi < 40;
  const rsiOverbought = rsi > 68;
  const smaUptrend = sma20VsSma50 > 0.005;

  if (bigMove && isUptrend && rsi > 55 && macdBullish) {
    return { name: 'Opening Range Breakout', emoji: '🚀', description: 'Strong momentum breakout with volume surge' };
  }
  if (nearEma && macdBullish && isUptrend && !bigMove) {
    return { name: 'VWAP Reclaim', emoji: '🔄', description: 'Price reclaimed key intraday level with confirmation' };
  }
  if (smaUptrend && rsiPulledBack && macdBullish && priceVsSma20 > -0.02) {
    return { name: 'Bull Flag', emoji: '🏴', description: 'Tight consolidation after strong impulse leg' };
  }
  if (rsiOversold && macdBullish && atLowerBB) {
    return { name: 'Failed Breakdown', emoji: '↩️', description: 'Reversal after false break below support' };
  }
  if (isUptrend && rsi > 60 && priceVsSma20 > 0.02 && macdBullish && !bigMove) {
    return { name: 'HOD Breakout', emoji: '🆙', description: 'Break to new intraday high with market tailwind' };
  }
  if (rsiOverbought || rsiOversold) {
    return { name: 'Reversal Setup', emoji: '🔃', description: 'RSI exhaustion at key level — watch for reversal' };
  }

  return { name: 'Trend Continuation', emoji: '📈', description: 'Following established trend direction' };
}

export const SETUP_QUALITY_CONFIG = {
  'A+': { label: 'A+ Setup', cls: 'bg-emerald-900 text-emerald-200 border-emerald-600', desc: 'Full position size (100%)' },
  'A':  { label: 'A  Setup', cls: 'bg-green-900 text-green-300 border-green-700', desc: '75% position size' },
  'B':  { label: 'B  Setup', cls: 'bg-yellow-900/80 text-yellow-300 border-yellow-700', desc: '50% position size' },
} as const;

export const SESSION_COLOR_MAP = {
  green:  { bg: 'bg-emerald-950/60', border: 'border-emerald-700', text: 'text-emerald-300', dot: 'bg-emerald-400' },
  amber:  { bg: 'bg-amber-950/60',   border: 'border-amber-700',   text: 'text-amber-300',   dot: 'bg-amber-400' },
  orange: { bg: 'bg-orange-950/60',  border: 'border-orange-700',  text: 'text-orange-300',  dot: 'bg-orange-400' },
  red:    { bg: 'bg-red-950/60',     border: 'border-red-700',     text: 'text-red-300',     dot: 'bg-red-400' },
  blue:   { bg: 'bg-blue-950/60',    border: 'border-blue-700',    text: 'text-blue-300',    dot: 'bg-blue-400' },
  gray:   { bg: 'bg-gray-900/60',    border: 'border-gray-700',    text: 'text-gray-400',    dot: 'bg-gray-500' },
} as const;
