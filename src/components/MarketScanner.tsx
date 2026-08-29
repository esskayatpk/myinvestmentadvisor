/**
 * Market Scanner
 * Runs the same 5-pillar TA framework used for portfolio signals across a
 * configurable universe of stocks and ETFs, surfacing the strongest setups.
 */

import { useState, useEffect, useRef } from 'react';
import {
  ScanLine, Play, Square, TrendingUp, TrendingDown, Minus,
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle,
  RotateCcw, Plus, Trash2, ArrowUpCircle, ArrowDownCircle, MinusCircle, Eye,
  Shield, BookMarked,
} from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { fetchPriceHistory, tickerNames } from '../lib/marketData';
import { fetchEarningsInfo } from '../lib/fundamentals';
import { MACRO_VALUATION, REGIME_CFG } from '../lib/macroContext';
import { computeIndicators, scoreIndicators } from '../lib/technicalAnalysis';
import {
  getCurrentSession, SESSION_COLOR_MAP, getSetupQuality, detectSetupType, SETUP_QUALITY_CONFIG,
  type SessionStatus,
} from '../lib/tradingSession';
import type { TechnicalIndicators, PreTradeChecklist, SignalAction, PriceBar } from '../types';

// ─── Default scan universe ────────────────────────────────────────────────────

export const SCAN_SECTORS: Array<{ sector: string; tickers: string[] }> = [
  {
    sector: 'Technology',
    tickers: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC', 'QCOM', 'ADBE', 'CRM', 'ORCL', 'CSCO', 'AVGO'],
  },
  {
    sector: 'Financials',
    tickers: ['JPM', 'BAC', 'GS', 'MS', 'V', 'MA', 'WFC', 'C', 'BLK', 'AXP'],
  },
  {
    sector: 'Healthcare',
    tickers: ['JNJ', 'UNH', 'LLY', 'PFE', 'ABBV', 'MRK', 'TMO', 'ABT', 'MDT', 'AMGN'],
  },
  {
    sector: 'Consumer',
    tickers: ['PG', 'KO', 'PEP', 'WMT', 'COST', 'HD', 'MCD', 'NKE', 'SBUX', 'TGT'],
  },
  {
    sector: 'Energy',
    tickers: ['XOM', 'CVX', 'COP', 'SLB', 'EOG'],
  },
  {
    sector: 'Industrials',
    tickers: ['BA', 'CAT', 'GE', 'HON', 'UPS', 'DE'],
  },
  {
    sector: 'ETFs / Index',
    tickers: ['SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'TLT', 'XLK', 'XLF', 'XLE', 'XLV'],
  },
];

// full universe built dynamically from active sectors

// ─── Market context helpers ───────────────────────────────────────────────────

/** Sector name → benchmark ETF used for market-context trend check. */
const SECTOR_ETF: Record<string, string> = {
  Technology:      'XLK',
  Financials:      'XLF',
  Healthcare:      'XLV',
  Consumer:        'XLY',
  Energy:          'XLE',
  Industrials:     'XLI',
  'ETFs / Index':  'SPY',
};

/** Reverse map: ticker → sector (for tickers in the default universe). */
const TICKER_SECTOR: Record<string, string> = Object.fromEntries(
  SCAN_SECTORS.flatMap(({ sector, tickers }) => tickers.map(t => [t, sector]))
);

/** Simple price-vs-SMA trend direction for context ETFs. */
function calcTrend(bars: PriceBar[]): 'up' | 'down' | 'sideways' {
  if (bars.length < 50) return 'sideways';
  const closes = bars.map(b => b.close);
  const price  = closes[closes.length - 1]!;
  const sma50  = closes.slice(-50).reduce((a, b) => a + b, 0) / 50;
  const n200   = Math.min(200, closes.length);
  const sma200 = closes.slice(-n200).reduce((a, b) => a + b, 0) / n200;
  if (price > sma50 && sma50 > sma200 * 0.99) return 'up';
  if (price < sma50 && sma50 < sma200 * 1.01) return 'down';
  return 'sideways';
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanResult {
  ticker: string;
  companyName?: string;
  action: SignalAction;
  confidence: number;
  reasons: string[];
  trendDirection?: 'uptrend' | 'downtrend' | 'sideways';
  stopLoss?: number;
  targetPrice?: number;
  riskRewardRatio?: number;
  preTradeChecklist?: PreTradeChecklist;
  ind?: TechnicalIndicators;
  price?: number;
  changePercent?: number;
  scannedAt: number;
  marketContext?: {
    spyTrend: 'up' | 'down' | 'sideways';
    sectorTrend: 'up' | 'down' | 'sideways';
    sectorEtf: string;
    originalAction?: SignalAction;  // action before context demotion
  };
}

// ─── Action config (mirrors BuySellSignals) ───────────────────────────────────

const ACTION_CFG: Record<SignalAction, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  rowCls: string;
  badgeCls: string;
  order: number;
}> = {
  STRONG_BUY:  { label: 'Strong Buy',  icon: ArrowUpCircle,   rowCls: 'bg-emerald-950/40 border-l-2 border-emerald-600', badgeCls: 'bg-emerald-800 text-emerald-200 border-emerald-600', order: 1 },
  BUY:         { label: 'Buy',         icon: ArrowUpCircle,   rowCls: 'bg-green-950/20',  badgeCls: 'bg-green-900 text-green-300 border-green-700',    order: 2 },
  WATCH:       { label: 'Watch',       icon: Eye,             rowCls: 'bg-indigo-950/20', badgeCls: 'bg-indigo-900 text-indigo-300 border-indigo-700', order: 3 },
  HOLD:        { label: 'Hold',        icon: MinusCircle,     rowCls: '',                 badgeCls: 'bg-gray-800 text-gray-400 border-gray-600',         order: 4 },
  SELL:        { label: 'Sell',        icon: ArrowDownCircle, rowCls: 'bg-orange-950/20', badgeCls: 'bg-orange-900 text-orange-300 border-orange-700',   order: 5 },
  STRONG_SELL: { label: 'Strong Sell', icon: XCircle,         rowCls: 'bg-red-950/40 border-l-2 border-red-600', badgeCls: 'bg-red-900 text-red-300 border-red-700', order: 6 },
};

const ACTION_ORDER = { STRONG_BUY: 1, BUY: 2, WATCH: 3, HOLD: 4, SELL: 5, STRONG_SELL: 6 } as const;

const CHECKLIST_LABELS: Record<keyof Omit<PreTradeChecklist, 'checksPassed'>, string> = {
  trendStrong:     'Trend Strong',
  priceAboveEma21: 'Price > EMA 21',
  volumeHealthy:   'Volume Healthy',
  supportNearby:   'Support Nearby',
  riskRewardGood:  'R:R ≥ 1:2',
  structureIntact: 'Structure Intact',
  stopLossDefined: 'Stop-Loss Defined',
};

// ─── Helper: build Signal action from score + checklist ───────────────────────

function actionFromScore(score: number, checksPassed: number, trendDown: boolean): SignalAction {
  // "Never fight the trend" — no new longs in a confirmed downtrend
  if (trendDown && score > 5) return score >= 20 ? 'WATCH' : 'HOLD';

  const raw: SignalAction =
    score >= 50 ? 'STRONG_BUY'
    : score >= 20 ? 'BUY'
    : score >= 5  ? 'WATCH'
    : score <= -50 ? 'STRONG_SELL'
    : score <= -20 ? 'SELL'
    : 'HOLD';
  if (checksPassed <= 3) return 'HOLD';
  if (raw === 'WATCH' && checksPassed < 4) return 'HOLD';
  // All 7 checklist items must pass for STRONG_BUY (No Checklist, No Trade)
  if (checksPassed <= 6) {
    if (raw === 'STRONG_BUY') return 'BUY';
    if (raw === 'STRONG_SELL') return 'SELL';
  }
  return raw;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 65 ? 'bg-emerald-500' : value >= 40 ? 'bg-yellow-500' : 'bg-gray-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full`} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-400">{value}%</span>
    </div>
  );
}

