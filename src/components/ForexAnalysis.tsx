import { useState, useEffect } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { buildForexAnalysis } from '../lib/forex';
import { useToast } from './Toast';


const ACTION_STYLES: Record<string, string> = {
  STRONG_BUY:  'bg-emerald-900/60 text-emerald-300 border-emerald-700',
  BUY:         'bg-green-900/60 text-green-300 border-green-700',
  WATCH:       'bg-indigo-900/60 text-indigo-300 border-indigo-700',
  HOLD:        'bg-gray-800 text-gray-400 border-gray-600',
  SELL:        'bg-orange-900/60 text-orange-300 border-orange-700',
  STRONG_SELL: 'bg-red-900/60 text-red-300 border-red-700',
};

const CATEGORY_BADGE: Record<string, string> = {
  major:  'bg-blue-900/40 text-blue-300',
  minor:  'bg-purple-900/40 text-purple-300',
  exotic: 'bg-orange-900/40 text-orange-300',
};

function ConfidenceMeter({ value }: { value: number }) {
  const color = value >= 60 ? 'bg-emerald-500' : value >= 35 ? 'bg-yellow-500' : 'bg-gray-600';
  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="w-24 bg-gray-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-gray-400">{value}%</span>
    </div>
  );
}

export function ForexAnalysis() {
  const { forexPairs, setForexPairs, apiKeys } = useInvestmentStore();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = async () => {
    setIsLoading(true);
    try {
      const pairs = await buildForexAnalysis(apiKeys.alphaVantage);
      setForexPairs(pairs);
      toast.success(`Forex data updated — ${pairs.length} pairs analysed`);
    } catch (e) {
      console.error(e);
      toast.error('Forex data fetch failed');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (forexPairs.length === 0) refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const majors = forexPairs.filter((p) => p.category === 'major');
  const minors = forexPairs.filter((p) => p.category === 'minor');
  const exotics = forexPairs.filter((p) => p.category === 'exotic');

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-bold text-lg">Forex Analysis</h2>
          <p className="text-gray-500 text-sm">
            10 recommended pairs for medium–high risk. TA requires an Alpha Vantage key.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Info banner ── */}
      <div className="flex items-start gap-2 bg-blue-950/40 border border-blue-800 rounded-xl p-4 text-blue-200 text-sm">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
        <div>
          <strong>How to trade forex:</strong> Use a regulated broker (OANDA, IG Markets, Interactive Brokers, etc.).
          For medium-high risk, consider 1:10–1:20 leverage max. Always set stop-losses.{' '}
          <span className="text-blue-400">Full TA (RSI, trend) loads only when an Alpha Vantage key is configured in Settings.</span>
        </div>
      </div>

      {/* ── Signal summary cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        {forexPairs.map((pair) => (
          <button
            key={pair.pair}
            onClick={() => setExpanded(expanded === pair.pair ? null : pair.pair)}
            className={`p-3 rounded-xl border text-left transition-all hover:shadow-md ${
              expanded === pair.pair
                ? 'border-brand-500 bg-brand-900/30'
                : 'border-gray-700 bg-gray-900/60 hover:border-gray-500'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-mono font-bold text-white text-sm">{pair.pair}</span>
              {pair.trend === 'bullish'
                ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                : pair.trend === 'bearish'
                ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                : <Minus className="w-3.5 h-3.5 text-gray-500" />
              }
            </div>
            <div className="text-gray-300 text-sm font-semibold">
              {pair.rate > 0 ? pair.rate.toFixed(5) : '—'}
            </div>
            <div className="mt-1">
              <span className={`text-xs px-1.5 py-0.5 rounded border ${ACTION_STYLES[pair.signal.action]}`}>
                {pair.signal.action.replace('_', ' ')}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (() => {
        const pair = forexPairs.find((p) => p.pair === expanded);
        if (!pair) return null;
        return (
          <div className="bg-gray-900/60 border border-brand-700 rounded-2xl p-5 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-white font-bold text-xl font-mono">{pair.pair}</h3>
                <p className="text-gray-400 text-sm">{pair.description}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${CATEGORY_BADGE[pair.category]}`}>
                {pair.category}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-800 rounded-xl p-3">
                <div className="text-xs text-gray-500">Rate</div>
                <div className="text-white font-bold text-lg">{pair.rate.toFixed(5)}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3">
                <div className="text-xs text-gray-500">Trend</div>
                <div className={`font-bold capitalize ${
                  pair.trend === 'bullish' ? 'text-emerald-400'
                  : pair.trend === 'bearish' ? 'text-red-400'
                  : 'text-yellow-400'
                }`}>{pair.trend}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3">
                <div className="text-xs text-gray-500">RSI 14</div>
                <div className="text-white font-bold">
                  {pair.rsi !== undefined ? pair.rsi.toFixed(1) : '—'}
                </div>
              </div>
              <div className="bg-gray-800 rounded-xl p-3">
                <div className="text-xs text-gray-500">Confidence</div>
                <ConfidenceMeter value={pair.signal.confidence} />
              </div>
            </div>

            {/* Signal & reasons */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-3 py-1 rounded-lg border font-bold text-sm ${ACTION_STYLES[pair.signal.action]}`}>
                  {pair.signal.action.replace('_', ' ')}
                </span>
                {pair.signal.stopLoss && (
                  <span className="text-xs text-orange-400">
                    Stop-loss: {pair.signal.stopLoss.toFixed(5)}
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {pair.signal.reasons.map((r, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-brand-500 mt-1">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })()}

      {/* ── Grouped tables ── */}
      {[
        { label: 'Major Pairs', pairs: majors },
        { label: 'Minor / Cross Pairs', pairs: minors },
        { label: 'Exotic / High-Risk Pairs', pairs: exotics },
      ].map(({ label, pairs }) => pairs.length > 0 && (
        <div key={label} className="bg-gray-900/60 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-800">
            <h3 className="text-gray-300 font-semibold text-sm">{label}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-800/50 text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Pair</th>
                  <th className="px-4 py-2 text-left">Description</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-center">Trend</th>
                  <th className="px-4 py-2 text-right">RSI</th>
                  <th className="px-4 py-2 text-center">Signal</th>
                  <th className="px-4 py-2 text-center">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/60">
                {pairs.map((pair) => (
                  <tr
                    key={pair.pair}
                    className="hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setExpanded(expanded === pair.pair ? null : pair.pair)}
                  >
                    <td className="px-4 py-2 font-mono font-bold text-white">{pair.pair}</td>
                    <td className="px-4 py-2 text-gray-400 max-w-[220px] truncate">{pair.description}</td>
                    <td className="px-4 py-2 text-right text-gray-200">{pair.rate.toFixed(5)}</td>
                    <td className="px-4 py-2 text-center">
                      {pair.trend === 'bullish'
                        ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400 mx-auto" />
                        : pair.trend === 'bearish'
                        ? <TrendingDown className="w-3.5 h-3.5 text-red-400 mx-auto" />
                        : <Minus className="w-3.5 h-3.5 text-gray-500 mx-auto" />
                      }
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300">
                      {pair.rsi !== undefined ? pair.rsi.toFixed(1) : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded border text-xs ${ACTION_STYLES[pair.signal.action]}`}>
                        {pair.signal.action.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <ConfidenceMeter value={pair.signal.confidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
