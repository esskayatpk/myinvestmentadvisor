/**
 * Forex data from multiple free sources:
 *  - ExchangeRate-API (no key, free, updated hourly)
 *  - Alpha Vantage FX_DAILY (free tier, key needed)
 *
 * Also includes hand-curated analysis context for recommended pairs.
 */

import type { ForexPairAnalysis } from '../types';
import { computeIndicators, scoreIndicators } from './technicalAnalysis';
import type { PriceBar } from '../types';

const CACHE_KEY = 'ma_forex_rates';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ─── ExchangeRate-API (free, no key) ──────────────────────────────────────────

export async function fetchExchangeRates(base = 'USD'): Promise<Record<string, number>> {
  try {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { rates, fetchedAt } = JSON.parse(cached) as {
        rates: Record<string, number>;
        fetchedAt: number;
      };
      if (Date.now() - fetchedAt < CACHE_TTL) return rates;
    }

    const res = await fetch(`https://open.er-api.com/v6/latest/${base}`);
    if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`);

    const json = await res.json() as { rates: Record<string, number> };
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ rates: json.rates, fetchedAt: Date.now() })
    );
    return json.rates;
  } catch (err) {
    console.warn('[forex] fetchExchangeRates failed:', err);
    return {};
  }
}

// ─── Alpha Vantage FX Daily (for technical analysis on forex pairs) ───────────

export async function fetchForexHistory(
  fromCurrency: string,
  toCurrency: string,
  alphaKey: string,
  outputSize: 'compact' | 'full' = 'compact'
): Promise<PriceBar[]> {
  if (!alphaKey || alphaKey === 'demo') return [];
  const cacheKey = `ma_av_fx_${fromCurrency}_${toCurrency}`;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { bars, fetchedAt } = JSON.parse(cached) as {
        bars: PriceBar[];
        fetchedAt: number;
      };
      if (Date.now() - fetchedAt < 4 * 60 * 60 * 1000) return bars; // 4hr cache
    }

    const url =
      `https://www.alphavantage.co/query?function=FX_DAILY` +
      `&from_symbol=${fromCurrency}&to_symbol=${toCurrency}` +
      `&outputsize=${outputSize}&apikey=${alphaKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`AV FX HTTP ${res.status}`);

    const json = await res.json() as {
      'Time Series FX (Daily)': Record<
        string,
        { '1. open': string; '2. high': string; '3. low': string; '4. close': string }
      >;
    };

    const ts = json['Time Series FX (Daily)'];
    if (!ts) return [];

    const bars: PriceBar[] = Object.entries(ts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({
        date,
        open: parseFloat(v['1. open']),
        high: parseFloat(v['2. high']),
        low: parseFloat(v['3. low']),
        close: parseFloat(v['4. close']),
        volume: 0,
      }));

    sessionStorage.setItem(
      cacheKey,
      JSON.stringify({ bars, fetchedAt: Date.now() })
    );
    return bars;
  } catch (err) {
    console.warn(`[forex] fetchForexHistory(${fromCurrency}/${toCurrency}) failed:`, err);
    return [];
  }
}

// ─── Recommended pairs for medium-high risk profile ──────────────────────────

const PAIR_META: Record<
  string,
  { description: string; category: 'major' | 'minor' | 'exotic'; from: string; to: string }
> = {
  'EUR/USD': { description: 'Euro / US Dollar — highest liquidity, tight spreads', category: 'major', from: 'EUR', to: 'USD' },
  'GBP/USD': { description: 'Pound / US Dollar — volatile, high opportunity', category: 'major', from: 'GBP', to: 'USD' },
  'USD/JPY': { description: 'US Dollar / Yen — safe-haven dynamics, carry trade', category: 'major', from: 'USD', to: 'JPY' },
  'AUD/USD': { description: 'Aussie Dollar / USD — commodity & risk-on proxy', category: 'major', from: 'AUD', to: 'USD' },
  'NZD/USD': { description: 'Kiwi Dollar / USD — high-beta risk-on currency', category: 'minor', from: 'NZD', to: 'USD' },
  'USD/CAD': { description: 'US Dollar / Canadian Dollar — oil price correlated', category: 'major', from: 'USD', to: 'CAD' },
  'GBP/JPY': { description: 'Pound / Yen — high volatility, called "The Dragon"', category: 'minor', from: 'GBP', to: 'JPY' },
  'EUR/GBP': { description: 'Euro / Pound — Brexit-sensitive, macro pair', category: 'minor', from: 'EUR', to: 'GBP' },
  'USD/ZAR': { description: 'US Dollar / South African Rand — EM exotic, high risk', category: 'exotic', from: 'USD', to: 'ZAR' },
  'XAU/USD': { description: 'Gold / US Dollar — hedge & inflation play', category: 'minor', from: 'XAU', to: 'USD' },
};

export const RECOMMENDED_PAIRS = Object.keys(PAIR_META);

// ─── Build full analysis for each pair ───────────────────────────────────────

export async function buildForexAnalysis(
  alphaKey: string
): Promise<ForexPairAnalysis[]> {
  // Get current rates (base USD)
  const rates = await fetchExchangeRates('USD');

  // For XAU/USD we use a separate fetch since ExchangeRate-API may not include it
  // (it usually does via XAU key)

  const analyses: ForexPairAnalysis[] = [];

  for (const [pair, meta] of Object.entries(PAIR_META)) {
    const { from, to, description, category } = meta;

    // Calculate rate (convert to pair basis)
    let rate = 0;
    if (to === 'USD') {
      // e.g. EUR/USD: how many USD per 1 EUR → rates['EUR'] = USD per EUR? No.
      // ExchangeRate-API base=USD gives: rates['EUR'] = 0.92 means 1 USD = 0.92 EUR
      // So EUR/USD = 1 / rates['EUR']
      rate = rates[from] ? 1 / rates[from] : 0;
    } else if (from === 'USD') {
      // e.g. USD/JPY: rates['JPY'] = how many JPY per 1 USD
      rate = rates[to] ?? 0;
    } else if (from === 'XAU') {
      // Gold priced in USD, often in rates as 'XAU'
      rate = rates['XAU'] ? 1 / rates['XAU'] : 0;
    } else {
      // cross rate: from/to = (1/rates[from]) / (1/rates[to]) = rates[to] / rates[from]
      rate = rates[from] && rates[to] ? rates[to] / rates[from] : 0;
    }

    // Fetch historical bars for TA (requires Alpha Vantage key)
    const bars = await fetchForexHistory(from, to, alphaKey, 'compact');

    let rsi: number | undefined;
    let signal: ForexPairAnalysis['signal'] = {
      ticker: pair,
      action: 'HOLD',
      confidence: 40,
      reasons: ['Insufficient historical data for full technical analysis'],
    };
    let trend: ForexPairAnalysis['trend'] = 'sideways';

    if (bars.length >= 30) {
      const indicators = computeIndicators(pair, bars);
      const scored = scoreIndicators(indicators);
      rsi = indicators.rsi14;

      // Determine trend
      const lastClose = bars[bars.length - 1].close;
      if (lastClose > indicators.sma20 && indicators.sma20 > indicators.sma50) trend = 'bullish';
      else if (lastClose < indicators.sma20 && indicators.sma20 < indicators.sma50) trend = 'bearish';

      const action =
        scored.score >= 50 ? 'STRONG_BUY'
        : scored.score >= 20 ? 'BUY'
        : scored.score <= -50 ? 'STRONG_SELL'
        : scored.score <= -20 ? 'SELL'
        : 'HOLD';

      signal = {
        ticker: pair,
        action,
        confidence: Math.abs(scored.score),
        reasons: scored.reasons,
        stopLoss: pair.includes('JPY')
          ? parseFloat((lastClose - indicators.atr14 * 1.5).toFixed(3))
          : parseFloat((lastClose - indicators.atr14 * 1.5).toFixed(5)),
      };
    }

    analyses.push({
      pair,
      rate: parseFloat(rate.toFixed(5)),
      change24h: 0,         // Would need historical comparison — set to 0 without extra API call
      changePercent24h: 0,
      trend,
      rsi,
      signal,
      description,
      category,
    });
  }

  return analyses;
}