function ScanResultDetail({ result, riskPerTrade }: { result: ScanResult; riskPerTrade: number }) {
  const { ind, preTradeChecklist, reasons, stopLoss, targetPrice, riskRewardRatio, action, price, ticker, companyName } = result;

  const { userPreferences, apiKeys } = useInvestmentStore();
  const { taxBracket, taxCountry } = userPreferences;

  // Earnings risk check (Gap 5)
  const [earningsWarning, setEarningsWarning] = useState<{ date: string; daysAway: number } | null>(null);
  useEffect(() => {
    setEarningsWarning(null);
    if (!apiKeys.finnhub) return;
    fetchEarningsInfo(ticker, apiKeys.finnhub).then(info => {
      if (info?.daysAway != null && info.daysAway >= 0 && info.daysAway <= 14) {
        setEarningsWarning({ date: info.nextDate!, daysAway: info.daysAway });
      }
    });
  }, [ticker]); // eslint-disable-line react-hooks/exhaustive-deps

  const clKeys = Object.keys(CHECKLIST_LABELS) as Array<keyof typeof CHECKLIST_LABELS>;

  // Position sizing
  const atr = ind?.atr14 ?? 0;
  const currentPrice = price ?? 0;
  const positionSizing = (atr > 0 && currentPrice > 0) ? (() => {
    const stopDist   = atr * 1.5;
    const targetDist = atr * 3;
    const minShares  = Math.max(1, Math.ceil(riskPerTrade / stopDist));
    const sizeMult   = action === 'STRONG_BUY' ? 1.0 : action === 'BUY' ? 0.75 : action === 'WATCH' ? 0.25 : 0;
    const suggested  = Math.round(minShares * sizeMult);
    return {
      minShares,
      minInvestment: minShares * currentPrice,
      suggestedShares: suggested,
      suggestedInvestment: suggested * currentPrice,
      potentialReward: minShares * targetDist,
      stopPrice: currentPrice - stopDist,
      targetPriceCalc: currentPrice + targetDist,
    };
  })() : null;

  return (
    <div className="border-t border-gray-800 bg-gray-950/50 px-5 py-4 space-y-4">

      {/* Company name */}
      {companyName && (
        <div className="flex items-baseline gap-2 pb-1 border-b border-gray-800/60">
          <span className="text-white font-semibold text-base">{companyName}</span>
          <span className="text-gray-500 text-xs font-mono">{ticker}</span>
        </div>
      )}

      {/* Market headwind (Gap 2) */}
      {result.marketContext?.originalAction && (
        <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-lg px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Market headwind — demoted from {ACTION_CFG[result.marketContext.originalAction].label}:</strong>
            {' '}
            {[
              result.marketContext.spyTrend === 'down' && 'SPY in downtrend',
              result.marketContext.sectorTrend === 'down' && `${result.marketContext.sectorEtf} sector ETF in downtrend`,
            ].filter(Boolean).join(' + ')}.
            Consider reduced position size or wait for sector recovery.
          </span>
        </div>
      )}

      {/* Earnings risk (Gap 5) */}
      {earningsWarning && (
        <div className="flex items-start gap-2 bg-red-950/30 border border-red-800 rounded-lg px-3 py-2 text-xs text-red-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-400" />
          <span>
            <strong>⚠️ Earnings in {earningsWarning.daysAway}d ({earningsWarning.date})</strong>
            {' '}— high overnight gap risk. Wait for post-report clarity, or cap position at ≤50% normal size.
          </span>
        </div>
      )}

      {/* Checklist */}
      {preTradeChecklist && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Pre-Trade Checklist</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {clKeys.map((key) => {
              const passed = preTradeChecklist[key];
              return (
                <div key={key} className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${
                  passed ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/30 text-red-400'
                }`}>
                  {passed
                    ? <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-500" />
                    : <XCircle className="w-3 h-3 shrink-0 text-red-500" />
                  }
                  {CHECKLIST_LABELS[key]}
                </div>
              );
            })}
          </div>
          {preTradeChecklist.checksPassed <= 3 && (
            <p className="text-xs text-amber-400 mt-2 italic">
              ≤ 3/6 checks — checklist gate forced signal to HOLD.
            </p>
          )}
        </div>
      )}

      {/* Position sizing */}
      {positionSizing && action !== 'HOLD' && action !== 'SELL' && action !== 'STRONG_SELL' && (
        <div className="bg-gray-900/60 border border-gray-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide flex items-center gap-2">
              <span>💰</span> Position Sizing
            </span>
            <span className="text-xs text-gray-600">${riskPerTrade.toLocaleString()} risk/trade · 1.5× ATR stop</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div className="bg-gray-800/60 rounded-lg p-2.5">
              <div className="text-xs text-gray-500">Min Shares</div>
              <div className="text-sm font-bold text-gray-200">{positionSizing.minShares.toLocaleString()}</div>
            </div>
            <div className="bg-gray-800/60 rounded-lg p-2.5">
              <div className="text-xs text-gray-500">Min Investment</div>
              <div className="text-sm font-bold text-white">
                ${positionSizing.minInvestment >= 1000
                  ? `${(positionSizing.minInvestment / 1000).toFixed(1)}K`
                  : positionSizing.minInvestment.toFixed(0)}
              </div>
            </div>
            <div className="bg-red-950/30 rounded-lg p-2.5">
              <div className="text-xs text-gray-500">Max Risk</div>
              <div className="text-sm font-bold text-red-400">${riskPerTrade.toLocaleString()}</div>
              <div className="text-xs text-gray-600">stop @ ${positionSizing.stopPrice.toFixed(2)}</div>
            </div>
            <div className="bg-emerald-950/20 rounded-lg p-2.5">
              <div className="text-xs text-gray-500">Pot. Reward (3R)</div>
              <div className="text-sm font-bold text-emerald-400">
                ${positionSizing.potentialReward >= 1000
                  ? `${(positionSizing.potentialReward / 1000).toFixed(1)}K`
                  : positionSizing.potentialReward.toFixed(0)}
              </div>
              <div className="text-[10px] text-gray-600 mt-0.5">
                target @ ${positionSizing.targetPriceCalc.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Trade scenario explanation */}
          <div className="text-xs bg-gray-800/40 border border-gray-700/50 rounded-lg px-3 py-2.5 space-y-1.5">
            <p className="text-gray-400 font-semibold">
              Example with {positionSizing.minShares.toLocaleString()} shares (minimum size to risk ${riskPerTrade.toLocaleString()}):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-600">📥 Enter</span>
                <span className="text-gray-300 font-mono">${currentPrice.toFixed(2)} × {positionSizing.minShares.toLocaleString()} shares</span>
                <span className="text-gray-600">
                  = ${positionSizing.minInvestment >= 1000
                    ? `${(positionSizing.minInvestment / 1000).toFixed(1)}K`
                    : positionSizing.minInvestment.toFixed(0)} invested
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-600">🛑 Stop</span>
                <span className="text-red-400 font-mono">${positionSizing.stopPrice.toFixed(2)}</span>
                <span className="text-gray-600">→ max loss <span className="text-red-400 font-semibold">−${riskPerTrade.toLocaleString()}</span></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-600">🎯 Target</span>
                <span className="text-emerald-400 font-mono">${positionSizing.targetPriceCalc.toFixed(2)}</span>
                <span className="text-gray-600">→ gain <span className="text-emerald-400 font-semibold">
                  +${positionSizing.potentialReward >= 1000
                    ? `${(positionSizing.potentialReward / 1000).toFixed(1)}K`
                    : positionSizing.potentialReward.toFixed(0)}
                </span></span>
              </div>
            </div>
            <p className="text-[11px] text-gray-600 pt-0.5">
              Stop and target are set at <strong className="text-gray-500">1.5× and 3× the 14-day ATR</strong> (${(atr).toFixed(2)} avg daily range) from entry.
              ATR-based targets typically take <strong className="text-gray-500">days to a few weeks</strong> to reach in a trending setup — there is no time guarantee.
            </p>
          </div>

          {/* Tax impact on potential gain */}
          {(() => {
            const gross = positionSizing.potentialReward;
            const stRatePct = parseFloat(taxBracket);
            const stRate    = stRatePct / 100;

            // Long-term rates
            let ltRate = 0;
            let ltLabel = '';
            let ltNote  = '';
            if (taxCountry === 'US') {
              ltRate  = ['10%','12%'].includes(taxBracket) ? 0 : ['22%','24%','32%'].includes(taxBracket) ? 0.15 : 0.20;
              ltLabel = `${Math.round(ltRate * 100)}% US long-term (≥1 yr)`;
              ltNote  = ltRate === 0 ? '🎉 Your bracket qualifies for 0% long-term CGT — hold >1 yr and keep the entire gain tax-free.' : '';
            } else if (taxCountry === 'UK') {
              ltRate  = stRatePct <= 20 ? 0.18 : 0.24;
              ltLabel = `${Math.round(ltRate * 100)}% UK CGT`;
              ltNote  = 'UK has a £3,000 annual CGT allowance — gains within that threshold are tax-free regardless of hold period.';
            } else if (taxCountry === 'AU') {
              ltRate  = stRate * 0.5;
              ltLabel = `${Math.round(ltRate * 100)}% effective AU (≥1 yr, 50% discount)`;
              ltNote  = 'AU 50% CGT discount applies to assets held >1 yr, halving the taxable gain.';
            } else {
              ltRate  = stRate;
              ltLabel = 'N/A (set your country in Settings → Preferences)';
            }

            const stTax = gross * stRate;
            const ltTax = gross * ltRate;
            const fmt = (v: number) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v.toFixed(0)}`;

            return (
              <div className="border border-gray-700/60 rounded-xl overflow-hidden text-xs">
                <div className="flex items-center justify-between bg-gray-800/50 px-3 py-2">
                  <span className="font-semibold text-gray-300 flex items-center gap-1.5">
                    <span>🧾</span> Tax impact on {fmt(gross)} gain
                  </span>
                  <span className="text-gray-600">gross gain if target hit</span>
                </div>
                <div className="divide-y divide-gray-800">
                  {/* Short-term row */}
                  <div className="grid grid-cols-3 px-3 py-2.5 gap-2 items-center">
                    <div>
                      <div className="text-gray-500 mb-0.5">Short-term (days–weeks)</div>
                      <div className="text-amber-400 font-mono text-[11px]">{taxBracket} ordinary income</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Tax owed</div>
                      <div className="text-red-400 font-semibold">−{fmt(stTax)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-600 mb-0.5">You keep</div>
                      <div className="text-white font-bold">{fmt(gross - stTax)}</div>
                    </div>
                  </div>
                  {/* Long-term row */}
                  <div className={`grid grid-cols-3 px-3 py-2.5 gap-2 items-center ${ltRate === 0 ? 'bg-emerald-950/20' : ''}`}>
                    <div>
                      <div className="text-gray-500 mb-0.5">Long-term (hold ≥1 yr)</div>
                      <div className={`font-mono text-[11px] ${ltRate === 0 ? 'text-emerald-400' : 'text-gray-400'}`}>{ltLabel}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600 mb-0.5">Tax owed</div>
                      <div className={ltRate === 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                        {ltRate === 0 ? '—' : `−${fmt(ltTax)}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-600 mb-0.5">You keep</div>
                      <div className={`font-bold ${ltRate === 0 ? 'text-emerald-300' : 'text-white'}`}>{fmt(gross - ltTax)}</div>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2 bg-gray-900/60 text-[11px] text-gray-500 space-y-0.5">
                  <div>
                    📦 <strong className="text-gray-400">Cost basis ({fmt(positionSizing.minInvestment)} invested)</strong> is always returned to you tax-free — only the <em>gain</em> is taxable.
                  </div>
                  {ltNote && <div className="text-emerald-600">{ltNote}</div>}
                  <div className="text-gray-700">Not tax advice. Based on your settings (Settings → Preferences). Consult a tax professional.</div>
                </div>
              </div>
            );
          })()}
          {positionSizing.suggestedShares > 0 && (
            <div className="flex items-center justify-between text-xs bg-gray-800/50 rounded-lg px-3 py-2">
              <span className="text-gray-400">
                Suggested for <strong className={
                  action === 'STRONG_BUY' ? 'text-emerald-400' : action === 'BUY' ? 'text-green-400' : 'text-indigo-400'
                }>{ACTION_CFG[action].label}</strong>
              </span>
              <span className="font-bold text-gray-200">
                {positionSizing.suggestedShares} shares · ~${positionSizing.suggestedInvestment >= 1000
                  ? `${(positionSizing.suggestedInvestment / 1000).toFixed(1)}K`
                  : positionSizing.suggestedInvestment.toFixed(0)}
              </span>
            </div>
          )}
          {action === 'WATCH' && (
            <p className="text-xs text-indigo-400 italic">
              Watch signal — consider a small starter position or wait for score to reach BUY threshold before adding full size.
            </p>
          )}
        </div>
      )}

      {/* Price levels */}
      {(stopLoss || targetPrice) && (
        <div className="grid grid-cols-3 gap-3">
          {stopLoss && (
            <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Stop-Loss (1.5× ATR)</div>
              <div className="text-red-400 font-bold text-sm">${stopLoss.toFixed(2)}</div>
            </div>
          )}
          {targetPrice && (
            <div className="bg-emerald-900/20 border border-emerald-800 rounded-lg p-3">
              <div className="text-xs text-gray-500">Target (3× ATR)</div>
              <div className="text-emerald-400 font-bold text-sm">${targetPrice.toFixed(2)}</div>
            </div>
          )}
          {riskRewardRatio !== undefined && (
            <div className={`border rounded-lg p-3 ${riskRewardRatio >= 3 ? 'bg-emerald-900/20 border-emerald-700' : riskRewardRatio >= 2 ? 'bg-yellow-900/20 border-yellow-700' : 'bg-red-900/20 border-red-700'}`}>
              <div className="text-xs text-gray-500">Risk : Reward</div>
              <div className={`font-bold text-sm ${riskRewardRatio >= 3 ? 'text-emerald-400' : riskRewardRatio >= 2 ? 'text-yellow-400' : 'text-red-400'}`}>
                1 : {riskRewardRatio.toFixed(1)}{riskRewardRatio >= 3 ? ' ✓' : riskRewardRatio < 2 ? ' ✗' : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analysis reasons */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Analysis Breakdown</p>
        <ul className="space-y-1.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-300 bg-gray-900/40 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-brand-500 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Indicators snapshot */}
      {ind && (
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-semibold">Technical Indicators</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 text-center">
            {[
              { label: 'RSI 14',  val: ind.rsi14.toFixed(1),              note: ind.rsi14 > 70 ? '⚠ OB' : ind.rsi14 < 30 ? '⚠ OS' : '' },
              { label: 'EMA 21',  val: `$${ind.ema21.toFixed(2)}`,        note: '' },
              { label: 'SMA 50',  val: `$${ind.sma50.toFixed(2)}`,        note: '' },
              { label: 'SMA 200', val: `$${ind.sma200.toFixed(2)}`,       note: '' },
              { label: 'ATR 14',  val: `$${ind.atr14.toFixed(2)}`,        note: '' },
              { label: 'BB Width',val: `${ind.bollingerBands.bandwidth.toFixed(1)}%`, note: '' },
              { label: 'MACD',    val: ind.macd.histogram > 0 ? '▲ Bull' : '▼ Bear', note: '' },
            ].map(({ label, val, note }) => (
              <div key={label} className="bg-gray-800/60 rounded-lg p-2">
                <div className="text-[10px] text-gray-500">{label}</div>
                <div className="text-xs font-bold text-gray-200">{val}</div>
                {note && <div className="text-[10px] text-amber-400">{note}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MarketScanner() {
  const { apiKeys, userPreferences, setActiveTab } = useInvestmentStore();

  // Live trading session (auto-refresh every 30s)
  const [session, setSession] = useState<SessionStatus>(getCurrentSession);
  useEffect(() => {
    const tick = () => setSession(getCurrentSession());
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  // Universe state — initialized from defaults, user-editable
  const [activeSectors, setActiveSectors] = useState<Set<string>>(
    new Set(SCAN_SECTORS.map((s) => s.sector)),
  );
  const [customTickers, setCustomTickers] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');

  // Scan state
  const [scanning, setScanning]     = useState(false);
  const [progress, setProgress]     = useState({ done: 0, total: 0 });
  const [results,  setResults]      = useState<ScanResult[]>([]);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
  const abortRef = useRef(false);

  // UI state
  const [filterAction, setFilterAction] = useState<'ALL' | SignalAction | 'BUY_ALL' | 'SELL_ALL'>('ALL');
  const [sortBy, setSortBy]             = useState<'action' | 'confidence' | 'ticker'>('action');
  const [expanded,  setExpanded]        = useState<string | null>(null);

  // Derived universe
  const universe = [
    ...SCAN_SECTORS.filter((s) => activeSectors.has(s.sector)).flatMap((s) => s.tickers),
    ...customTickers,
  ];

  // ── Scan runner ──

  async function runScan() {
    if (scanning) {
      abortRef.current = true;
      return;
    }

    abortRef.current = false;
    setScanning(true);
    setResults([]);
    setExpanded(null);
    setProgress({ done: 0, total: universe.length });

    // ── Pre-fetch market context (SPY + active sector ETFs) ─────────────────
    const etfsToFetch = ['SPY', ...[...activeSectors]
      .map(s => SECTOR_ETF[s])
      .filter((e): e is string => !!e && e !== 'SPY'),
    ];
    const etfBars: Record<string, PriceBar[]> = {};
    await Promise.all([...new Set(etfsToFetch)].map(async (etf) => {
      etfBars[etf] = await fetchPriceHistory(etf, '1y', '1d');
    }));
    const spyTrend = calcTrend(etfBars['SPY'] ?? []);
    const etfTrends: Record<string, 'up' | 'down' | 'sideways'> = {};
    for (const [etf, bars] of Object.entries(etfBars)) {
      etfTrends[etf] = calcTrend(bars);
    }
    // ────────────────────────────────────────────────────────────────────────

    const BATCH = 5;
    const accumulated: ScanResult[] = [];

    for (let i = 0; i < universe.length; i += BATCH) {
      if (abortRef.current) break;

      const batch = universe.slice(i, i + BATCH);
      const batchResults = await Promise.all(
        batch.map(async (ticker): Promise<ScanResult | null> => {
          try {
            const bars = await fetchPriceHistory(ticker, '1y', '1d');
            if (bars.length < 60) return null;

            const ind     = computeIndicators(ticker, bars);
            const scored  = scoreIndicators(ind);
            const { score, reasons, trendDirection, stopLoss, targetPrice, riskRewardRatio, preTradeChecklist } = scored;
            const rawAction = actionFromScore(score, preTradeChecklist.checksPassed, trendDirection === 'downtrend');

            // Apply market context demotion (Gap 2)
            const sectorEtf   = SECTOR_ETF[TICKER_SECTOR[ticker] ?? ''] ?? 'SPY';
            const sectorTrend = etfTrends[sectorEtf] ?? spyTrend;
            const headwinds   = (spyTrend === 'down' ? 1 : 0) + (sectorTrend === 'down' ? 1 : 0);
            let action = rawAction;
            if (headwinds >= 2) {
              if (rawAction === 'STRONG_BUY') action = 'WATCH';
              else if (rawAction === 'BUY')   action = 'HOLD';
              else if (rawAction === 'WATCH') action = 'HOLD';
            } else if (headwinds === 1) {
              if (rawAction === 'STRONG_BUY') action = 'BUY';
              else if (rawAction === 'BUY')   action = 'WATCH';
            }
            const price   = bars[bars.length - 1]?.close;
            const prevPrice = bars.length >= 2 ? bars[bars.length - 2]?.close : undefined;
            const changePercent = price != null && prevPrice != null && prevPrice !== 0
              ? ((price - prevPrice) / prevPrice) * 100
              : undefined;

            return {
              ticker, action,
              companyName: tickerNames.get(ticker),
              confidence: Math.abs(score),
              reasons, trendDirection,
              stopLoss, targetPrice, riskRewardRatio,
              preTradeChecklist,
              ind, price, changePercent,
              scannedAt: Date.now(),
              marketContext: {
                spyTrend,
                sectorTrend,
                sectorEtf,
                originalAction: action !== rawAction ? rawAction : undefined,
              },
            };
          } catch {
            return null;
          }
        }),
      );

      const valid = batchResults.filter((r): r is ScanResult => r !== null);
      accumulated.push(...valid);

      // Live-update results sorted by action strength
      setResults([...accumulated].sort((a, b) => {
        if (sortBy === 'action')      return (ACTION_ORDER[a.action] ?? 99) - (ACTION_ORDER[b.action] ?? 99) || b.confidence - a.confidence;
        if (sortBy === 'confidence')  return b.confidence - a.confidence;
        return a.ticker.localeCompare(b.ticker);
      }));

      setProgress({ done: Math.min(i + BATCH, universe.length), total: universe.length });

      if (i + BATCH < universe.length) {
        await new Promise<void>((res) => setTimeout(res, 350));
      }
    }

    setLastScanAt(new Date());
    setScanning(false);
  }

  // ── Filter + sort ──

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'action')     return (ACTION_ORDER[a.action] ?? 99) - (ACTION_ORDER[b.action] ?? 99) || b.confidence - a.confidence;
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    return a.ticker.localeCompare(b.ticker);
  });

  const filtered = filterAction === 'ALL'     ? sorted
    : filterAction === 'BUY_ALL'  ? sorted.filter((r) => r.action === 'BUY' || r.action === 'STRONG_BUY')
    : filterAction === 'SELL_ALL' ? sorted.filter((r) => r.action === 'SELL' || r.action === 'STRONG_SELL')
    : sorted.filter((r) => r.action === filterAction);

  const counts = {
    STRONG_BUY:  results.filter((r) => r.action === 'STRONG_BUY').length,
    BUY:         results.filter((r) => r.action === 'BUY').length,
    WATCH:       results.filter((r) => r.action === 'WATCH').length,
    HOLD:        results.filter((r) => r.action === 'HOLD').length,
    SELL:        results.filter((r) => r.action === 'SELL').length,
    STRONG_SELL: results.filter((r) => r.action === 'STRONG_SELL').length,
  };

  const progressPct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0;

  // ── Render ──

  const sc = SESSION_COLOR_MAP[session.session.colorKey];

  return (
    <div className="space-y-6">

      {/* ── Trading Session Banner (Playbook) ── */}
      <div className={`rounded-2xl border p-4 ${sc.bg} ${sc.border}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xl">{session.session.emoji}</span>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`font-bold text-sm ${sc.text}`}>{session.session.label}</span>
                {session.session.canTrade
                  ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-900 text-emerald-300 border border-emerald-700">TRADE WINDOW</span>
                  : <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">STAND DOWN</span>
                }
                <span className="text-[10px] text-gray-600">{session.session.description} · ET {session.etTime}</span>
              </div>
              <p className={`text-xs mt-0.5 ${sc.text} opacity-90`}>{session.session.playbookAdvice}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-center">
              <div className={`text-sm font-bold ${session.session.sizeMultiplier === 1 ? 'text-emerald-400' : session.session.sizeMultiplier === 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                {session.session.sizeMultiplier === 0 ? 'No Trade' : `${Math.round(session.session.sizeMultiplier * 100)}% Size`}
              </div>
              <div className="text-[10px] text-gray-600">Playbook rule</div>
            </div>
            <button
              onClick={() => setActiveTab('playbook')}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-gray-800/80 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <BookMarked className="w-3 h-3" />
              Playbook
            </button>
          </div>
        </div>
        {!session.session.canTrade && session.session.id !== 'overnight' && session.session.id !== 'after_hours' && (
          <div className="mt-3 flex items-center gap-2 bg-orange-950/40 border border-orange-900 rounded-lg px-3 py-1.5 text-xs text-orange-300">
            <Shield className="w-3 h-3 shrink-0" />
            Playbook Rule: Reduce position size by 50% or stop trading during this window. Avoid boredom trades.
          </div>
        )}
      </div>

      {/* Header */}
      <div>
        <h2 className="text-white font-bold text-lg flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-brand-400" />
          Market Scanner
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          Applies the same 5-pillar TA framework (Trend · Location · Volume · R:R · Structure)
          to a configurable universe of stocks and ETFs to surface the strongest setups.
          First scan fetches price history (~30–60s). Subsequent scans are instant from cache.
        </p>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-xl p-3 text-amber-200 text-xs">
        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
        <span>
          Scanner results are based purely on <strong>technical analysis of historical price data</strong>.
          They do not account for fundamentals, earnings, insider activity, or macroeconomic conditions.
          This is <strong>not investment advice</strong> — always do your own research.
        </span>
      </div>

      {/* Universe selector */}
      <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-gray-300 font-semibold text-sm">
            Scan Universe
            <span className="ml-2 text-xs text-gray-500 font-normal">{universe.length} tickers selected</span>
          </h3>
          <button
            onClick={() => setActiveSectors(new Set(SCAN_SECTORS.map((s) => s.sector)))}
            className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset all
          </button>
        </div>

        {/* Sector toggles */}
        <div className="flex flex-wrap gap-2">
          {SCAN_SECTORS.map(({ sector, tickers }) => {
            const active = activeSectors.has(sector);
            return (
              <button
                key={sector}
                onClick={() => {
                  const next = new Set(activeSectors);
                  if (active) next.delete(sector); else next.add(sector);
                  setActiveSectors(next);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all ${
                  active
                    ? 'border-brand-600 text-brand-300 bg-brand-950/30'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >
                {active ? <CheckCircle2 className="w-3 h-3" /> : <div className="w-3 h-3 rounded-full border border-current opacity-50" />}
                {sector}
                <span className="opacity-60">({tickers.length})</span>
              </button>
            );
          })}
        </div>

        {/* Custom tickers */}
        <div>
          <p className="text-xs text-gray-500 mb-2">Custom tickers</p>
          <div className="flex gap-2 flex-wrap items-center">
            {customTickers.map((t) => (
              <span key={t} className="flex items-center gap-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-1 rounded-lg">
                {t}
                <button onClick={() => setCustomTickers((prev) => prev.filter((x) => x !== t))}>
                  <XCircle className="w-3 h-3 text-gray-500 hover:text-red-400" />
                </button>
              </span>
            ))}
            <form
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                const val = customInput.trim().toUpperCase();
                if (val && !universe.includes(val)) {
                  setCustomTickers((prev) => [...prev, val]);
                }
                setCustomInput('');
              }}
            >
              <input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value.toUpperCase())}
                placeholder="Add ticker…"
                maxLength={8}
                className="w-28 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white font-mono placeholder:text-gray-600 focus:border-brand-500 focus:outline-none"
              />
              <button type="submit" className="p-1 rounded-lg bg-gray-800 border border-gray-700 hover:border-brand-600 text-gray-400 hover:text-brand-300 transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Scan controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          onClick={runScan}
          disabled={universe.length === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all
            disabled:opacity-40 disabled:cursor-not-allowed ${
            scanning
              ? 'bg-red-900 border border-red-700 text-red-300 hover:bg-red-800'
              : 'bg-brand-600 hover:bg-brand-500 text-white'
          }`}
        >
          {scanning
            ? <><Square className="w-4 h-4" /> Stop Scan</>
            : <><Play className="w-4 h-4" /> {results.length > 0 ? 'Re-scan' : 'Run Scan'}</>
          }
        </button>

        {scanning && (
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Scanning {progress.done} / {progress.total}</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {!scanning && lastScanAt && (
          <p className="text-xs text-gray-500">
            Last scan: {lastScanAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {' · '}{results.length} tickers scanned
          </p>
        )}
      </div>

      {/* ── Macro Valuation Warning ── */}
      {results.length > 0 && (() => {
        const cfg   = REGIME_CFG[MACRO_VALUATION.regime];
        const isHigh = MACRO_VALUATION.regime === 'HIGH' || MACRO_VALUATION.regime === 'EXTREME';
        if (!isHigh) return null;
        return (
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${cfg.badgeCls}`}>
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-semibold text-sm">Macro Valuation: {cfg.label}</span>
                <span className="text-xs opacity-80">Shiller CAPE ~{MACRO_VALUATION.shillerCAPE} · S&amp;P TTM P/E ~{MACRO_VALUATION.trailingPE} · as of {MACRO_VALUATION.asOf}</span>
              </div>
              <p className="text-xs opacity-80">
                {MACRO_VALUATION.historicalContext}
              </p>
              <p className="text-xs opacity-70">
                <strong>Implication:</strong> {MACRO_VALUATION.implication}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                {MACRO_VALUATION.precedents.map(p => (
                  <span key={p.year} className="text-xs bg-black/20 rounded px-2 py-0.5">
                    {p.year}: CAPE {p.capeAtPeak} → {p.drawdown} ({p.outcome.split(';')[0]})
                  </span>
                ))}
                <a href={MACRO_VALUATION.sourceUrl} target="_blank" rel="noopener noreferrer"
                   className="text-xs underline opacity-60 hover:opacity-100">Live CAPE →</a>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">

          {/* Action summary tiles */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {(Object.keys(ACTION_CFG) as SignalAction[]).map((action) => {
              const cfg = ACTION_CFG[action];
              const Icon = cfg.icon;
              const active = filterAction === action || (filterAction === 'BUY_ALL' && (action === 'BUY' || action === 'STRONG_BUY'));
              return (
                <button
                  key={action}
                  onClick={() => setFilterAction(filterAction === action ? 'ALL' : action)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border transition-all ${
                    active
                      ? `${cfg.badgeCls} scale-105 shadow-lg`
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

          {/* Buy filter quick action */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Quick filter:</span>
            <button
              onClick={() => setFilterAction(filterAction === 'BUY_ALL' ? 'ALL' : 'BUY_ALL')}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                filterAction === 'BUY_ALL'
                  ? 'border-emerald-600 bg-emerald-900/30 text-emerald-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              ↑ Buy opportunities ({counts.BUY + counts.STRONG_BUY})
            </button>
            <button
              onClick={() => setFilterAction(filterAction === 'WATCH' ? 'ALL' : 'WATCH')}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                filterAction === 'WATCH'
                  ? 'border-indigo-600 bg-indigo-900/30 text-indigo-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              👁 Watch list ({counts.WATCH})
            </button>
            <button
              onClick={() => setFilterAction(filterAction === 'SELL_ALL' ? 'ALL' : 'SELL_ALL')}
              className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                filterAction === 'SELL_ALL'
                  ? 'border-red-600 bg-red-900/30 text-red-300'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              ↓ Avoid / Short ({counts.SELL + counts.STRONG_SELL})
            </button>
            {filterAction !== 'ALL' && (
              <button onClick={() => setFilterAction('ALL')} className="text-xs text-gray-600 hover:text-gray-400 flex items-center gap-1">
                <Trash2 className="w-3 h-3" /> Clear
              </button>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Sort:</span>
              {(['action', 'confidence', 'ticker'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  className={`text-xs px-2 py-0.5 rounded capitalize transition-colors ${
                    sortBy === s ? 'bg-brand-700 text-white' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Results list */}
          <div className="space-y-1.5">
            {filtered.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No results match the current filter
              </div>
            )}

            {filtered.map((result) => {
              const cfg = ACTION_CFG[result.action];
              const Icon = cfg.icon;
              const isExpanded = expanded === result.ticker;
              const topReason = result.reasons[0] ?? '';

              return (
                <div
                  key={result.ticker}
                  className={`rounded-xl border border-gray-800 overflow-hidden ${cfg.rowCls}`}
                >
                  {/* Row */}
                  <div
                    role="button"
                    tabIndex={0}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors cursor-pointer"
                    onClick={() => setExpanded(isExpanded ? null : result.ticker)}
                    onKeyDown={(e) => e.key === 'Enter' && setExpanded(isExpanded ? null : result.ticker)}
                  >
                    {/* Action icon */}
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${
                      result.action.includes('BUY')  ? 'text-emerald-400'
                      : result.action.includes('SELL') ? 'text-red-400'
                      : 'text-gray-500'
                    }`} />

                    {/* Ticker */}
                    <div className="w-16 shrink-0 font-mono font-bold text-white text-sm">{result.ticker}</div>

                    {/* Action badge */}
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded border font-medium ${cfg.badgeCls}`}>
                      {cfg.label}
                    </span>

                    {/* Playbook setup quality + type */}
                    {(() => {
                      const quality = getSetupQuality(result.action, result.confidence, result.preTradeChecklist?.checksPassed ?? 0);
                      const ind = result.ind;
                      const setupType = ind ? detectSetupType({
                        rsi: ind.rsi14,
                        macdHistogram: ind.macd.histogram,
                        priceVsEma21: ind.ema21 > 0 ? ((result.price ?? ind.ema21) - ind.ema21) / ind.ema21 : 0,
                        priceVsSma20: ind.sma20 > 0 ? ((result.price ?? ind.sma20) - ind.sma20) / ind.sma20 : 0,
                        sma20VsSma50: ind.sma50 > 0 ? (ind.sma20 - ind.sma50) / ind.sma50 : 0,
                        atLowerBB: ind.bollingerBands.lower > 0 && (result.price ?? 0) < ind.bollingerBands.lower * 1.02,
                        changePercent: result.changePercent ?? 0,
                        isUptrend: result.trendDirection === 'uptrend',
                      }) : null;
                      return (
                        <>
                          {quality && (
                            <span className={`hidden sm:inline shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border ${SETUP_QUALITY_CONFIG[quality].cls}`}>
                              {SETUP_QUALITY_CONFIG[quality].label}
                            </span>
                          )}
                          {setupType && (quality === 'A+' || quality === 'A') && (
                            <span className="hidden lg:inline shrink-0 text-[10px] text-gray-400 px-1.5 py-0.5 rounded bg-gray-800/60 border border-gray-700/60">
                              {setupType.emoji} {setupType.name}
                            </span>
                          )}
                        </>
                      );
                    })()}

                    {/* Price */}
                    <div className="hidden sm:block flex-1 min-w-0">
                      {result.price != null && (
                        <span className="text-sm text-gray-300">
                          ${result.price.toFixed(2)}
                          {result.changePercent != null && (
                            <span className={`ml-1.5 text-xs ${result.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {result.changePercent >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Confidence */}
                    <div className="hidden md:block shrink-0">
                      <ConfidenceBar value={result.confidence} />
                    </div>

                    {/* Trend badge */}
                    {result.trendDirection && (
                      <div className={`hidden lg:flex items-center gap-1 shrink-0 text-xs px-2 py-0.5 rounded-full border ${
                        result.trendDirection === 'uptrend'   ? 'border-emerald-700 text-emerald-400 bg-emerald-950/30'
                        : result.trendDirection === 'downtrend' ? 'border-red-700 text-red-400 bg-red-950/30'
                        : 'border-gray-700 text-gray-500'
                      }`}>
                        {result.trendDirection === 'uptrend'
                          ? <TrendingUp className="w-3 h-3" />
                          : result.trendDirection === 'downtrend'
                            ? <TrendingDown className="w-3 h-3" />
                            : <Minus className="w-3 h-3" />
                        }
                        {result.trendDirection}
                      </div>
                    )}

                    {/* Market headwind badge */}
                    {result.marketContext?.originalAction && (
                      <span className="hidden lg:inline shrink-0 text-[10px] bg-amber-950/50 text-amber-400 border border-amber-800 rounded px-1.5 py-0.5">
                        ⇓ mkt headwind
                      </span>
                    )}

                    {/* RSI */}
                    {result.ind && (
                      <div className={`hidden xl:block shrink-0 text-xs font-mono ${
                        result.ind.rsi14 > 70 ? 'text-red-400' : result.ind.rsi14 < 30 ? 'text-emerald-400' : 'text-gray-400'
                      }`}>
                        RSI {result.ind.rsi14.toFixed(0)}
                      </div>
                    )}

                    {/* Top reason (truncated) */}
                    <div className="hidden xl:block flex-1 min-w-0">
                      <p className="text-xs text-gray-500 truncate">{topReason}</p>
                    </div>

                    {/* Chevron */}
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-500 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                    }
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && <ScanResultDetail result={result} riskPerTrade={userPreferences.riskPerTrade ?? 500} />}
                </div>
              );
            })}
          </div>

          {/* Scanning in-progress notice */}
          {scanning && filtered.length > 0 && (
            <p className="text-center text-xs text-gray-600 animate-pulse">
              Scan in progress — results update as each batch completes…
            </p>
          )}
        </div>
      )}

      {/* Empty state */}
      {!scanning && results.length === 0 && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-12 text-center space-y-3">
          <ScanLine className="w-10 h-10 text-gray-700 mx-auto" />
          <p className="text-gray-400 font-medium">Ready to scan</p>
          <p className="text-gray-600 text-sm">
            Select sectors above and click <strong>Run Scan</strong> to analyse {universe.length} tickers
            using the 5-pillar TA framework.
          </p>
          {!apiKeys.finnhub && (
            <p className="text-xs text-gray-600 border border-gray-700 rounded-lg px-4 py-2 inline-block mt-2">
              💡 Add a <strong className="text-gray-400">Finnhub API key</strong> in Settings to also see fundamentals
              and insider activity when you expand any result row.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
