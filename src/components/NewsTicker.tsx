/**
 * NewsTicker — horizontal scrolling banner.
 *
 * Left panel:  Live index quotes (SPY / QQQ / IWM / DIA), auto-refreshed every 5 min.
 * Right panel: Scrolling news from reputable Wall Street sources filtered to companies
 *              in your portfolio (Finnhub company-news per holding). Falls back to
 *              Finnhub general market news when portfolio is empty. Always shows static
 *              macro-context items so the ticker is never blank.
 *
 * Source allowlist:  WSJ · Bloomberg · Reuters · CNBC · Yahoo Finance · MarketWatch
 *                    Barron's · Seeking Alpha · Financial Times · Business Insider
 *                    Forbes · Fortune · Motley Fool · MSNBC · TheStreet · IBD · Benzinga
 *                    Zacks · Morningstar · AP · and more.
 *
 * Pauses on hover so you can click any headline to open in a new tab.
 */

import { useEffect, useState, useCallback } from 'react';
import { ExternalLink, RefreshCw, Newspaper } from 'lucide-react';
import { fetchQuotes, fetchFinnhubNews, fetchGeneralMarketNews } from '../lib/marketData';
import { useInvestmentStore } from '../store/investmentStore';
import type { Quote } from '../types';
import type { MarketHeadline } from '../lib/marketData';

const INDEX_TICKERS = ['SPY', 'QQQ', 'IWM', 'DIA'];
const REFRESH_MS    = 5 * 60 * 1000;   // 5-minute auto-refresh
const PX_PER_SEC    = 70;               // scroll speed (px / second)
const MAX_HOLDINGS  = 15;               // cap to stay within Finnhub 60 req/min
const MAX_HEADLINES = 45;               // total items in the strip

// ── Reputable source allowlist ─────────────────────────────────────────────────
const REPUTABLE: readonly string[] = [
  'wall street journal', 'wsj',
  'bloomberg',
  'reuters',
  'cnbc',
  'yahoo finance', 'yahoo money', 'yahoo',
  'marketwatch', 'market watch',
  "barron's", 'barrons',
  'seeking alpha',
  'financial times',
  'business insider',
  'forbes',
  'fortune',
  'motley fool', 'the motley fool',
  'msnbc',
  'nbc news',
  'thestreet', 'the street',
  "investor's business daily", 'ibd',
  'benzinga',
  'zacks',
  'morningstar',
  'associated press',
  'new york times', 'nytimes',
  'washington post',
  'kiplinger',
  'investopedia',
];

function isReputable(source: string): boolean {
  const s = source.toLowerCase();
  return REPUTABLE.some((k) => s.includes(k));
}

// ── Static macro-context items (always visible, no API key required) ──────────
const STATIC_ITEMS: MarketHeadline[] = [
  {
    id: 'cape',
    text: 'Shiller CAPE ~42 — only 3rd time above 40 in 155 years (1999: −49%, 2022: −25%) — size positions accordingly',
    source: 'multpl.com',
    url: 'https://www.multpl.com/shiller-pe',
    sentiment: 'bearish',
  },
  {
    id: 'buffett',
    text: 'Buffett Indicator ~195% — total US market cap / GDP near all-time high — use as long-term risk context',
    source: 'currentmarketvaluation.com',
    url: 'https://www.currentmarketvaluation.com/models/buffett-indicator.php',
    sentiment: 'bearish',
  },
];

function sentimentCls(s: MarketHeadline['sentiment']) {
  if (s === 'bullish') return 'text-emerald-400 hover:text-emerald-300';
  if (s === 'bearish') return 'text-red-400 hover:text-red-300';
  return 'text-gray-300 hover:text-white';
}

function tickerBadgeCls(s: MarketHeadline['sentiment']) {
  if (s === 'bullish') return 'bg-emerald-900/60 text-emerald-300 border-emerald-700';
  if (s === 'bearish') return 'bg-red-900/60 text-red-300 border-red-800';
  return 'bg-gray-800 text-gray-400 border-gray-700';
}

