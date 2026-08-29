/**
 * Macro Valuation Context — shared across components.
 *
 * The Shiller CAPE (Cyclically Adjusted Price-to-Earnings) ratio is the
 * 10-year inflation-adjusted PE ratio for the S&P 500, pioneered by
 * Nobel laureate Robert Shiller.
 *
 * Update this file whenever the regime changes materially.
 * Live CAPE: https://www.multpl.com/shiller-pe
 * Live S&P PE: https://www.multpl.com/s-p-500-pe-ratio
 */

export type ValuationRegime = 'UNDERVALUED' | 'FAIR' | 'ELEVATED' | 'HIGH' | 'EXTREME';

export interface MacroValuationContext {
  shillerCAPE:      number;          // Shiller CAPE (10-yr cyclically adjusted PE)
  trailingPE:       number;          // S&P 500 trailing 12-month PE (approx)
  buffettIndicator: number;          // Market cap / GDP % (Buffett Indicator)
  regime:           ValuationRegime;
  asOf:             string;          // e.g. "July 2026"
  historicalContext: string;
  precedents: Array<{
    year:       number;
    capeAtPeak: number;
    drawdown:   string;
    outcome:    string;
  }>;
  implication: string;
  sourceUrl:   string;
}

export const MACRO_VALUATION: MacroValuationContext = {
  shillerCAPE:      42,
  trailingPE:       28,
  buffettIndicator: 195,   // approx % of GDP, well above 100% historical danger zone
  regime:           'EXTREME',
  asOf:             'July 2026',

  historicalContext:
    'Shiller CAPE has exceeded 40 only 3 times in 155 years of data (1871–2026): ' +
    'December 1999, January 2022, and July 2026. ' +
    'Current all-time highs across Dow, S&P 500, and Nasdaq are driven by AI euphoria, IPO mania, and strong corporate earnings. ' +
    'The Buffett Indicator (market cap/GDP) is at ~195%, also historically extreme.',

  precedents: [
    { year: 1999, capeAtPeak: 44, drawdown: '−49%',  outcome: 'Dotcom crash 2000–2002; S&P 500 fell 49% peak-to-trough' },
    { year: 2022, capeAtPeak: 40, drawdown: '−25%',  outcome: '2022 bear market; Fed rate hikes triggered rapid multiple compression' },
  ],

  implication:
    'CAPE at extreme levels does NOT predict the timing of a correction — the market can remain overvalued for 1–3 years. ' +
    'However, forward 10-year expected returns historically compress sharply at these levels, and the risk of a >30% drawdown is materially elevated. ' +
    'Recommended adjustments: (1) reduce individual stock position sizes, (2) raise quality bar — prefer profitable companies with strong balance sheets, ' +
    '(3) avoid speculative/unprofitable growth, (4) consider adding hedges or increasing cash buffer.',

  sourceUrl: 'https://www.multpl.com/shiller-pe',
};

/** Regime display config */
export const REGIME_CFG: Record<ValuationRegime, { label: string; badgeCls: string; barCls: string; desc: string }> = {
  UNDERVALUED: { label: 'Undervalued',  badgeCls: 'bg-emerald-900/50 text-emerald-300 border-emerald-700', barCls: 'bg-emerald-500', desc: 'Historically strong forward returns expected' },
  FAIR:        { label: 'Fair Value',   badgeCls: 'bg-blue-900/50 text-blue-300 border-blue-700',          barCls: 'bg-blue-500',    desc: 'Near historical average; normal risk/reward' },
  ELEVATED:    { label: 'Elevated',     badgeCls: 'bg-yellow-900/50 text-yellow-300 border-yellow-700',    barCls: 'bg-yellow-500',  desc: 'Above average; forward returns compressed' },
  HIGH:        { label: 'High',         badgeCls: 'bg-orange-900/50 text-orange-300 border-orange-700',    barCls: 'bg-orange-500',  desc: 'Materially overvalued; increased downside risk' },
  EXTREME:     { label: 'Extreme',      badgeCls: 'bg-red-900/50 text-red-300 border-red-800',             barCls: 'bg-red-500',     desc: 'Historically rare — only 3× in 155 years. Major tail risk.' },
};

/** CAPE historical bands for the gauge visual */
export const CAPE_BANDS = [
  { label: 'Undervalued',  min: 0,  max: 15,  color: '#10b981' },
  { label: 'Fair Value',   min: 15, max: 20,  color: '#3b82f6' },
  { label: 'Elevated',     min: 20, max: 25,  color: '#f59e0b' },
  { label: 'High',         min: 25, max: 35,  color: '#f97316' },
  { label: 'Extreme',      min: 35, max: 50,  color: '#ef4444' },
];
