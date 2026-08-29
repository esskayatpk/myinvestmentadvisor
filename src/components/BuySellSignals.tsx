import { useState, useEffect } from 'react';
import {
  ArrowUpCircle, ArrowDownCircle, MinusCircle, AlertTriangle,
  CheckCircle2, XCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, Minus,
  Newspaper, ExternalLink, RefreshCw, Calendar, Users, BarChart2, Receipt, X, Eye,
  BookMarked,
} from 'lucide-react';
import type { PreTradeChecklist, UserPreferences, Signal, TechnicalIndicators, SignalAction } from '../types';
import { fetchFinnhubNews, computeNewsSentiment, type NewsArticle } from '../lib/marketData';
import {
  fetchFundamentals, fetchInsiderActivity, fetchEarningsInfo,
  type FundamentalData, type InsiderSummary, type EarningsInfo,
} from '../lib/fundamentals';
import { useInvestmentStore } from '../store/investmentStore';
import {
  getCurrentSession, SESSION_COLOR_MAP, getSetupQuality, SETUP_QUALITY_CONFIG,
  type SessionStatus,
} from '../lib/tradingSession';


const ACTION_CONFIG: Record<SignalAction, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  rowCls: string;
  badgeCls: string;
  order: number;
}> = {
  STRONG_BUY:  {
    label: 'Strong Buy', icon: ArrowUpCircle,
    rowCls: 'bg-emerald-950/40 border-l-2 border-emerald-600',
    badgeCls: 'bg-emerald-800 text-emerald-200 border-emerald-600',
    order: 1,
  },
  BUY:         {
    label: 'Buy', icon: ArrowUpCircle,
    rowCls: 'bg-green-950/20',
    badgeCls: 'bg-green-900 text-green-300 border-green-700',
    order: 2,
  },
  WATCH:       {
    label: 'Watch', icon: Eye,
    rowCls: 'bg-indigo-950/20',
    badgeCls: 'bg-indigo-900 text-indigo-300 border-indigo-700',
    order: 3,
  },
  HOLD:        {
    label: 'Hold', icon: MinusCircle,
    rowCls: '',
    badgeCls: 'bg-gray-800 text-gray-400 border-gray-600',
    order: 4,
  },
  SELL:        {
    label: 'Sell', icon: ArrowDownCircle,
    rowCls: 'bg-orange-950/20',
    badgeCls: 'bg-orange-900 text-orange-300 border-orange-700',
    order: 5,
  },
  STRONG_SELL: {
    label: 'Strong Sell', icon: XCircle,
    rowCls: 'bg-red-950/40 border-l-2 border-red-600',
    badgeCls: 'bg-red-900 text-red-300 border-red-700',
    order: 6,
  },
};

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 65 ? 'bg-emerald-500' : value >= 40 ? 'bg-yellow-500' : 'bg-gray-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-400">{value}%</span>
    </div>
  );
}

const CHECKLIST_LABELS: Record<keyof Omit<PreTradeChecklist, 'checksPassed'>, string> = {
  trendStrong:     'Trend Strong?',
  priceAboveEma21: 'Price Above 21 EMA?',
  volumeHealthy:   'Volume Healthy?',
  supportNearby:   'Support Nearby?',
  riskRewardGood:  'Risk:Reward ≥ 1:2?',
  structureIntact: 'Structure Intact?',
  stopLossDefined: 'Stop-Loss Defined?',
};