export function NewsTicker() {
  const { apiKeys, portfolio } = useInvestmentStore();

  const [quotes,      setQuotes]      = useState<Record<string, Quote>>({});
  const [headlines,   setHeadlines]   = useState<MarketHeadline[]>([]);
  const [paused,      setPaused]      = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [lastRefresh, setLastRefresh] = useState(0);
  const [sourceLabel, setSourceLabel] = useState('loading…');
  const [noKey,       setNoKey]       = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);

    // Always refresh index quotes (no key required)
    fetchQuotes(INDEX_TICKERS).then(setQuotes).catch(() => {});

    if (!apiKeys.finnhub) {
      setNoKey(true);
      setSourceLabel('add Finnhub key in Settings for live news');
      setLastRefresh(Date.now());
      setLoading(false);
      return;
    }
    setNoKey(false);

    const holdings = (portfolio.holdings ?? [])
      .filter((h) => h.ticker && !['CASH', 'USD'].includes(h.ticker.toUpperCase()))
      .sort((a, b) => b.value - a.value)
      .slice(0, MAX_HOLDINGS);

    if (holdings.length > 0) {
      // Fetch company news for all holdings in parallel (each cached 30 min)
      const results = await Promise.allSettled(
        holdings.map((h) => fetchFinnhubNews(h.ticker, apiKeys.finnhub!))
      );

      // Merge all articles; track unique sources for diagnostics
      const seen     = new Set<string>();
      const allSrcs  = new Set<string>();
      const allItems: MarketHeadline[] = [];

      for (let i = 0; i < results.length; i++) {
        if (results[i].status !== 'fulfilled') continue;
        const articles = (results[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof fetchFinnhubNews>>>).value;
        const sym = holdings[i].ticker;

        for (const a of articles) {
          allSrcs.add(a.source);
          if (seen.has(a.url)) continue;
          seen.add(a.url);
          allItems.push({
            id:        a.url,
            text:      a.headline,
            source:    a.source,
            url:       a.url,
            sentiment: a.sentiment,
            ticker:    sym,
            datetime:  a.datetime,
          });
        }
      }

      // Prefer reputable sources; if none pass the filter show everything
      const reputable = allItems.filter((it) => isReputable(it.source));
      const final     = reputable.length > 0 ? reputable : allItems;

      final.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));

      // Debug output so we can see exactly what Finnhub returns
      console.log(
        `[NewsTicker] holdings=${holdings.length} fetched=${allItems.length} ` +
        `reputable=${reputable.length} showing=${Math.min(final.length, MAX_HEADLINES)}`
      );
      console.log('[NewsTicker] sources seen:', [...allSrcs].sort().join(' | '));

      setHeadlines(final.slice(0, MAX_HEADLINES));
      setSourceLabel(
        `${holdings.length} holding${holdings.length > 1 ? 's' : ''} · ${
          Math.min(final.length, MAX_HEADLINES)} article${final.length !== 1 ? 's' : ''}${
          reputable.length === 0 && allItems.length > 0 ? ' (all sources)' : ''}`
      );
    } else {
      // No holdings — fall back to general market news
      try {
        const items    = await fetchGeneralMarketNews(apiKeys.finnhub);
        const filtered = items.filter((it) => isReputable(it.source));
        const final    = filtered.length > 0 ? filtered : items;
        console.log(`[NewsTicker] general news: fetched=${items.length} reputable=${filtered.length}`);
        setHeadlines(final.slice(0, MAX_HEADLINES));
        setSourceLabel(`general market · ${Math.min(final.length, MAX_HEADLINES)} articles`);
      } catch { /* silent */ }
    }

    setLastRefresh(Date.now());
    setLoading(false);
  }, [apiKeys.finnhub, portfolio.holdings]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const items: MarketHeadline[] = [...STATIC_ITEMS, ...headlines];
  const estimatedPx = items.length * 420;
  const duration    = Math.max(30, estimatedPx / PX_PER_SEC);

  return (
    <div className="bg-gray-950 border-b border-gray-800 flex items-stretch h-9 overflow-hidden shrink-0 text-xs select-none">

      {/* ── Index pins (left, sticky) ── */}
      <div className="flex items-center gap-4 px-3 bg-gray-900/80 border-r border-gray-700 shrink-0 z-10">
        {INDEX_TICKERS.map((sym) => {
          const q = quotes[sym];
          if (!q) {
            return (
              <span key={sym} className="font-mono text-gray-600 whitespace-nowrap">
                {sym} <span className="animate-pulse">···</span>
              </span>
            );
          }
          const up = q.changePercent >= 0;
          return (
            <span key={sym} className="flex items-center gap-1 font-mono whitespace-nowrap">
              <span className="text-gray-400 font-semibold">{sym}</span>
              <span className={up ? 'text-emerald-400' : 'text-red-400'}>
                {q.price.toFixed(q.price >= 100 ? 2 : 3)}
              </span>
              <span className={up ? 'text-emerald-500' : 'text-red-500'}>
                ({up ? '+' : ''}{q.changePercent.toFixed(2)}%)
              </span>
            </span>
          );
        })}
      </div>

      {/* ── Feed source label ── */}
      <div className={`flex items-center gap-1 px-2 border-r border-gray-800 shrink-0 whitespace-nowrap ${
        noKey ? 'text-amber-600' : 'text-gray-600'
      }`}>
        <Newspaper className="w-3 h-3" />
        <span className="text-[9px] uppercase tracking-wider">{sourceLabel}</span>
      </div>

      {/* ── Scrolling headlines ── */}
      <div
        className="flex-1 overflow-hidden relative"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {/* gradient fade edges */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-gray-950 to-transparent z-10 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-gray-950 to-transparent z-10 pointer-events-none" />

        <div
          className="flex items-center h-full"
          style={{
            width: 'max-content',
            animation: `ticker-scroll ${duration}s linear infinite`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        >
          {[...items, ...items].map((item, i) => (
            <span key={`${item.id}-${i}`} className="flex items-center shrink-0">
              <span className="mx-3 text-gray-700 font-bold select-none">◆</span>

              {item.url !== '#' ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseEnter={() => setPaused(true)}
                  className={`flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer hover:underline underline-offset-2 ${sentimentCls(item.sentiment)}`}
                >
                  {item.ticker && (
                    <span className={`inline-flex items-center px-1 py-0.5 rounded border text-[9px] font-bold leading-none shrink-0 ${tickerBadgeCls(item.sentiment)}`}>
                      {item.ticker}
                    </span>
                  )}
                  <span className="text-gray-500 font-semibold shrink-0">[{item.source}]</span>
                  <span className="leading-tight">{item.text}</span>
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-50" />
                </a>
              ) : (
                <span className={`flex items-center gap-1.5 whitespace-nowrap ${sentimentCls(item.sentiment)}`}>
                  <span className="text-gray-500 font-semibold shrink-0">[{item.source}]</span>
                  <span className="leading-tight">{item.text}</span>
                </span>
              )}
            </span>
          ))}
        </div>
      </div>

      {/* ── LIVE + manual refresh ── */}
      <button
        onClick={() => { if (!loading) refresh(); }}
        title={lastRefresh ? `Last refreshed ${new Date(lastRefresh).toLocaleTimeString()} · Click to refresh now` : 'Click to refresh'}
        className="shrink-0 flex items-center gap-1 px-2.5 border-l border-gray-800 text-gray-600 hover:text-gray-400 transition-colors"
      >
        <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin text-brand-400' : ''}`} />
        <span className="font-semibold tracking-widest text-[9px]">LIVE</span>
      </button>
    </div>
  );
}
