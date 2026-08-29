import { useMemo, useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Target, DollarSign, Activity, RefreshCw } from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { fetchQuotes, fetchPriceHistory, fetchHistoryPolygon } from '../lib/marketData';
import { computeIndicators, scoreIndicators } from '../lib/technicalAnalysis';
import { fetchExchangeRates } from '../lib/forex';
import { CURRENCIES } from '../lib/currencies';
import { MACRO_VALUATION, REGIME_CFG } from '../lib/macroContext';
import { useToast } from './Toast';

const PIE_COLORS = [
  '#14b8a6', '#6366f1', '#f59e0b', '#10b981', '#3b82f6',
  '#ec4899', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16',
];

function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatPct(v: number, decimals = 1) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(decimals)}%`;
}

export function PortfolioDashboard() {
  const {
    portfolio, quotes, indicators, signals,
    setQuotes, setIndicators, setSignals,
    setLoading, isLoading, apiKeys,
    setActiveTab, setSignalFilter,
    cloudSync, takeSnapshot, loadSnapshots,
    userPreferences,
  } = useInvestmentStore();
  const toast = useToast();

  // ── Currency conversion ──────────────────────────────────────────────────
  const displayCurrency = userPreferences.displayCurrency ?? 'USD';
  const currencyInfo = CURRENCIES[displayCurrency] ?? CURRENCIES.USD;
  const [fxRate, setFxRate] = useState(1.0);

  useEffect(() => {
    if (displayCurrency === 'USD') { setFxRate(1); return; }
    fetchExchangeRates('USD').then((rates) => {
      setFxRate(rates[displayCurrency] ?? 1);
    });
  }, [displayCurrency]);

  /** Format a USD value in the selected display currency */
  function fmtAmt(usdVal: number): string {
    const v = usdVal * fxRate;
    const s = currencyInfo.symbol;
    const abs = Math.abs(v);
    const dec = currencyInfo.decimals ?? 2;
    if (abs >= 1_000_000) return `${s}${(v / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `${s}${(v / 1_000).toFixed(1)}K`;
    return `${s}${v.toFixed(dec)}`;
  }

  /** Format a P&L value with explicit +/- sign */
  function fmtPnL(usdVal: number): string {
    const v = usdVal * fxRate;
    const s = currencyInfo.symbol;
    const abs = Math.abs(v);
    const sign = v >= 0 ? '+' : '−';
    const dec = currencyInfo.decimals ?? 2;
    if (abs >= 1_000_000) return `${sign}${s}${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000)     return `${sign}${s}${(abs / 1_000).toFixed(1)}K`;
    return `${sign}${s}${abs.toFixed(dec)}`;
  }

  // Load snapshot history on mount and snapshot today if we have data
  useEffect(() => {
    loadSnapshots(180);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { holdings, totalValue, goalValue, cashPosition = 0 } = portfolio;
  const goalProgress = Math.min((totalValue / goalValue) * 100, 100);
  const needed = Math.max(goalValue - totalValue, 0);

  // ── Allocation chart data ────────────────────────────────────────────────

  const allocationData = useMemo(() => {
    const byClass: Record<string, number> = {};
    for (const h of holdings) {
      byClass[h.assetClass] = (byClass[h.assetClass] ?? 0) + h.value;
    }
    if (cashPosition > 0) byClass['cash'] = cashPosition;
    return Object.entries(byClass).map(([name, value]) => ({
      name,
      value,
      pct: ((value / totalValue) * 100).toFixed(1),
    }));
  }, [holdings, cashPosition, totalValue]);

  const categoryData = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const h of holdings) {
      const cat = h.category === 'n/a' ? 'Other' : h.category;
      byCat[cat] = (byCat[cat] ?? 0) + h.value;
    }
    return Object.entries(byCat).map(([name, value]) => ({ name, value }));
  }, [holdings]);

  // ── Fetch quotes ─────────────────────────────────────────────────────────

  const refreshMarketData = async () => {
    if (holdings.length === 0) return;
    setLoading('quotes', true);
    try {
      const tickers = holdings.map((h) => h.ticker);
      const newQuotes = await fetchQuotes(tickers);
      setQuotes({ ...quotes, ...newQuotes });
      // Update each holding's value from latest price, then snapshot
      const updatedHoldings = holdings.map((h) => {
        const q = newQuotes[h.ticker];
        if (q && h.shares) return { ...h, value: q.price * h.shares, price: q.price };
        return h;
      });
      if (updatedHoldings.some((h, i) => h.value !== holdings[i].value)) {
        // recalc is triggered by the store update
      }
      await takeSnapshot();
      toast.success('Market data refreshed');
    } catch {
      toast.error('Failed to fetch quotes');
    } finally {
      setLoading('quotes', false);
    }
  };

  const refreshIndicators = async () => {
    if (holdings.length === 0) return;
    setLoading('indicators', true);
    try {
      const newIndicators: typeof indicators = { ...indicators };
      for (const h of holdings) {
        // Try Yahoo Finance first, then Polygon
        let bars = await fetchPriceHistory(h.ticker);
        if (bars.length < 50 && apiKeys.polygon) {
          bars = await fetchHistoryPolygon(h.ticker, apiKeys.polygon);
        }
        if (bars.length >= 20) {
          newIndicators[h.ticker] = computeIndicators(h.ticker, bars);
        }
      }
      setIndicators(newIndicators);

      // Build signals

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
        const holding = holdings.find((h) => h.ticker === ind.ticker);
        return {
          ticker: ind.ticker,
          name: holding?.name,
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
      toast.success('Technical indicators computed');
    } catch (e) {
      console.error(e);
      toast.error('Failed to compute indicators');
    } finally {
      setLoading('indicators', false);
    }
  };

  // Auto-refresh on mount if holdings exist and no quotes yet
  useEffect(() => {
    if (holdings.length > 0 && Object.keys(quotes).length === 0) {
      refreshMarketData();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Portfolio value with live prices ────────────────────────────────────

  const enrichedHoldings = useMemo(() =>
    holdings.map((h) => {
      const q = quotes[h.ticker];
      return {
        ...h,
        price: q?.price ?? h.price,
        changePercent1d: q?.changePercent ?? h.changePercent1d,
        high52w: q?.high52w ?? h.high52w,
        low52w: q?.low52w ?? h.low52w,
        allocPct: totalValue > 0 ? (h.value / totalValue) * 100 : 0,
      };
    }),
    [holdings, quotes, totalValue]
  );

  // (topGainers kept for potential future use in expanded holdings table)

  /** Daily P&L in USD across the whole portfolio */
  const { dailyPnL, dailyPnLPct } = useMemo(() => {
    const hasQuotes = Object.keys(quotes).length > 0;
    if (!hasQuotes) return { dailyPnL: 0, dailyPnLPct: 0 };

    const pnl = enrichedHoldings.reduce((sum, h) => {
      const pct = h.changePercent1d;
      if (pct === undefined) return sum;
      // Prefer per-share dollar change × shares when available
      const perShareChange = quotes[h.ticker]?.change;
      if (h.shares !== undefined && perShareChange !== undefined) {
        return sum + h.shares * perShareChange;
      }
      // Fall back: derive from current value and today's percent
      return sum + (h.value * pct) / (100 + pct);
    }, 0);

    // Yesterday's total = totalValue − pnl, so pct = pnl / yesterday
    const yesterday = totalValue - pnl;
    const pct = yesterday > 0 ? (pnl / yesterday) * 100 : 0;
    return { dailyPnL: pnl, dailyPnLPct: pct };
  }, [enrichedHoldings, quotes, totalValue]);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Macro Valuation Risk Card ── */}
      {(MACRO_VALUATION.regime === 'HIGH' || MACRO_VALUATION.regime === 'EXTREME') && (
        <div className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${REGIME_CFG[MACRO_VALUATION.regime].badgeCls}`}>
          <span className="text-base mt-0.5 shrink-0">⚠️</span>
          <div className="flex-1">
            <span className="font-semibold">Macro Risk: {REGIME_CFG[MACRO_VALUATION.regime].label} Valuation — </span>
            Shiller CAPE ~{MACRO_VALUATION.shillerCAPE} (as of {MACRO_VALUATION.asOf}). Only 3rd time above 40 in 155 years.
            Prior instances: {MACRO_VALUATION.precedents.map(p => `${p.year} ${p.drawdown}`).join(', ')}.
            {' '}<a href={MACRO_VALUATION.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline opacity-75 hover:opacity-100">Live CAPE →</a>
          </div>
        </div>
      )}

      {/* ── Goal progress card ── */}
      <div className="bg-gradient-to-r from-brand-900/60 to-indigo-900/60 border border-brand-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-brand-300 font-semibold">
            <Target className="w-5 h-5" />
            Goal: {formatCurrency(goalValue)}
          </div>
          <span className="text-sm text-gray-400">
            Need {fmtAmt(needed)} more
          </span>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-4 mb-2">
          <div
            className="bg-gradient-to-r from-brand-500 to-teal-400 h-4 rounded-full transition-all duration-700 relative"
            style={{ width: `${goalProgress}%` }}
          >
            <span className="absolute right-2 top-0 text-xs font-bold text-white leading-4">
              {goalProgress.toFixed(1)}%
            </span>
          </div>
        </div>
        <div className="text-2xl font-bold text-white">{fmtAmt(totalValue)}</div>
        <div className="text-xs text-gray-500 mt-0.5">
          Current portfolio value{displayCurrency !== 'USD' ? ` · ${displayCurrency}` : ''}
        </div>

        {/* ── Daily P&L ── */}
        {Object.keys(quotes).length > 0 && (
          <div className={`flex items-center gap-4 mt-3 p-3 rounded-xl ${
            dailyPnL >= 0
              ? 'bg-emerald-950/40 border border-emerald-800/60'
              : 'bg-red-950/30 border border-red-900/60'
          }`}>
            <div>
              <div className="text-xs text-gray-400 mb-0.5">Today's P&amp;L</div>
              <div className={`text-xl font-bold tracking-tight ${dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmtPnL(dailyPnL)}
              </div>
            </div>
            <div className={`text-base font-semibold ${dailyPnL >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {dailyPnLPct >= 0 ? '+' : ''}{dailyPnLPct.toFixed(2)}%
            </div>
            {dailyPnL >= 0
              ? <TrendingUp className="w-5 h-5 text-emerald-600 ml-auto" />
              : <TrendingDown className="w-5 h-5 text-red-600 ml-auto" />
            }
          </div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Holdings', value: holdings.length, icon: Activity, color: 'text-blue-400' },
          { label: 'Cash', value: fmtAmt(cashPosition), icon: DollarSign, color: 'text-green-400' },
          {
            label: "Today's P&L",
            value: Object.keys(quotes).length > 0 ? fmtPnL(dailyPnL) : '—',
            icon: dailyPnL >= 0 ? TrendingUp : TrendingDown,
            color: dailyPnL >= 0 ? 'text-emerald-400' : 'text-red-400',
          },
          {
            label: 'To Goal',
            value: fmtAmt(needed),
            icon: Target,
            color: 'text-orange-400',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Icon className={`w-3.5 h-3.5 ${color}`} />
              {label}
            </div>
            <div className="font-semibold text-white text-lg">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Signal badges ── */}
      {signals.length > 0 && (() => {
        const buyCount  = signals.filter((s) => s.action === 'BUY' || s.action === 'STRONG_BUY').length;
        const sellCount = signals.filter((s) => s.action === 'SELL' || s.action === 'STRONG_SELL').length;
        const holdCount = signals.filter((s) => s.action === 'HOLD').length;
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Technical Signals:</span>
            {buyCount > 0 && (
              <button
                onClick={() => { setSignalFilter('BUY_ALL'); setActiveTab('signals'); }}
                className="flex items-center gap-1.5 text-sm bg-emerald-900/70 text-emerald-300 border border-emerald-700 px-3 py-1 rounded-full hover:bg-emerald-800 transition-colors font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {buyCount} Buy {buyCount !== signals.filter(s=>s.action==='STRONG_BUY').length && signals.filter(s=>s.action==='STRONG_BUY').length > 0 ? `(${signals.filter(s=>s.action==='STRONG_BUY').length} strong)` : ''}
              </button>
            )}
            {sellCount > 0 && (
              <button
                onClick={() => { setSignalFilter('SELL_ALL'); setActiveTab('signals'); }}
                className="flex items-center gap-1.5 text-sm bg-red-900/70 text-red-300 border border-red-700 px-3 py-1 rounded-full hover:bg-red-800 transition-colors font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                {sellCount} Sell {signals.filter(s=>s.action==='STRONG_SELL').length > 0 ? `(${signals.filter(s=>s.action==='STRONG_SELL').length} strong)` : ''}
              </button>
            )}
            {holdCount > 0 && (
              <button
                onClick={() => { setSignalFilter('HOLD'); setActiveTab('signals'); }}
                className="flex items-center gap-1.5 text-sm bg-gray-800 text-gray-400 border border-gray-700 px-3 py-1 rounded-full hover:bg-gray-700 transition-colors font-medium"
              >
                <span className="w-2 h-2 rounded-full bg-gray-500 inline-block" />
                {holdCount} Hold
              </button>
            )}
            <span className="text-xs text-gray-600 ml-auto">Click to view details →</span>
          </div>
        );
      })()}

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Asset class donut */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-gray-300 font-semibold mb-4">Asset Class Allocation</h3>
          {allocationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {allocationData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: unknown) => [formatCurrency(val as number), '']}
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                  labelStyle={{ color: '#9ca3af' }}
                />
                <Legend
                  formatter={(value, entry) =>
                    `${value} ${(entry?.payload as { pct?: string } | undefined)?.pct ?? ''}%`
                  }
                  wrapperStyle={{ fontSize: 11, color: '#9ca3af' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm text-center py-12">
              Upload your portfolio via Settings → Portfolio & Import to see allocation
            </p>
          )}
        </div>

        {/* Cap category donut */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
          <h3 className="text-gray-300 font-semibold mb-4">Market Cap Breakdown</h3>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[(i + 4) % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: unknown) => [formatCurrency(val as number), '']}
                  contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-sm text-center py-12">
              No holdings loaded
            </p>
          )}
        </div>
      </div>

      {/* ── Holdings table ── */}
      <div className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-gray-300 font-semibold">Holdings</h3>
          <div className="flex gap-2">
            <button
              onClick={refreshMarketData}
              disabled={isLoading['quotes']}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading['quotes'] ? 'animate-spin' : ''}`} />
              Live Prices
            </button>
            <button
              onClick={refreshIndicators}
              disabled={isLoading['indicators']}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isLoading['indicators'] ? 'animate-spin' : ''}`} />
              Calc Indicators
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/50 text-gray-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Ticker</th>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-right">Value</th>
                <th className="px-4 py-2 text-right">Price</th>
                <th className="px-4 py-2 text-right">1D %</th>
                <th className="px-4 py-2 text-right">Alloc %</th>
                <th className="px-4 py-2 text-left">Category</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {enrichedHoldings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-gray-500">
                    No holdings — add your portfolio via Settings → Portfolio &amp; Import
                  </td>
                </tr>
              ) : (
                enrichedHoldings.map((h) => {
                  const chg = h.changePercent1d;
                  const isPos = (chg ?? 0) >= 0;
                  return (
                    <tr key={h.id} className="hover:bg-gray-800/30">
                      <td className="px-4 py-2 font-mono font-bold text-brand-400">{h.ticker}</td>
                      <td className="px-4 py-2 text-gray-300 max-w-[200px] truncate">{h.name}</td>
                      <td className="px-4 py-2 text-right text-white font-medium">{formatCurrency(h.value)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">
                        {h.price ? `$${h.price.toFixed(2)}` : '—'}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${chg !== undefined ? (isPos ? 'text-emerald-400' : 'text-red-400') : 'text-gray-500'}`}>
                        {chg !== undefined ? formatPct(chg) : '—'}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-400">
                        {h.allocPct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full">
                          {h.category}
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

      {/* ── Growth projection (simple compound interest estimate) ── */}
      {totalValue > 0 && (
        <GrowthProjectionChart currentValue={totalValue} goalValue={goalValue} />
      )}

      {/* ── Portfolio equity curve (cloud history) ── */}
      <EquityCurveChart snapshots={cloudSync.snapshots} goalValue={goalValue} onRefresh={() => loadSnapshots(180)} />
    </div>
  );
}

// ─── Growth Projection Chart ──────────────────────────────────────────────────

function GrowthProjectionChart({
  currentValue,
  goalValue,
}: {
  currentValue: number;
  goalValue: number;
}) {
  const scenarios = [
    { label: 'Conservative (10%/yr)', rate: 0.10, color: '#14b8a6' },
    { label: 'Moderate (15%/yr)', rate: 0.15, color: '#6366f1' },
    { label: 'Aggressive (22%/yr)', rate: 0.22, color: '#f59e0b' },
  ];

  const YEARS = 7;
  const data = Array.from({ length: YEARS + 1 }, (_, yr) => {
    const row: Record<string, number | string> = { year: yr === 0 ? 'Now' : `Y${yr}` };
    for (const s of scenarios) {
      row[s.label] = Math.round(currentValue * (1 + s.rate) ** yr);
    }
    return row;
  });

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
      <h3 className="text-gray-300 font-semibold mb-1">Projected Growth to ${(goalValue / 1_000).toFixed(0)}K</h3>
      <p className="text-xs text-gray-500 mb-4">
        Compound annual return scenarios — actual returns will vary. Assumes no additional contributions.
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="year" tick={{ fill: '#6b7280', fontSize: 11 }} />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          />
          <Tooltip
            formatter={(v: unknown) => [`$${(v as number).toLocaleString()}`, '']}
            contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
          {/* Goal line */}
          <Line type="monotone" dataKey={() => goalValue} stroke="#ef4444" strokeDasharray="5 5"
            dot={false} strokeWidth={1} name="$1M Goal" />
          {scenarios.map((s) => (
            <Line
              key={s.label}
              type="monotone"
              dataKey={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Equity Curve Chart ───────────────────────────────────────────────────────

import type { PortfolioSnapshot } from '../types';
import { Cloud, RefreshCw as RefreshIcon } from 'lucide-react';

function EquityCurveChart({
  snapshots,
  goalValue,
  onRefresh,
}: {
  snapshots: PortfolioSnapshot[];
  goalValue: number;
  onRefresh: () => void;
}) {
  const data = snapshots.map((s) => ({
    date: s.snapshot_date.slice(5),          // MM-DD
    value: s.total_value,
    goal: goalValue,
  }));

  const hasData = data.length > 0;
  const first = hasData ? data[0].value : 0;
  const last  = hasData ? data[data.length - 1].value : 0;
  const gain  = first > 0 ? ((last - first) / first) * 100 : 0;

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-gray-300 font-semibold flex items-center gap-2">
          <Cloud className="w-4 h-4 text-brand-400" />
          Portfolio Value History
        </h3>
        <div className="flex items-center gap-3">
          {hasData && (
            <span className={`text-xs font-semibold ${gain >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {gain >= 0 ? '+' : ''}{gain.toFixed(1)}% over {data.length}d
            </span>
          )}
          <button onClick={onRefresh} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1">
            <RefreshIcon className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Actual portfolio value recorded each day you open the app. Syncs to Supabase cloud.
      </p>

      {hasData ? (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fill: '#6b7280', fontSize: 10 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
              width={55}
            />
            <Tooltip
              formatter={(v: unknown, name: unknown) => [`$${(v as number).toLocaleString()}`, name === 'value' ? 'Portfolio' : 'Goal']}
              contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8 }}
              labelStyle={{ color: '#9ca3af' }}
            />
            <Line type="monotone" dataKey="goal" stroke="#ef444460" strokeDasharray="4 4"
              dot={false} strokeWidth={1} name="Goal" />
            <Line type="monotone" dataKey="value" stroke="#14b8a6"
              dot={false} strokeWidth={2} name="Portfolio" />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-48 flex flex-col items-center justify-center gap-2 text-gray-600">
          <Cloud className="w-8 h-8 opacity-30" />
          <p className="text-sm">No history yet</p>
          <p className="text-xs text-center max-w-xs">
            Configure Supabase in Settings → General and run the migration in
            <code className="text-brand-500 mx-1">supabase/migrations/001_portfolio_sync.sql</code>
            to start tracking your portfolio value over time.
          </p>
        </div>
      )}
    </div>
  );
}