function PreTradeChecklistPanel({ checklist }: { checklist: PreTradeChecklist }) {
  const keys = Object.keys(CHECKLIST_LABELS) as Array<keyof typeof CHECKLIST_LABELS>;
  const allGreen = checklist.checksPassed === 7;
  const barColor = checklist.checksPassed >= 6 ? 'bg-emerald-500'
    : checklist.checksPassed >= 4 ? 'bg-yellow-500'
    : 'bg-red-500';

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Pre-Trade Checklist</p>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
          allGreen ? 'bg-emerald-900 text-emerald-300' : 'bg-gray-800 text-gray-300'
        }`}>
          {checklist.checksPassed}/7 {allGreen ? '✓ Trade Ready' : '— Review First'}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-1.5">
        <div
          className={`${barColor} h-1.5 rounded-full transition-all`}
          style={{ width: `${(checklist.checksPassed / 7) * 100}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {keys.map((key) => {
          const passed = checklist[key];
          return (
            <div
              key={key}
              className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg ${
                passed ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/30 text-red-400'
              }`}
            >
              {passed
                ? <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500" />
                : <XCircle className="w-3 h-3 shrink-0 text-red-500" />
              }
              {CHECKLIST_LABELS[key]}
            </div>
          );
        })}
      </div>

      {checklist.checksPassed < 5 && (
        <p className="text-xs text-amber-400 italic">
          No Checklist, No Trade — wait for more conditions to align.
        </p>
      )}
    </div>
  );
}

// ─── Fundamentals Panel ──────────────────────────────────────────────────────

function FundamentalsPanel({ data }: { data: FundamentalData }) {
  type Quality = 'good' | 'bad' | 'neutral' | null;
  const qColor = (q: string | null) =>
    q === 'good' ? 'text-emerald-400' : q === 'bad' ? 'text-red-400' : 'text-gray-200';

  const rows = [
    {
      label: 'P/E Ratio',
      val: data.peRatio?.toFixed(1),
      quality: (data.peRatio != null
        ? data.peRatio > 0 && data.peRatio < 15 ? 'good'
          : data.peRatio > 60 || data.peRatio < 0 ? 'bad' : 'neutral'
        : null) as Quality,
    },
    {
      label: 'P/B Ratio',
      val: data.pbRatio?.toFixed(1),
      quality: data.pbRatio != null ? (data.pbRatio < 1 ? 'good' : data.pbRatio > 5 ? 'bad' : 'neutral') : null,
    },
    {
      label: 'EPS Growth YoY',
      val: data.epsGrowthYoY != null ? `${data.epsGrowthYoY.toFixed(1)}%` : undefined,
      quality: data.epsGrowthYoY != null ? (data.epsGrowthYoY > 0 ? 'good' : 'bad') : null,
    },
    {
      label: 'Revenue Growth YoY',
      val: data.revenueGrowthYoY != null ? `${data.revenueGrowthYoY.toFixed(1)}%` : undefined,
      quality: data.revenueGrowthYoY != null ? (data.revenueGrowthYoY > 0 ? 'good' : 'bad') : null,
    },
    {
      label: 'Debt / Equity',
      val: data.debtToEquity?.toFixed(2),
      quality: data.debtToEquity != null
        ? data.debtToEquity < 1 ? 'good' : data.debtToEquity > 2.5 ? 'bad' : 'neutral'
        : null,
    },
    {
      label: 'Return on Equity',
      val: data.roe != null ? `${data.roe.toFixed(1)}%` : undefined,
      quality: data.roe != null ? (data.roe > 15 ? 'good' : data.roe < 0 ? 'bad' : 'neutral') : null,
    },
    {
      label: 'Dividend Yield',
      val: data.dividendYield != null ? `${data.dividendYield.toFixed(2)}%` : undefined,
      quality: null,
    },
  ].filter((r) => r.val !== undefined);

  if (rows.length === 0) return null;

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Fundamentals</span>
        </div>
        <span className="text-xs text-gray-600">Finnhub · trailing 12 months</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {rows.map(({ label, val, quality }) => (
          <div key={label} className="bg-gray-800/60 rounded-lg p-2.5">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`text-sm font-bold ${qColor(quality)}`}>{val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insider Activity Panel ───────────────────────────────────────────────────

function InsiderActivityPanel({ summary }: { summary: InsiderSummary }) {
  const ALERT_CONFIG: Record<InsiderSummary['alert'], { bg: string; text: string; label: string }> = {
    heavy_selling: { bg: 'bg-red-950/40 border-red-700',     text: 'text-red-400',    label: '🚨 Heavy Insider Selling' },
    selling:       { bg: 'bg-orange-950/30 border-orange-800', text: 'text-orange-400', label: '⚠️ Insider Selling' },
    neutral:       { bg: 'bg-gray-800 border-gray-600',       text: 'text-gray-400',   label: 'Insider Activity Neutral' },
    buying:        { bg: 'bg-green-950/30 border-green-800',  text: 'text-green-400',  label: '↑ Insider Buying' },
    heavy_buying:  { bg: 'bg-emerald-950/40 border-emerald-700', text: 'text-emerald-400', label: '↑↑ Strong Insider Buying' },
  };

  const cfg = ALERT_CONFIG[summary.alert];

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-brand-400" />
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Insider Activity (90d)</span>
        </div>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
          {cfg.label}
        </span>
      </div>

      {summary.transactions.length > 0 && (
        <div className="divide-y divide-gray-800/60">
          {summary.transactions.slice(0, 5).map((t, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-xs">
              <span className="text-gray-300 truncate max-w-[200px]">{t.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                <span className={t.change > 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {t.change > 0 ? '+' : ''}{Math.abs(t.change) >= 1000
                    ? `${(t.change / 1000).toFixed(1)}k`
                    : t.change
                  } shares
                </span>
                <span className="text-gray-600">{t.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Earnings Panel ───────────────────────────────────────────────────────────

function EarningsPanel({ info }: { info: EarningsInfo }) {
  const upcoming = info.daysAway !== undefined && info.daysAway >= 0;
  const urgent   = upcoming && info.daysAway! <= 7;

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-brand-400" />
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Earnings</span>
      </div>

      <div className="flex flex-wrap gap-4">
        {info.nextDate && (
          <div>
            <div className="text-xs text-gray-500">{upcoming ? 'Next Report' : 'Last Report'}</div>
            <div className={`text-sm font-semibold ${
              urgent ? 'text-amber-400' : upcoming ? 'text-blue-300' : 'text-gray-300'
            }`}>
              {info.nextDate}
              {info.daysAway !== undefined && (
                <span className="ml-1.5 text-xs font-normal">
                  ({info.daysAway === 0 ? 'Today!' : info.daysAway > 0 ? `${info.daysAway}d away` : `${Math.abs(info.daysAway)}d ago`})
                </span>
              )}
            </div>
          </div>
        )}
        {info.lastSurprisePct !== undefined && (
          <div>
            <div className="text-xs text-gray-500">Last Surprise</div>
            <div className={`text-sm font-semibold ${
              info.lastSurprisePct > 5 ? 'text-emerald-400'
              : info.lastSurprisePct < -5 ? 'text-red-400'
              : 'text-gray-300'
            }`}>
              {info.lastSurprisePct > 0 ? '+' : ''}{info.lastSurprisePct.toFixed(1)}%
            </div>
          </div>
        )}
        {info.lastActualEPS !== undefined && (
          <div>
            <div className="text-xs text-gray-500">Last EPS</div>
            <div className="text-sm font-semibold text-gray-200">${info.lastActualEPS.toFixed(2)}</div>
          </div>
        )}
        {info.lastEstimateEPS !== undefined && (
          <div>
            <div className="text-xs text-gray-500">Est EPS</div>
            <div className="text-sm font-semibold text-gray-400">${info.lastEstimateEPS.toFixed(2)}</div>
          </div>
        )}
      </div>

      {urgent && (
        <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-lg p-2">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          Earnings in {info.daysAway} day{info.daysAway !== 1 ? 's' : ''} — elevated volatility risk. Consider reducing position size or waiting for the report.
        </div>
      )}
    </div>
  );
}

// ─── Tax Note ─────────────────────────────────────────────────────────────────

function TaxNote({
  purchaseDate,
  userPreferences,
}: {
  purchaseDate: string | undefined;
  userPreferences: UserPreferences;
}) {
  if (!purchaseDate || !userPreferences.preferLongTerm) return null;

  const purchase  = new Date(purchaseDate);
  const daysHeld  = Math.floor((Date.now() - purchase.getTime()) / 86_400_000);
  const daysLeft  = 365 - daysHeld;

  const ltRate = userPreferences.taxCountry === 'US'
    ? ['10%', '12%'].includes(userPreferences.taxBracket) ? '0%'
      : ['22%', '24%', '32%'].includes(userPreferences.taxBracket) ? '15%'
      : '20%'
    : null;

  if (daysHeld >= 365) {
    return (
      <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
        <Receipt className="w-3.5 h-3.5 shrink-0" />
        <span>Long-term capital gains eligible — held {daysHeld} days (since {purchaseDate}).{ltRate && ` Applicable rate: ${ltRate}`}</span>
      </div>
    );
  } else if (daysLeft <= 30) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 border border-amber-800 rounded-lg p-3">
        <Receipt className="w-3.5 h-3.5 shrink-0" />
        <span>
          <strong>Tax note:</strong> {daysLeft}d until long-term capital gains treatment (held {daysHeld}d since {purchaseDate}).
          {ltRate && ` Short-term: ${userPreferences.taxBracket} → long-term: ${ltRate}.`}
        </span>
      </div>
    );
  }

  return null;
}

// ─── News Sentiment Panel ─────────────────────────────────────────────────────

const SOURCE_PRIORITY = ['CNBC', 'Bloomberg', 'Reuters', 'WSJ', 'Wall Street Journal'];

function sourceBadgeColor(source: string) {
  const s = source.toLowerCase();
  if (s.includes('cnbc'))      return 'bg-blue-950/50 text-blue-300 border-blue-800';
  if (s.includes('bloomberg')) return 'bg-purple-950/50 text-purple-300 border-purple-800';
  if (s.includes('reuters'))   return 'bg-amber-950/50 text-amber-300 border-amber-800';
  if (s.includes('wsj') || s.includes('wall street')) return 'bg-gray-800 text-gray-300 border-gray-600';
  return 'bg-gray-900 text-gray-500 border-gray-700';
}

function NewsSentimentPanel({
  ticker, articles, isLoading, hasKey, onFetch,
}: {
  ticker: string;
  articles: NewsArticle[];
  isLoading: boolean;
  hasKey: boolean;
  onFetch: () => void;
}) {
  // Sort: priority sources first, then chronological
  const sorted = [...articles].sort((a, b) => {
    const aPriority = SOURCE_PRIORITY.findIndex((s) => a.source.toLowerCase().includes(s.toLowerCase()));
    const bPriority = SOURCE_PRIORITY.findIndex((s) => b.source.toLowerCase().includes(s.toLowerCase()));
    if (aPriority !== bPriority) return (aPriority === -1 ? 99 : aPriority) - (bPriority === -1 ? 99 : bPriority);
    return b.datetime - a.datetime;
  });

  const sentiment = articles.length > 0 ? computeNewsSentiment(articles) : null;

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Newspaper className="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <span className="text-xs font-semibold text-gray-300">News Sentiment</span>
          <span className="text-xs text-gray-600">CNBC · Bloomberg · Reuters · WSJ</span>
        </div>
        <div className="flex items-center gap-2">
          {sentiment && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
              sentiment.label === 'Bullish' ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
              : sentiment.label === 'Bearish' ? 'bg-red-900/50 text-red-300 border-red-700'
              : 'bg-gray-800 text-gray-400 border-gray-600'
            }`}>
              {sentiment.label} ({sentiment.score > 0 ? '+' : ''}{sentiment.score})
            </span>
          )}
          <button
            onClick={onFetch}
            disabled={isLoading || !hasKey}
            title={!hasKey ? 'Add a Finnhub API key in Settings to enable news fetching' : `Fetch latest news for ${ticker}`}
            className="flex items-center gap-1 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-300 border border-gray-700 px-2 py-1 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="px-4 py-6 text-center text-xs text-gray-500 animate-pulse">
          Fetching from CNBC, Bloomberg, Reuters, WSJ…
        </div>
      ) : sorted.length === 0 ? (
        <div className="px-4 py-5 text-center space-y-1.5">
          <p className="text-xs text-gray-500">No news loaded for {ticker}</p>
          {hasKey
            ? <p className="text-xs text-gray-600">Click <strong>Refresh</strong> to fetch from CNBC, Bloomberg, Reuters &amp; more</p>
            : <p className="text-xs text-amber-600">Add a <strong>Finnhub API key</strong> in Settings → free at finnhub.io</p>
          }
        </div>
      ) : (
        <>
          {/* Sentiment breakdown bar */}
          {sentiment && (
            <div className="px-4 py-2 flex items-center gap-3 border-b border-gray-800 text-xs text-gray-400">
              <span className="text-emerald-400">{sentiment.bullishCount}↑ bullish</span>
              <span className="text-gray-600">{sentiment.neutralCount} neutral</span>
              <span className="text-red-400">{sentiment.bearishCount}↓ bearish</span>
              <span className="text-gray-600 ml-auto">Last 7 days · {sorted.length} articles</span>
            </div>
          )}
          {/* Article list */}
          <div className="divide-y divide-gray-800/50">
            {sorted.slice(0, 5).map((a, i) => (
              <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                <span className={`shrink-0 mt-0.5 text-xs px-1.5 py-0.5 rounded border ${
                  a.sentiment === 'bullish' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800'
                  : a.sentiment === 'bearish' ? 'bg-red-950/60 text-red-400 border-red-800'
                  : 'bg-gray-800 text-gray-500 border-gray-700'
                }`}>
                  {a.sentiment === 'bullish' ? '↑' : a.sentiment === 'bearish' ? '↓' : '→'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 leading-snug line-clamp-2">{a.headline}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${sourceBadgeColor(a.source)}`}>
                      {a.source}
                    </span>
                    <span className="text-xs text-gray-600">
                      {new Date(a.datetime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer"
                        className="text-xs text-brand-400 hover:underline flex items-center gap-0.5 ml-auto"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Read <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Position Sizing Card ─────────────────────────────────────────────────────

function PositionSizingCard({
  price,
  atr,
  action,
  riskPerTrade,
}: {
  price: number;
  atr: number;
  action: SignalAction;
  riskPerTrade: number;
}) {
  if (!price || !atr || atr === 0) return null;

  const stopDistance  = atr * 1.5;          // 1.5× ATR stop
  const targetDistance = atr * 3;           // 3× ATR target
  const minShares     = Math.max(1, Math.ceil(riskPerTrade / stopDistance));
  const minInvestment = minShares * price;
  const potentialReward = minShares * targetDistance;
  const stopPrice     = price - stopDistance;
  const targetPrice   = price + targetDistance;

  // Sizing guidance by action
  const sizing = {
    STRONG_BUY:  { mult: 1.0, label: 'Full position', color: 'text-emerald-400' },
    BUY:         { mult: 0.75, label: '¾ position', color: 'text-green-400' },
    WATCH:       { mult: 0.25, label: 'Starter / scale-in', color: 'text-indigo-400' },
    HOLD:        { mult: 0,   label: 'No new position', color: 'text-gray-500' },
    SELL:        { mult: 0,   label: 'Consider reducing', color: 'text-orange-400' },
    STRONG_SELL: { mult: 0,   label: 'Consider full exit', color: 'text-red-400' },
  }[action];

  const suggestedShares = Math.round(minShares * sizing.mult);
  const suggestedInvestment = suggestedShares * price;

  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm">💰</span>
          <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Position Sizing</span>
        </div>
        <span className="text-xs text-gray-600">Based on ${riskPerTrade.toLocaleString()} risk/trade · 1.5× ATR stop</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">Min Shares</div>
          <div className="text-sm font-bold text-gray-200">{minShares.toLocaleString()}</div>
          <div className="text-xs text-gray-600">to cover 1R risk</div>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">Min Investment</div>
          <div className="text-sm font-bold text-white">
            ${minInvestment >= 1000 ? `${(minInvestment / 1000).toFixed(1)}K` : minInvestment.toFixed(0)}
          </div>
          <div className="text-xs text-gray-600">{minShares} shares @ ${price.toFixed(2)}</div>
        </div>
        <div className="bg-red-950/30 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">Max Risk</div>
          <div className="text-sm font-bold text-red-400">${riskPerTrade.toLocaleString()}</div>
          <div className="text-xs text-gray-600">stop @ ${stopPrice.toFixed(2)}</div>
        </div>
        <div className="bg-emerald-950/20 rounded-lg p-2.5 text-center">
          <div className="text-xs text-gray-500">Pot. Reward (3R)</div>
          <div className="text-sm font-bold text-emerald-400">
            ${potentialReward >= 1000 ? `${(potentialReward / 1000).toFixed(1)}K` : potentialReward.toFixed(0)}
          </div>
          <div className="text-xs text-gray-600">target @ ${targetPrice.toFixed(2)}</div>
        </div>
      </div>

      {/* Suggested position for this signal strength */}
      {suggestedShares > 0 && (
        <div className={`flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2`}>
          <span className="text-gray-400">
            Suggested for <strong className={sizing.color}>{ACTION_CONFIG[action].label}</strong>:
            {' '}{sizing.label}
          </span>
          <span className="font-bold text-gray-200">
            {suggestedShares} shares
            {' '}·{' '}
            ~${suggestedInvestment >= 1000
              ? `${(suggestedInvestment / 1000).toFixed(1)}K`
              : suggestedInvestment.toFixed(0)
            }
          </span>
        </div>
      )}

      {action === 'WATCH' && (
        <p className="text-xs text-indigo-400 italic">
          Watch signal — consider a small starter position or wait for score to reach BUY threshold (≥ 20) before adding full size.
        </p>
      )}

      <p className="text-[10px] text-gray-600 leading-relaxed">
        Risk per trade set in Settings. Change it to match your account size and risk tolerance.
      </p>
    </div>
  );
}

// ─── Hover Tooltip ────────────────────────────────────────────────────────────

function HoverTooltip({ lines, children }: { lines: string[]; children: React.ReactNode }) {
  return (
    <span className="relative group/htip inline-flex">
      {children}
      {/* Tooltip panel — shown on hover, hidden otherwise */}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2
        hidden group-hover/htip:flex flex-col items-center z-[70]">
        <span className="bg-gray-900 border border-gray-700 text-white text-xs rounded-xl
          px-3 py-2.5 shadow-2xl w-64 space-y-1 block">
          {lines.map((l, i) => (
            <span key={i} className={`block leading-snug ${
              i === 0 ? 'text-gray-100 font-semibold'
              : l.startsWith('→') ? 'text-brand-400 text-[10px] mt-1 font-medium'
              : 'text-gray-400'
            }`}>
              {l}
            </span>
          ))}
        </span>
        {/* Caret */}
        <span className="w-0 h-0 border-l-4 border-r-4 border-t-4
          border-l-transparent border-r-transparent border-t-gray-700 block" />
      </span>
    </span>
  );
}

// ─── Signal Detail Modal ──────────────────────────────────────────────────────

function SignalDetailModal({
  sig, ind, fund, insider, earnings, onClose,
}: {
  sig: Signal;
  ind: TechnicalIndicators | undefined;
  fund: FundamentalData | undefined;
  insider: InsiderSummary | undefined;
  earnings: EarningsInfo | undefined;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cfg = ACTION_CONFIG[sig.action];
  const Icon = cfg.icon;
  const checks = sig.preTradeChecklist?.checksPassed;
  const gateActive = checks !== undefined && checks <= 3;

  // Categorise reasons by pillar keyword
  const categorise = (keywords: RegExp) => sig.reasons.filter((r) => keywords.test(r));
  const trendR     = categorise(/trend|ema|sma|moving average|higher high|lower low/i);
  const momentumR  = categorise(/rsi|macd|momentum|overbought|oversold/i);
  const volumeR    = categorise(/volume/i);
  const structureR = categorise(/structure|consolidat|support|resistance|breakout|bollinger|band|squeeze/i);
  const used       = new Set([...trendR, ...momentumR, ...volumeR, ...structureR]);
  const otherR     = sig.reasons.filter((r) => !used.has(r));

  const pillars = [
    { label: 'Trend',              icon: '📈', reasons: trendR },
    { label: 'Momentum (RSI/MACD)', icon: '⚡', reasons: momentumR },
    { label: 'Volume',             icon: '📊', reasons: volumeR },
    { label: 'Market Structure',   icon: '🏗️', reasons: structureR },
    { label: 'Risk & Reward',      icon: '⚖️', reasons: otherR },
  ].filter((p) => p.reasons.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto
          bg-gray-950 border border-gray-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal header ── */}
        <div className={`sticky top-0 flex items-center gap-3 px-6 py-4 border-b border-gray-800 rounded-t-2xl bg-gray-950 ${cfg.rowCls}`}>
          <Icon className={`w-6 h-6 shrink-0 ${
            sig.action.includes('BUY')  ? 'text-emerald-400'
            : sig.action.includes('SELL') ? 'text-red-400'
            : 'text-gray-400'
          }`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-white text-xl">{sig.ticker}</span>
              <span className={`text-sm px-3 py-0.5 rounded-full border font-semibold ${cfg.badgeCls}`}>
                {cfg.label}
              </span>
              {sig.trendDirection && (
                <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                  sig.trendDirection === 'uptrend'   ? 'border-emerald-700 text-emerald-400 bg-emerald-950/30'
                  : sig.trendDirection === 'downtrend' ? 'border-red-700 text-red-400 bg-red-950/30'
                  : 'border-gray-700 text-gray-500'
                }`}>
                  {sig.trendDirection === 'uptrend'   ? <TrendingUp className="w-3 h-3" />
                   : sig.trendDirection === 'downtrend' ? <TrendingDown className="w-3 h-3" />
                   : <Minus className="w-3 h-3" />}
                  {sig.trendDirection}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Technical analysis · {sig.reasons.length} factors evaluated
            </p>
          </div>
          <div className="text-center shrink-0">
            <div className={`text-2xl font-bold ${
              sig.confidence >= 65 ? 'text-emerald-400'
              : sig.confidence >= 40 ? 'text-yellow-400'
              : 'text-gray-400'
            }`}>{sig.confidence}%</div>
            <div className="text-xs text-gray-500">confidence</div>
          </div>
          <button
            onClick={onClose}
            className="ml-1 p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-200 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">

          {/* Checklist gate notice */}
          {gateActive && (
            <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-lg p-3 text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Checklist gate active</strong> — only {checks}/6 pre-trade conditions met.
                Signal was forced to HOLD regardless of technical score (rule: ≤ 3/6 = No Trade).
              </span>
            </div>
          )}

          {/* Confidence bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-gray-500 uppercase tracking-wide font-semibold">Technical Confidence Score</span>
              <span className="text-xs text-gray-400 font-mono">{sig.confidence} / 100</span>
            </div>
            <div className="relative w-full bg-gray-800 rounded-full h-2.5">
              <div
                className={`h-2.5 rounded-full transition-all ${
                  sig.confidence >= 65 ? 'bg-emerald-500'
                  : sig.confidence >= 40 ? 'bg-yellow-500'
                  : 'bg-red-500'
                }`}
                style={{ width: `${sig.confidence}%` }}
              />
              {/* Zone markers */}
              <div className="absolute top-0 left-[35%] h-2.5 w-px bg-gray-600" />
              <div className="absolute top-0 left-[65%] h-2.5 w-px bg-gray-600" />
            </div>
            <div className="flex text-[10px] text-gray-600 mt-1">
              <span className="w-[35%]">Sell zone</span>
              <span className="w-[30%] text-center">Hold / Neutral</span>
              <span className="text-right flex-1">Buy zone</span>
            </div>
          </div>

          {/* Pillar-by-pillar reasons */}
          {pillars.map(({ label, icon, reasons }) => (
            <div key={label}>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold flex items-center gap-1.5">
                <span>{icon}</span>{label}
              </p>
              <ul className="space-y-2">
                {reasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-300 bg-gray-900/40 rounded-lg px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Pre-trade checklist */}
          {sig.preTradeChecklist && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">✅ Pre-Trade Checklist Gate</p>
              <PreTradeChecklistPanel checklist={sig.preTradeChecklist} />
            </div>
          )}

          {/* Price levels */}
          {(sig.stopLoss || sig.targetPrice) && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">🎯 ATR-Based Price Levels</p>
              <div className="grid grid-cols-3 gap-3">
                {sig.stopLoss && (
                  <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Stop-Loss (1.5× ATR)</div>
                    <div className="text-red-400 font-bold text-sm">${sig.stopLoss.toFixed(2)}</div>
                    <div className="text-xs text-gray-600 mt-0.5">Max loss before exit</div>
                  </div>
                )}
                {sig.targetPrice && (
                  <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3">
                    <div className="text-xs text-gray-500">Target (3× ATR)</div>
                    <div className="text-emerald-400 font-bold text-sm">${sig.targetPrice.toFixed(2)}</div>
                    <div className="text-xs text-gray-600 mt-0.5">Profit-taking level</div>
                  </div>
                )}
                {sig.riskRewardRatio !== undefined && (
                  <div className={`border rounded-lg p-3 ${
                    sig.riskRewardRatio >= 3 ? 'bg-emerald-900/20 border-emerald-700'
                    : sig.riskRewardRatio >= 2 ? 'bg-yellow-900/20 border-yellow-700'
                    : 'bg-red-900/20 border-red-700'
                  }`}>
                    <div className="text-xs text-gray-500">Risk : Reward</div>
                    <div className={`font-bold text-sm ${
                      sig.riskRewardRatio >= 3 ? 'text-emerald-400'
                      : sig.riskRewardRatio >= 2 ? 'text-yellow-400'
                      : 'text-red-400'
                    }`}>
                      1 : {sig.riskRewardRatio.toFixed(1)}
                      {sig.riskRewardRatio >= 3 ? ' ✓ Favourable' : sig.riskRewardRatio < 2 ? ' ✗ Poor' : ''}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Technical indicators */}
          {ind && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">📐 Technical Indicators</p>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
                {[
                  { label: 'RSI 14',  val: ind.rsi14.toFixed(1), note: ind.rsi14 > 70 ? '⚠ Overbought' : ind.rsi14 < 30 ? '⚠ Oversold' : '' },
                  { label: 'EMA 21',  val: `$${ind.ema21.toFixed(2)}`, note: '' },
                  { label: 'SMA 50',  val: `$${ind.sma50.toFixed(2)}`, note: '' },
                  { label: 'SMA 200', val: `$${ind.sma200.toFixed(2)}`, note: '' },
                  { label: 'ATR 14',  val: `$${ind.atr14.toFixed(2)}`, note: 'volatility' },
                  { label: 'BB Width',val: `${ind.bollingerBands.bandwidth.toFixed(1)}%`, note: '' },
                  { label: 'MACD',    val: ind.macd.histogram > 0 ? '▲ Bull' : '▼ Bear', note: '' },
                ].map(({ label, val, note }) => (
                  <div key={label} className="bg-gray-800/60 rounded-lg p-2">
                    <div className="text-[10px] text-gray-500">{label}</div>
                    <div className="text-xs font-bold text-gray-200">{val}</div>
                    {note && <div className="text-[10px] text-gray-500 mt-0.5">{note}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loaded fundamentals (if already fetched) */}
          {(earnings || insider || fund) && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">🏦 Fundamental Context</p>
              <div className="space-y-3">
                {earnings && <EarningsPanel info={earnings} />}
                {insider  && <InsiderActivityPanel summary={insider} />}
                {fund     && <FundamentalsPanel data={fund} />}
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Fundamentals not yet loaded? Expand the signal row in the main list to trigger the fetch.
              </p>
            </div>
          )}

          {/* Disclaimer */}
          <p className="text-xs text-gray-600 border-t border-gray-800 pt-4 leading-relaxed">
            This analysis is algorithmic and based on historical price data and financial metrics.
            It is <strong className="text-gray-500">not investment advice</strong>. Past performance does not guarantee future results.
            Always consult a licensed financial advisor before making investment decisions.
          </p>

        </div>
      </div>
    </div>
  );
}

export function BuySellSignals() {
  const {
    signals, indicators, quotes, portfolio, signalFilter, setSignalFilter,
    apiKeys, userPreferences, setActiveTab,
  } = useInvestmentStore();
  const [sortBy, setSortBy] = useState<'action' | 'confidence' | 'ticker'>('action');
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [modalTicker, setModalTicker] = useState<string | null>(null);
  const [tickerNews,  setTickerNews]  = useState<Record<string, NewsArticle[]>>({});
  const [newsLoading, setNewsLoading] = useState<Record<string, boolean>>({});
  const [fundData,    setFundData]    = useState<Record<string, FundamentalData>>({});
  const [insiderData, setInsiderData] = useState<Record<string, InsiderSummary>>({});
  const [earningsData, setEarningsData] = useState<Record<string, EarningsInfo>>({});
  const [fundLoading, setFundLoading] = useState<Record<string, boolean>>({});
  const filter = (signalFilter ?? 'ALL') as SignalAction | 'ALL' | 'BUY_ALL' | 'SELL_ALL';

  // Live trading session
  const [session, setSession] = useState<SessionStatus>(getCurrentSession);
  useEffect(() => {
    const tick = () => setSession(getCurrentSession());
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const setFilter = (f: string) => setSignalFilter(f);

  const fetchNewsForTicker = async (ticker: string) => {
    if (!apiKeys.finnhub || newsLoading[ticker]) return;
    setNewsLoading((prev) => ({ ...prev, [ticker]: true }));
    const articles = await fetchFinnhubNews(ticker, apiKeys.finnhub);
    setTickerNews((prev) => ({ ...prev, [ticker]: articles }));
    setNewsLoading((prev) => ({ ...prev, [ticker]: false }));
  };

  const fetchFundamentalsForTicker = async (ticker: string) => {
    if (!apiKeys.finnhub || fundLoading[ticker]) return;
    setFundLoading((prev) => ({ ...prev, [ticker]: true }));
    const [fund, insider, earnings] = await Promise.all([
      fetchFundamentals(ticker, apiKeys.finnhub),
      fetchInsiderActivity(ticker, apiKeys.finnhub),
      fetchEarningsInfo(ticker, apiKeys.finnhub),
    ]);
    if (fund)    setFundData((prev)    => ({ ...prev, [ticker]: fund }));
    if (insider) setInsiderData((prev) => ({ ...prev, [ticker]: insider }));
    if (earnings) setEarningsData((prev) => ({ ...prev, [ticker]: earnings }));
    setFundLoading((prev) => ({ ...prev, [ticker]: false }));
  };

  // Auto-fetch news + fundamentals when a signal row is expanded
  const handleExpand = (ticker: string) => {
    const next = expanded === ticker ? null : ticker;
    setExpanded(next);
    if (next && apiKeys.finnhub) {
      if (!tickerNews[next])  fetchNewsForTicker(next);
      if (!fundData[next])    fetchFundamentalsForTicker(next);
    }
  };

  const allSignals = [...signals].sort((a, b) => {
    if (sortBy === 'action') {
      return (ACTION_CONFIG[a.action]?.order ?? 99) - (ACTION_CONFIG[b.action]?.order ?? 99);
    }
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    return a.ticker.localeCompare(b.ticker);
  });

  const filtered = filter === 'ALL'
    ? allSignals
    : filter === 'BUY_ALL'
      ? allSignals.filter((s) => s.action === 'BUY' || s.action === 'STRONG_BUY')
      : filter === 'SELL_ALL'
        ? allSignals.filter((s) => s.action === 'SELL' || s.action === 'STRONG_SELL')
        : allSignals.filter((s) => s.action === filter);

  const counts = {
    STRONG_BUY:  signals.filter((s) => s.action === 'STRONG_BUY').length,
    BUY:         signals.filter((s) => s.action === 'BUY').length,
    WATCH:       signals.filter((s) => s.action === 'WATCH').length,
    HOLD:        signals.filter((s) => s.action === 'HOLD').length,
    SELL:        signals.filter((s) => s.action === 'SELL').length,
    STRONG_SELL: signals.filter((s) => s.action === 'STRONG_SELL').length,
  };

  return (
    <div className="space-y-6">

      {/* ── Playbook: Trading Session Banner ── */}
      {(() => {
        const sc = SESSION_COLOR_MAP[session.session.colorKey];
        return (
          <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-4 flex-wrap ${sc.bg} ${sc.border}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-base">{session.session.emoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold ${sc.text}`}>{session.session.label}</span>
                  {session.session.canTrade
                    ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-900 text-emerald-300 border border-emerald-700">TRADE WINDOW</span>
                    : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">STAND DOWN</span>
                  }
                </div>
                <p className={`text-xs ${sc.text} opacity-80 leading-tight mt-0.5`}>{session.session.playbookAdvice}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right text-xs">
                <div className={`font-bold ${session.session.sizeMultiplier === 1 ? 'text-emerald-400' : session.session.sizeMultiplier === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                  {session.session.sizeMultiplier === 0 ? 'No Trade' : `${Math.round(session.session.sizeMultiplier * 100)}% size`}
                </div>
                <div className="text-gray-600">ET {session.etTime}</div>
              </div>
              <button
                onClick={() => setActiveTab('playbook')}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-gray-800/80 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
              >
                <BookMarked className="w-3 h-3" />
                Rules
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Header ── */}
      <div>
        <h2 className="text-white font-bold text-lg">Buy / Sell Signals</h2>
        <p className="text-gray-500 text-sm">
          Scored across 5 pillars: Trend · Location · Volume · Risk:Reward · Market Structure.
          <strong className="text-indigo-400"> Watch</strong> = setup forming (score 5–19, monitor for entry).
          Expand any signal to see the checklist, position sizing, and ATR-based stops.
        </p>
      </div>

      {/* ── Summary bar ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {(Object.keys(ACTION_CONFIG) as SignalAction[]).map((action) => {
          const cfg = ACTION_CONFIG[action];
          const Icon = cfg.icon;
          return (
            <button
              key={action}
              onClick={() => setFilter(filter === action ? 'ALL' : action)}
              className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                filter === action
                  ? cfg.badgeCls + ' scale-105 shadow-lg'
                  : 'border-gray-700 bg-gray-900/50 hover:border-gray-500 text-gray-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-lg font-bold">{counts[action]}</span>
              <span className="text-xs">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Disclaimer ── */}
      <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-amber-200 text-xs">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Signals combine <strong>technical analysis</strong> (5-pillar scoring) with{' '}
          <strong>fundamentals, insider activity, and earnings context</strong> (Finnhub — requires API key).
          This is <strong>not investment advice</strong>. Always do your own research.
        </span>
      </div>

      {/* ── Sort controls ── */}
      <div className="flex gap-2 text-sm">
        <span className="text-gray-500 self-center">Sort:</span>
        {(['action', 'confidence', 'ticker'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className={`px-3 py-1 rounded-lg capitalize transition-colors ${
              sortBy === s ? 'bg-brand-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
        {filter !== 'ALL' && (
          <button
            onClick={() => setFilter('ALL')}
            className="px-3 py-1 rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600 ml-auto text-xs"
          >
            Clear filter
          </button>
        )}
      </div>

      {/* ── Signals table ── */}
      {filtered.length === 0 ? (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-10 text-center text-gray-500">
          {signals.length === 0
            ? 'No signals yet — go to Analysis tab and click "Refresh All"'
            : `No ${filter.replace('_', ' ')} signals`
          }
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((sig) => {
            const cfg = ACTION_CONFIG[sig.action];
            const Icon = cfg.icon;
            const ind = indicators[sig.ticker];
            const q = quotes[sig.ticker];
            const holding = portfolio.holdings.find((h) => h.ticker === sig.ticker);
            const isExpanded = expanded === sig.ticker;

            return (
              <div
                key={sig.ticker}
                className={`rounded-xl border border-gray-800 overflow-hidden ${cfg.rowCls}`}
              >
                {/* Row — div instead of button so nested buttons are valid HTML */}
                <div
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-4 px-5 py-3 text-left hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => handleExpand(sig.ticker)}
                  onKeyDown={(e) => e.key === 'Enter' && handleExpand(sig.ticker)}
                >
                  {/* Action icon */}
                  <Icon className={`w-5 h-5 shrink-0 ${
                    sig.action.includes('BUY') ? 'text-emerald-400'
                    : sig.action.includes('SELL') ? 'text-red-400'
                    : 'text-gray-500'
                  }`} />

                  {/* Ticker */}
                  <div className="w-20 shrink-0">
                    <div className="font-mono font-bold text-white">{sig.ticker}</div>
                    {holding && (
                      <div className="text-xs text-gray-500 truncate">{holding.category}</div>
                    )}
                  </div>

                  {/* Signal badge — click for modal, hover for quick summary */}
                  <HoverTooltip lines={[
                    `${cfg.label} · ${sig.confidence}% confidence`,
                    ...(sig.reasons.slice(0, 2).map((r) => r.length > 60 ? r.slice(0, 57) + '…' : r)),
                    '→ Click for full analysis',
                  ]}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setModalTicker(sig.ticker); }}
                      className={`text-xs px-2 py-0.5 rounded border font-medium cursor-pointer
                        hover:brightness-125 transition-all active:scale-95 ${cfg.badgeCls}`}
                    >
                      {cfg.label}
                    </button>
                  </HoverTooltip>

                  {/* Playbook setup quality badge */}
                  {(() => {
                    const quality = getSetupQuality(sig.action, sig.confidence, sig.preTradeChecklist?.checksPassed ?? 0);
                    if (!quality) return null;
                    const qcfg = SETUP_QUALITY_CONFIG[quality];
                    return (
                      <span className={`hidden sm:inline shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${qcfg.cls}`}
                        title={`Playbook setup quality: ${quality} — ${qcfg.desc}`}>
                        {qcfg.label}
                      </span>
                    );
                  })()}

                  {/* Price info */}
                  <div className="flex-1 hidden sm:block">
                    {q && (
                      <span className="text-sm text-gray-300">
                        ${q.price.toFixed(2)}{' '}
                        <span className={q.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {q.changePercent >= 0 ? '+' : ''}{q.changePercent.toFixed(2)}%
                        </span>
                      </span>
                    )}
                  </div>

                  {/* Confidence */}
                  <div className="hidden md:block">
                    <ConfidenceBar value={sig.confidence} />
                  </div>

                  {/* Indicators mini + trend badge */}
                  {ind && (
                    <div className="hidden lg:flex items-center gap-3 text-xs text-gray-400">
                      <span>RSI {ind.rsi14.toFixed(0)}</span>
                      <span className={ind.macd.histogram > 0 ? 'text-emerald-400' : 'text-red-400'}>
                        MACD {ind.macd.histogram > 0 ? '▲' : '▼'}
                      </span>
                    </div>
                  )}
                  {sig.trendDirection && (() => {
                    const trendReasons = sig.reasons.filter((r) =>
                      /trend|ema|sma|higher high|lower low/i.test(r),
                    );
                    const trendLines = [
                      `${sig.trendDirection.charAt(0).toUpperCase() + sig.trendDirection.slice(1)} detected`,
                      ...trendReasons.slice(0, 2).map((r) => r.length > 60 ? r.slice(0, 57) + '…' : r),
                      '→ Click for full trend analysis',
                    ];
                    return (
                      <HoverTooltip lines={trendLines}>
                        <button
                          onClick={(e) => { e.stopPropagation(); setModalTicker(sig.ticker); }}
                          className={`hidden xl:flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border
                            cursor-pointer hover:brightness-125 transition-all active:scale-95 ${
                            sig.trendDirection === 'uptrend'   ? 'border-emerald-700 text-emerald-400 bg-emerald-950/30'
                            : sig.trendDirection === 'downtrend' ? 'border-red-700 text-red-400 bg-red-950/30'
                            : 'border-gray-700 text-gray-500'
                          }`}
                        >
                          {sig.trendDirection === 'uptrend'
                            ? <TrendingUp className="w-3 h-3" />
                            : sig.trendDirection === 'downtrend'
                              ? <TrendingDown className="w-3 h-3" />
                              : <Minus className="w-3 h-3" />
                          }
                          {sig.trendDirection}
                        </button>
                      </HoverTooltip>
                    );
                  })()}

                  {/* Chevron */}
                  {isExpanded
                    ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                  }
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-800 bg-gray-950/40 px-5 py-4 space-y-4">

                    {/* Pre-trade checklist */}
                    {sig.preTradeChecklist && (
                      <PreTradeChecklistPanel checklist={sig.preTradeChecklist} />
                    )}

                    {/* Earnings + Insider + Fundamentals loading state */}
                    {fundLoading[sig.ticker] && (
                      <div className="text-center text-xs text-gray-500 animate-pulse py-2">
                        Loading fundamentals, insider activity &amp; earnings from Finnhub…
                      </div>
                    )}

                    {/* Earnings */}
                    {earningsData[sig.ticker] && (
                      <EarningsPanel info={earningsData[sig.ticker]} />
                    )}

                    {/* Insider Activity */}
                    {insiderData[sig.ticker] && (
                      <InsiderActivityPanel summary={insiderData[sig.ticker]} />
                    )}

                    {/* Fundamentals */}
                    {fundData[sig.ticker] && (
                      <FundamentalsPanel data={fundData[sig.ticker]} />
                    )}

                    {/* No Finnhub key notice */}
                    {!apiKeys.finnhub && !fundData[sig.ticker] && (
                      <div className="text-center text-xs text-gray-600 bg-gray-900/60 border border-gray-800 rounded-xl p-3">
                        Add a <strong className="text-gray-400">Finnhub API key</strong> in Settings to see fundamentals,
                        insider activity, and earnings data. Free at{' '}
                        <a href="https://finnhub.io" target="_blank" rel="noreferrer" className="text-brand-400 hover:underline">
                          finnhub.io
                        </a>.
                      </div>
                    )}

                    {/* Position Sizing */}
                    {ind && q && (
                      <PositionSizingCard
                        price={q.price}
                        atr={ind.atr14}
                        action={sig.action}
                        riskPerTrade={userPreferences.riskPerTrade ?? 500}
                      />
                    )}

                    {/* Price levels + R:R */}
                    {(sig.targetPrice || sig.stopLoss) && (
                      <div className="grid grid-cols-3 gap-3">
                        {sig.stopLoss && (
                          <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Stop-Loss (1.5× ATR)</div>
                            <div className="text-red-400 font-bold text-sm">${sig.stopLoss.toFixed(2)}</div>
                          </div>
                        )}
                        {sig.targetPrice && (
                          <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3">
                            <div className="text-xs text-gray-500">Target (3× ATR)</div>
                            <div className="text-emerald-400 font-bold text-sm">${sig.targetPrice.toFixed(2)}</div>
                          </div>
                        )}
                        {sig.riskRewardRatio !== undefined && (
                          <div className={`border rounded-lg p-3 ${
                            sig.riskRewardRatio >= 3 ? 'bg-emerald-900/20 border-emerald-700'
                            : sig.riskRewardRatio >= 2 ? 'bg-yellow-900/20 border-yellow-700'
                            : 'bg-red-900/20 border-red-700'
                          }`}>
                            <div className="text-xs text-gray-500">Risk : Reward</div>
                            <div className={`font-bold text-sm ${
                              sig.riskRewardRatio >= 3 ? 'text-emerald-400'
                              : sig.riskRewardRatio >= 2 ? 'text-yellow-400'
                              : 'text-red-400'
                            }`}>
                              1 : {sig.riskRewardRatio.toFixed(1)}
                              {sig.riskRewardRatio >= 3 ? ' ✓' : sig.riskRewardRatio < 2 ? ' ✗' : ''}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Signal reasons */}
                    <div>
                      <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Analysis Breakdown</p>
                      <ul className="space-y-1.5">
                        {sig.reasons.map((reason, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Full indicator snapshot */}
                    {ind && (
                      <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 text-center">
                        {[
                          { label: 'RSI 14', val: ind.rsi14.toFixed(1) },
                          { label: 'EMA 21', val: `$${ind.ema21.toFixed(2)}` },
                          { label: 'SMA 20', val: `$${ind.sma20.toFixed(2)}` },
                          { label: 'SMA 50', val: `$${ind.sma50.toFixed(2)}` },
                          { label: 'SMA 200', val: `$${ind.sma200.toFixed(2)}` },
                          { label: 'BB Width', val: `${ind.bollingerBands.bandwidth.toFixed(1)}%` },
                          { label: 'ATR 14', val: `$${ind.atr14.toFixed(2)}` },
                        ].map(({ label, val }) => (
                          <div key={label} className="bg-gray-800/60 rounded-lg p-2">
                            <div className="text-xs text-gray-500">{label}</div>
                            <div className="text-xs font-bold text-gray-200">{val}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* ── News Sentiment (CNBC / Bloomberg / Reuters / WSJ via Finnhub) ── */}
                    <NewsSentimentPanel
                      ticker={sig.ticker}
                      articles={tickerNews[sig.ticker] ?? []}
                      isLoading={newsLoading[sig.ticker] ?? false}
                      hasKey={!!apiKeys.finnhub}
                      onFetch={() => fetchNewsForTicker(sig.ticker)}
                    />

                    {/* ── Tax note (based on purchase date + user preferences) ── */}
                    <TaxNote
                      purchaseDate={holding?.purchaseDate}
                      userPreferences={userPreferences}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Signal Detail Modal ── */}
      {modalTicker && (() => {
        const modSig = signals.find((s) => s.ticker === modalTicker);
        if (!modSig) return null;
        return (
          <SignalDetailModal
            sig={modSig}
            ind={indicators[modalTicker]}
            fund={fundData[modalTicker]}
            insider={insiderData[modalTicker]}
            earnings={earningsData[modalTicker]}
            onClose={() => setModalTicker(null)}
          />
        );
      })()}
    </div>
  );
}
