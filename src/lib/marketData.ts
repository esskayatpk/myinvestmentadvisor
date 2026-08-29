/**
 * Market data fetching via Yahoo Finance (proxied through Vite dev server)
 * and Polygon.io as a fallback.
 *
 * Proxy note: In development, Vite rewrites /api/yahoo/* to query1.finance.yahoo.com
 * to avoid CORS errors. In production, a server-side proxy or Supabase edge
 * function is required — see the MARKET_ADVISOR_GUIDE for details.
 *
 * All responses are cached in sessionStorage (15-min TTL) to prevent redundant
 * API calls when the user switches tabs or re-runs indicators.
 */

import type { PriceBar, Quote } from '../types';

const CACHE_PREFIX = 'ma_yf_';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function cacheSet<T>(key: string, data: T): void {
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ data, fetchedAt: Date.now() })
    );
  } catch {
    // storage full — ignore
  }
}

// ─── Yahoo Finance via Vite proxy ─────────────────────────────────────────────

interface YFQuoteResult {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  shortName?: string;
  longName?: string;
  symbol: string;
}

export async function fetchQuotes(tickers: string[]): Promise<Record<string, Quote>> {
  if (tickers.length === 0) return {};

  const cached: Record<string, Quote> = {};
  const toFetch: string[] = [];

  for (const t of tickers) {
    const hit = cacheGet<Quote>(`quote_${t}`);
    if (hit) cached[t] = hit;
    else toFetch.push(t);
  }

  if (toFetch.length === 0) return cached;

  try {
    const symbols = toFetch.join(',');
    // In dev: proxied through Vite → query1.finance.yahoo.com
    // In production: route through your Supabase edge function
    const res = await fetch(
      `/api/yahoo/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketVolume,marketCap,fiftyTwoWeekHigh,fiftyTwoWeekLow,shortName`,
      { headers: { Accept: 'application/json' } }
    );

    if (!res.ok) throw new Error(`YF quote HTTP ${res.status}`);

    const json = await res.json() as {
      quoteResponse: { result: YFQuoteResult[] };
    };

    const results: Record<string, Quote> = { ...cached };

    for (const q of json.quoteResponse.result ?? []) {
      const quote: Quote = {
        ticker: q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange,
        changePercent: q.regularMarketChangePercent,
        volume: q.regularMarketVolume,
        marketCap: q.marketCap,
        high52w: q.fiftyTwoWeekHigh,
        low52w: q.fiftyTwoWeekLow,
        shortName: q.shortName ?? q.longName,
        timestamp: Date.now(),
      };
      results[q.symbol] = quote;
      cacheSet(`quote_${q.symbol}`, quote);
    }

    return results;
  } catch (err) {
    console.warn('[yahooFinance] fetchQuotes failed:', err);
    return cached;
  }
}

// ─── Historical price bars (used for technical indicators) ────────────────────

/** Populated during fetchPriceHistory — maps ticker → company display name. */
export const tickerNames = new Map<string, string>();

interface YFChartMeta {
  symbol?: string;
  shortName?: string;
  longName?: string;
}

interface YFChartResult {
  meta?: YFChartMeta;
  timestamp: number[];
  indicators: {
    quote: Array<{
      open: number[];
      high: number[];
      low: number[];
      close: number[];
      volume: number[];
    }>;
  };
}

export async function fetchPriceHistory(
  ticker: string,
  range = '1y',       // '6mo' | '1y' | '2y'
  interval = '1d'     // '1d' | '1wk'
): Promise<PriceBar[]> {
  const cacheKey = `hist_${ticker}_${range}_${interval}`;
  const cached = cacheGet<PriceBar[]>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(
      `/api/yahoo/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`YF chart HTTP ${res.status}`);

    const json = await res.json() as { chart: { result: YFChartResult[] } };
    const result = json.chart.result?.[0];
    if (!result) return [];

    // Cache the company name from meta for display use
    const meta = result.meta;
    const name = meta?.shortName ?? meta?.longName;
    if (name) tickerNames.set(ticker, name);

    const { timestamp, indicators } = result;
    const [q] = indicators.quote;
    const bars: PriceBar[] = timestamp
      .map((ts, i) => ({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: q.close[i],
        volume: q.volume[i],
      }))
      .filter((b) => b.close != null && !isNaN(b.close));

    cacheSet(cacheKey, bars);
    return bars;
  } catch (err) {
    console.warn(`[yahooFinance] fetchPriceHistory(${ticker}) failed:`, err);
    return [];
  }
}

// ─── Polygon.io fallback ──────────────────────────────────────────────────────

export async function fetchQuotePolygon(
  ticker: string,
  polygonKey: string
): Promise<Quote | null> {
  if (!polygonKey) return null;

  const cacheKey = `poly_quote_${ticker}`;
  const cached = cacheGet<Quote>(cacheKey);
  if (cached) return cached;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${today}` +
      `?adjusted=true&sort=desc&limit=2&apiKey=${polygonKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon HTTP ${res.status}`);

    const json = await res.json() as {
      results: Array<{ c: number; o: number; h: number; l: number; v: number; t: number }>;
    };

    const [latest, prev] = json.results ?? [];
    if (!latest) return null;

    const change = prev ? latest.c - prev.c : 0;
    const changePercent = prev ? (change / prev.c) * 100 : 0;

    const quote: Quote = {
      ticker,
      price: latest.c,
      change,
      changePercent,
      volume: latest.v,
      timestamp: latest.t,
    };

    cacheSet(cacheKey, quote);
    return quote;
  } catch (err) {
    console.warn(`[polygon] fetchQuote(${ticker}) failed:`, err);
    return null;
  }
}

