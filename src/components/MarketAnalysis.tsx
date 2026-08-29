import { useState, useEffect } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { RefreshCw, TrendingUp, TrendingDown, Minus, ExternalLink, Newspaper, Plus, X, AlertTriangle, Twitter } from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { fetchPriceHistory, fetchHistoryPolygon, fetchFinnhubNews } from '../lib/marketData';
 import { computeIndicators, scoreIndicators } from '../lib/technicalAnalysis';
import { useToast } from './Toast';

function formatPct(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function rsiColor(rsi: number) {
  if (rsi >= 70) return 'text-red-400';
  if (rsi <= 30) return 'text-emerald-400';
  return 'text-yellow-400';
}

function macdBadge(histogram: number) {
  if (histogram > 0) return { label: 'Bullish', cls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700' };
  if (histogram < 0) return { label: 'Bearish', cls: 'bg-red-900/50 text-red-300 border-red-700' };
  return { label: 'Neutral', cls: 'bg-gray-800 text-gray-400 border-gray-700' };
}

// Notable market indices to always show
const MARKET_INDICES = ['SPY', 'QQQ', 'IWM', 'VTI', 'EFA'];

export function MarketAnalysis() {
  const { portfolio, quotes, indicators, setQuotes, setIndicators, setSignals, apiKeys, addMarketNews } = useInvestmentStore();
  const toast = useToast();

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tickerNewsLoading, setTickerNewsLoading] = useState(false);

  const tickers = [
    ...new Set([...MARKET_INDICES, ...portfolio.holdings.map((h) => h.ticker)])
  ];

  const priceHistory =
    selectedTicker && indicators[selectedTicker]
      ? indicators[selectedTicker].priceHistory
      : [];

  const chartData = priceHistory.slice(-60).map((b) => ({
    date: b.date.slice(5), // MM-DD
    price: b.close,
  }));

  const fetchTickerNews = async (ticker: string) => {
    if (!apiKeys.finnhub) {
      toast.warning('Add a Finnhub API key in Settings to fetch company-specific news (CNBC, Reuters, Bloomberg)');
      return;
    }
    setTickerNewsLoading(true);
    const articles = await fetchFinnhubNews(ticker, apiKeys.finnhub);
    let added = 0;
    for (const a of articles) {
      addMarketNews({
        headline: a.headline,
        source:   a.source,
        url:      a.url,
        tickers:  [a.ticker],
        sentiment: a.sentiment,
      });
      added++;
    }
    setTickerNewsLoading(false);
    if (added > 0) toast.success(`Fetched ${added} news articles for ${ticker} (CNBC, Reuters, Bloomberg & more)`);
    else toast.warning(`No recent news found for ${ticker} — try again later or check your Finnhub key`);
  };

  const fetchAll = async () => {
    setIsLoading(true);
    try {
      const newQuotes = { ...quotes };
      const newIndicators = { ...indicators };

      for (const ticker of tickers) {
        let bars = await fetchPriceHistory(ticker, '1y', '1d');
        if (bars.length < 50 && apiKeys.polygon) {
          bars = await fetchHistoryPolygon(ticker, apiKeys.polygon, 365);
        }

        if (bars.length >= 20) {
          const ind = computeIndicators(ticker, bars);
          newIndicators[ticker] = ind;

          // Extract latest price from bars as a fallback quote
          const last = bars[bars.length - 1];
          const prev = bars[bars.length - 2];
          if (last && !newQuotes[ticker]) {
            const change = prev ? last.close - prev.close : 0;
            newQuotes[ticker] = {
              ticker,
              price: last.close,
              change,
              changePercent: prev ? (change / prev.close) * 100 : 0,
              volume: last.volume,
              timestamp: Date.now(),
            };
          }
        }
      }

      setQuotes(newQuotes);
      setIndicators(newIndicators);

      // Rebuild signals
      const sigs = Object.values(newIndicators).map((ind) => {
        const scored = scoreIndicators(ind);
        const { score, reasons, trendDirection, stopLoss, targetPrice, riskRewardRatio, preTradeChecklist } = scored;
        const checks = preTradeChecklist.checksPassed;

        // "No Checklist, No Trade" — checklist gates the max action
        const rawAction =
          score >= 50 ? 'STRONG_BUY' as const
          : score >= 20 ? 'BUY' as const
          : score >= 5  ? 'WATCH' as const
          : score <= -50 ? 'STRONG_SELL' as const
          : score <= -20 ? 'SELL' as const
          : 'HOLD' as const;

        const action = (() => {
          // "Never fight the trend" — no new longs in a confirmed downtrend
          if (trendDirection === 'downtrend' && (rawAction === 'STRONG_BUY' || rawAction === 'BUY')) return 'WATCH' as const;
          if (checks <= 3) return 'HOLD' as const;           // too few checks — no trade
          if (rawAction === 'WATCH' && checks < 4) return 'HOLD' as const;
          // All 7 checklist items must pass for STRONG_BUY (No Checklist, No Trade)
          if (checks <= 6) {
            if (rawAction === 'STRONG_BUY')  return 'BUY' as const;
            if (rawAction === 'STRONG_SELL') return 'SELL' as const;
          }
          return rawAction;
        })();
        return {
          ticker: ind.ticker,
          action,
          confidence: Math.abs(score),
          reasons,
          trendDirection,
          stopLoss,
          targetPrice,
          riskRewardRatio,
          preTradeChecklist,
        };
      });
      setSignals(sigs);

      toast.success(`Updated data for ${tickers.length} tickers`);
      if (!selectedTicker) setSelectedTicker(tickers[0] ?? null);
    } catch (e) {
      console.error(e);
      toast.error('Some data fetches failed — see console');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (Object.keys(indicators).length === 0) {
      fetchAll();
    } else if (!selectedTicker) {
      setSelectedTicker(tickers[0] ?? null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">

      {/* ── Header & refresh ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg">Market Analysis</h2>
          <p className="text-gray-500 text-sm">Technical indicators for your holdings + key indices</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={isLoading}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh All
        </button>
      </div>

      {/* ── Ticker selector + mini stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {tickers.map((ticker) => {
          const q = quotes[ticker];
          const ind = indicators[ticker];
          const isSelected = ticker === selectedTicker;
          const chg = q?.changePercent ?? 0;
          const isPos = chg >= 0;
          return (
            <button
              key={ticker}
              onClick={() => setSelectedTicker(ticker)}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-brand-500 bg-brand-900/40'
                  : 'border-gray-700 bg-gray-900/60 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono font-bold text-brand-400 text-sm">{ticker}</span>
                {ind ? (
                  isPos
                    ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                ) : <Minus className="w-3.5 h-3.5 text-gray-600" />}
              </div>
              <div className="text-white text-sm font-semibold">
                {q ? `$${q.price.toFixed(2)}` : '—'}
              </div>
              <div className={`text-xs ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {q ? formatPct(chg) : '—'}
              </div>
              {ind && (
                <div className={`text-xs mt-1 ${rsiColor(ind.rsi14)}`}>
                  RSI {ind.rsi14.toFixed(0)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Detailed view for selected ticker ── */}
      {selectedTicker && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Price chart */}
          <div className="lg:col-span-2 bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">{selectedTicker} — 60 Day Price</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fetchTickerNews(selectedTicker)}
                  disabled={tickerNewsLoading}
                  className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                  title="Fetch company news from CNBC, Reuters, Bloomberg, WSJ via Finnhub (requires Finnhub key)"
                >
                  <Newspaper className={`w-3 h-3 ${tickerNewsLoading ? 'animate-spin' : ''}`} />
                  {tickerNewsLoading ? 'Fetching...' : 'News'}
                </button>
                <a
                  href={`https://finance.yahoo.com/quote/${selectedTicker}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-brand-400"
                >
                  Yahoo Finance <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} interval={9} />
                  <YAxis
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  <Tooltip
                    formatter={(v: unknown) => [`$${(v as number).toFixed(2)}`, 'Close']}
                    contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-60 flex items-center justify-center text-gray-500">
                {isLoading ? 'Fetching price data...' : 'Click Refresh All to load chart data'}
              </div>
            )}
          </div>

          {/* Technical indicators panel */}
          {indicators[selectedTicker] ? (
            <IndicatorsPanel ticker={selectedTicker} ind={indicators[selectedTicker]} />
          ) : (
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 flex items-center justify-center text-gray-500 text-sm">
              No indicator data
            </div>
          )}
        </div>
      )}

      {/* ── Market News & Events ── */}
      <MarketNewsFeed />

      {/* ── Full indicators table ── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-800">
          <h3 className="text-gray-300 font-semibold">All Indicators Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-800/50 text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Ticker</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">RSI 14</th>
                <th className="px-4 py-2 text-right">MACD</th>
                <th className="px-4 py-2 text-right">SMA 20</th>
                <th className="px-4 py-2 text-right">SMA 50</th>
                <th className="px-4 py-2 text-right">SMA 200</th>
                <th className="px-4 py-2 text-left">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {Object.values(indicators).length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-500">
                    Click "Refresh All" to load indicators
                  </td>
                </tr>
              ) : (
                Object.values(indicators).map((ind) => {
                  const q = quotes[ind.ticker];
                  const price = q?.price ?? ind.priceHistory[ind.priceHistory.length - 1]?.close ?? 0;
                  const trend =
                    price > ind.sma20 && ind.sma20 > ind.sma50 && ind.sma50 > ind.sma200
                      ? 'bullish'
                      : price < ind.sma20 && ind.sma20 < ind.sma50 && ind.sma50 < ind.sma200
                      ? 'bearish'
                      : 'mixed';
                  const badge = macdBadge(ind.macd.histogram);
                  return (
                    <tr
                      key={ind.ticker}
                      className={`hover:bg-gray-800/30 cursor-pointer ${
                        selectedTicker === ind.ticker ? 'bg-brand-900/20' : ''
                      }`}
                      onClick={() => setSelectedTicker(ind.ticker)}
                    >
                      <td className="px-4 py-2 font-mono font-bold text-brand-400">{ind.ticker}</td>
                      <td className="px-4 py-2 text-right text-white">${price.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${rsiColor(ind.rsi14)}`}>
                        {ind.rsi14.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <span className={`px-1.5 py-0.5 rounded border text-xs ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2 text-right ${price > ind.sma20 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${ind.sma20.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right ${price > ind.sma50 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${ind.sma50.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 text-right ${price > ind.sma200 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${ind.sma200.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span className={`capitalize text-xs font-medium ${
                          trend === 'bullish' ? 'text-emerald-400'
                          : trend === 'bearish' ? 'text-red-400'
                          : 'text-yellow-400'
                        }`}>
                          {trend}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Indicators panel sidebar ──────────────────────────────────────────────────

import type { TechnicalIndicators } from '../types';

function IndicatorsPanel({ ticker, ind }: { ticker: string; ind: TechnicalIndicators }) {
  const price = ind.priceHistory[ind.priceHistory.length - 1]?.close ?? 0;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
      <h3 className="text-white font-semibold">{ticker} Indicators</h3>

      {/* RSI gauge */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>RSI 14</span>
          <span className={`font-bold ${rsiColor(ind.rsi14)}`}>{ind.rsi14.toFixed(1)}</span>
        </div>
        <div className="relative bg-gray-800 rounded-full h-2">
          <div className="absolute inset-y-0 left-[30%] right-[30%] bg-yellow-900/40 rounded-full" />
          <div
            className="absolute top-0 h-2 w-2 rounded-full -mt-0 bg-brand-400"
            style={{ left: `calc(${ind.rsi14}% - 4px)` }}
          />
        </div>
        <div className="flex justify-between text-xs text-gray-600 mt-0.5">
          <span>0 Oversold</span>
          <span>30</span>
          <span>70</span>
          <span>100 Overbought</span>
        </div>
      </div>

      {/* MACD */}
      <div>
        <p className="text-xs text-gray-500 mb-2">MACD</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'MACD', val: ind.macd.macdLine },
            { label: 'Signal', val: ind.macd.signalLine },
            { label: 'Histogram', val: ind.macd.histogram },
          ].map(({ label, val }) => (
            <div key={label} className="bg-gray-800 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-xs font-bold ${val >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {val.toFixed(3)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Moving Averages */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Moving Averages vs Price (${price.toFixed(2)})</p>
        {[
          { label: 'EMA 21', val: ind.ema21 },
          { label: 'SMA 20', val: ind.sma20 },
          { label: 'SMA 50', val: ind.sma50 },
          { label: 'SMA 200', val: ind.sma200 },
          { label: 'EMA 12', val: ind.ema12 },
          { label: 'EMA 26', val: ind.ema26 },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between text-xs py-1 border-b border-gray-800">
            <span className="text-gray-400">{label}</span>
            <span className={price > val ? 'text-emerald-400' : 'text-red-400'}>
              ${val.toFixed(2)} {price > val ? '▲' : '▼'}
            </span>
          </div>
        ))}
      </div>

      {/* Bollinger Bands */}
      <div>
        <p className="text-xs text-gray-500 mb-2">Bollinger Bands (20, 2σ)</p>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-gray-400">Upper</span>
            <span className="text-red-400">${ind.bollingerBands.upper.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Middle (SMA20)</span>
            <span className="text-yellow-400">${ind.bollingerBands.middle.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Lower</span>
            <span className="text-emerald-400">${ind.bollingerBands.lower.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bandwidth</span>
            <span className="text-gray-300">{ind.bollingerBands.bandwidth.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* ATR */}
      <div className="flex justify-between text-xs border-t border-gray-800 pt-3">
        <span className="text-gray-500">ATR 14 (risk sizing)</span>
        <span className="text-brand-400 font-medium">${ind.atr14.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ─── Market News Feed ──────────────────────────────────────────────────────────

function MarketNewsFeed() {
  const { marketNews, addMarketNews, removeMarketNews, clearMarketNews } = useInvestmentStore();
  const toast = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [inputHeadline, setInputHeadline] = useState('');
  const [inputSource, setInputSource] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [inputTickers, setInputTickers] = useState('');
  const [inputSentiment, setInputSentiment] = useState<'bullish' | 'bearish' | 'neutral'>('neutral');
  const [isFetching, setIsFetching] = useState(false);

  const SENTIMENT_CFG = {
    bullish: { label: 'Bullish', cls: 'bg-emerald-900 text-emerald-300 border-emerald-700' },
    bearish: { label: 'Bearish', cls: 'bg-red-900 text-red-300 border-red-700' },
    neutral: { label: 'Neutral', cls: 'bg-gray-800 text-gray-400 border-gray-600' },
  };

  const handleAdd = () => {
    if (!inputHeadline.trim()) return;
    addMarketNews({
      headline: inputHeadline.trim(),
      source: inputSource.trim() || 'Manual',
      url: inputUrl.trim() || undefined,
      tickers: inputTickers.split(/[,\s]+/).map(t => t.trim().toUpperCase()).filter(Boolean),
      sentiment: inputSentiment,
    });
    setInputHeadline('');
    setInputSource('');
    setInputUrl('');
    setInputTickers('');
    setInputSentiment('neutral');
    setIsAdding(false);
    toast.success('News item added — AI Advisor will now reference it');
  };

  // Fetch headlines from free RSS via rss2json proxy (no API key needed)
  const fetchRSSFeeds = async () => {
    setIsFetching(true);
    const FEEDS = [
      { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',                  source: 'CNBC' },
      { url: 'https://feeds.bloomberg.com/markets/news.rss',                          source: 'Bloomberg' },
      { url: 'https://feeds.a.wsj.com/rss/RSSMarketsMain.xml',                        source: 'WSJ' },
      { url: 'https://feeds.finance.yahoo.com/rss/2.0/headline?s=^GSPC&region=US&lang=en-US', source: 'Yahoo Finance' },
      { url: 'https://feeds.marketwatch.com/marketwatch/topstories/',                 source: 'MarketWatch' },
    ];
    // Note: Reuters retired public RSS in 2020 — Reuters articles appear via Finnhub company-news fetch
    let added = 0;
    for (const feed of FEEDS) {
      try {
        const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}&count=5`;
        const res = await fetch(proxyUrl);
        const json = await res.json() as { items?: Array<{ title: string; link: string; pubDate: string }> };
        for (const item of json.items ?? []) {
          const headline = item.title?.trim();
          if (!headline) continue;
          // Guess tickers mentioned in headline (simple uppercase word detection)
          const tickerMatches = headline.match(/\$([A-Z]{1,5})\b/g) ?? [];
          const tickers = tickerMatches.map(t => t.replace('$', ''));
          // Guess sentiment from keywords
          const lower = headline.toLowerCase();
          const sentiment: 'bullish' | 'bearish' | 'neutral' =
            /surges?|jumps?|rally|rallies|gains?|rises?|soars?|breaks?out|upgrade|buy/.test(lower) ? 'bullish'
            : /drops?|falls?|slumps?|crash|collapses?|plunges?|misses?|downgrade|sell|warning|risk/.test(lower) ? 'bearish'
            : 'neutral';
          addMarketNews({ headline, source: feed.source, url: item.link, tickers, sentiment });
          added++;
        }
      } catch { /* skip failed feed */ }
    }
    setIsFetching(false);
    if (added > 0) toast.success(`Fetched ${added} headlines from financial news feeds`);
    else toast.warning('Could not fetch RSS feeds — add news manually');
  };

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-brand-400" />
          <h3 className="text-gray-300 font-semibold">Market News & Events</h3>
          <span className="text-xs text-gray-600">Referenced by AI Advisor</span>
        </div>
        <div className="flex gap-2">
          {marketNews.length > 0 && (
            <button
              onClick={() => clearMarketNews()}
              className="text-xs text-gray-600 hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
          <button
            onClick={fetchRSSFeeds}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
            Fetch News
          </button>
          <button
            onClick={() => setIsAdding((v) => !v)}
            className="flex items-center gap-1.5 text-xs bg-brand-700 hover:bg-brand-600 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Manual
          </button>
        </div>
      </div>

      {/* Manual add form */}
      {isAdding && (
        <div className="p-4 border-b border-gray-800 bg-gray-900 space-y-3">
          <p className="text-xs text-gray-500">Paste a tweet, news headline, or any market event. The AI Advisor will factor it into its analysis.</p>
          <textarea
            value={inputHeadline}
            onChange={(e) => setInputHeadline(e.target.value)}
            placeholder="Paste headline or tweet text here..."
            rows={2}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-brand-500 focus:outline-none resize-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={inputSource}
              onChange={(e) => setInputSource(e.target.value)}
              placeholder="Source (e.g. X / Kobeissi Letter)"
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
            <input
              value={inputTickers}
              onChange={(e) => setInputTickers(e.target.value)}
              placeholder="Tickers (e.g. IBM, MSFT)"
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="URL (optional)"
              className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm placeholder-gray-600 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex gap-2">
              {(['bullish', 'neutral', 'bearish'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setInputSentiment(s)}
                  className={`flex-1 text-xs py-2 rounded-xl border transition-colors capitalize ${
                    inputSentiment === s ? SENTIMENT_CFG[s].cls : 'bg-gray-800 text-gray-500 border-gray-700 hover:border-gray-500'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setIsAdding(false)} className="text-xs text-gray-500 hover:text-gray-300 px-3 py-1.5">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={!inputHeadline.trim()}
              className="text-xs bg-brand-700 hover:bg-brand-600 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              Add to Feed
            </button>
          </div>
        </div>
      )}

      {/* News list */}
      {marketNews.length === 0 ? (
        <div className="p-8 text-center">
          <Newspaper className="w-8 h-8 text-gray-700 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No news items yet</p>
          <p className="text-gray-600 text-xs mt-1">Click <strong>Fetch News</strong> for live headlines, or <strong>Add Manual</strong> to paste a tweet or article</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-800/60">
          {marketNews.map((item) => {
            const cfg = SENTIMENT_CFG[item.sentiment ?? 'neutral'];
            return (
              <div key={item.id} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-800/20">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>{cfg.label}</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      {item.source === 'X' || item.source.toLowerCase().includes('twitter') ? <Twitter className="w-3 h-3" /> : null}
                      {item.source}
                    </span>
                    {item.tickers && item.tickers.length > 0 && item.tickers.map(t => (
                      <span key={t} className="text-xs font-mono text-brand-400 bg-brand-950 px-1.5 py-0.5 rounded">{t}</span>
                    ))}
                    <span className="text-xs text-gray-600 ml-auto">
                      {new Date(item.addedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-200 leading-snug">{item.headline}</p>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noreferrer"
                      className="text-xs text-brand-400 hover:underline mt-0.5 flex items-center gap-1">
                      View source <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </div>
                <button onClick={() => removeMarketNews(item.id)} className="shrink-0 text-gray-700 hover:text-red-400 transition-colors mt-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer note */}
      <div className="px-5 py-2 border-t border-gray-800 flex items-center gap-2 text-xs text-gray-600">
        <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
        News is passed to the AI Advisor as context. The AI will reference it when analysing your portfolio.
      </div>
    </div>
  );
}