export async function fetchHistoryPolygon(
  ticker: string,
  polygonKey: string,
  days = 365
): Promise<PriceBar[]> {
  if (!polygonKey) return [];

  const cacheKey = `poly_hist_${ticker}_${days}`;
  const cached = cacheGet<PriceBar[]>(cacheKey);
  if (cached) return cached;

  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const url =
      `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}` +
      `?adjusted=true&sort=asc&limit=365&apiKey=${polygonKey}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Polygon hist HTTP ${res.status}`);

    const json = await res.json() as {
      results: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    };

    const bars: PriceBar[] = (json.results ?? []).map((r) => ({
      date: new Date(r.t).toISOString().slice(0, 10),
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    }));

    cacheSet(cacheKey, bars);
    return bars;
  } catch (err) {
    console.warn(`[polygon] fetchHistory(${ticker}) failed:`, err);
    return [];
  }
}

// ─── Finnhub company news (CNBC, Bloomberg, Reuters, WSJ + others) ────────────
//
// Finnhub aggregates articles from major financial outlets.
// Free tier: 60 req/min — more than enough for on-demand news fetching.
// TTL: 30 minutes (news changes less frequently than prices).

const NEWS_CACHE_TTL_MS = 30 * 60 * 1000;

export interface NewsArticle {
  headline: string;
  source: string;
  url: string;
  datetime: number;       // unix ms
  summary: string;
  ticker: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
}

function classifySentiment(headline: string, summary = ''): NewsArticle['sentiment'] {
  const text = (headline + ' ' + summary).toLowerCase();
  if (/surges?|jumps?|rallies?|soars?|gains?|rises?|breakout|upgrade|buy|beats?|exceeds?|record|strong|boost|surge/.test(text)) return 'bullish';
  if (/drops?|falls?|slumps?|plunges?|crashes?|misses?|downgrade|sell|warning|risk|concern|weak|loss|decline|cut|fear/.test(text)) return 'bearish';
  return 'neutral';
}

export async function fetchFinnhubNews(
  ticker: string,
  finnhubKey: string,
): Promise<NewsArticle[]> {
  if (!finnhubKey) return [];

  const cacheKey = `fh_news_${ticker}`;
  try {
    const raw = sessionStorage.getItem('ma_yf_' + cacheKey);
    if (raw) {
      const entry = JSON.parse(raw) as { data: NewsArticle[]; fetchedAt: number };
      if (Date.now() - entry.fetchedAt < NEWS_CACHE_TTL_MS) return entry.data;
    }
  } catch { /* ignore */ }

  const to   = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${finnhubKey}`,
    );
    if (!res.ok) throw new Error(`Finnhub news HTTP ${res.status}`);

    const raw = await res.json() as Array<{
      headline: string; source: string; url: string;
      datetime: number; summary?: string;
    }>;

    const articles: NewsArticle[] = raw.slice(0, 10).map((item) => ({
      headline: item.headline,
      source:   item.source,
      url:      item.url,
      datetime: item.datetime * 1000,   // Finnhub returns seconds
      summary:  item.summary ?? '',
      ticker,
      sentiment: classifySentiment(item.headline, item.summary),
    }));

    try {
      sessionStorage.setItem(
        'ma_yf_' + cacheKey,
        JSON.stringify({ data: articles, fetchedAt: Date.now() }),
      );
    } catch { /* storage full */ }

    return articles;
  } catch (err) {
    console.warn(`[finnhub] fetchNews(${ticker}) failed:`, err);
    return [];
  }
}

// Compute net sentiment score: bullish count − bearish count (range −N to +N)
// ─── Finnhub general market news (for news ticker banner) ──────────────────

export interface MarketHeadline {
  id: string;
  text: string;
  source: string;
  url: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  ticker?: string;    // portfolio ticker this headline is about
  datetime?: number;  // unix ms — for sorting newest-first
}

export async function fetchGeneralMarketNews(
  finnhubKey: string,
): Promise<MarketHeadline[]> {
  if (!finnhubKey) return [];

  const cacheKey = 'fh_general_news';
  try {
    const raw = sessionStorage.getItem('ma_yf_' + cacheKey);
    if (raw) {
      const entry = JSON.parse(raw) as { data: MarketHeadline[]; fetchedAt: number };
      if (Date.now() - entry.fetchedAt < NEWS_CACHE_TTL_MS) return entry.data;
    }
  } catch { /* ignore */ }

  const res = await fetch(
    `https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`,
  );
  if (!res.ok) throw new Error(`Finnhub general news HTTP ${res.status}`);

  const items = await res.json() as Array<{
    id: number; headline: string; source: string; url: string;
    datetime: number; summary?: string;
  }>;

  const result: MarketHeadline[] = items.slice(0, 25).map((item) => ({
    id: String(item.id),
    text: item.headline,
    source: item.source,
    url: item.url,
    sentiment: classifySentiment(item.headline, item.summary),
  }));

  try {
    sessionStorage.setItem(
      'ma_yf_' + cacheKey,
      JSON.stringify({ data: result, fetchedAt: Date.now() }),
    );
  } catch { /* storage full */ }

  return result;
}

export function computeNewsSentiment(articles: NewsArticle[]): {
  label: 'Bullish' | 'Bearish' | 'Neutral';
  score: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
} {
  const bullishCount = articles.filter((a) => a.sentiment === 'bullish').length;
  const bearishCount = articles.filter((a) => a.sentiment === 'bearish').length;
  const neutralCount = articles.filter((a) => a.sentiment === 'neutral').length;
  const score = bullishCount - bearishCount;
  const label = score > 0 ? 'Bullish' : score < 0 ? 'Bearish' : 'Neutral';
  return { label, score, bullishCount, bearishCount, neutralCount };
}
