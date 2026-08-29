// ─── Portfolio & Holdings ────────────────────────────────────────────────────
// Single source of truth for all TypeScript interfaces used across the app.
// Importing from here (not from component files) prevents circular dependencies.

export type AssetClass = 'etf' | 'stock' | 'forex' | 'crypto' | 'fund' | 'bond';
export type CapCategory = 'mega-cap' | 'large-cap' | 'mid-cap' | 'small-cap' | 'micro-cap' | 'international' | 'n/a';
export type RiskLevel = 'low' | 'medium' | 'medium-high' | 'high';
export type SignalAction = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'HOLD' | 'SELL' | 'STRONG_SELL';
export type TaxBracket = '10%' | '12%' | '22%' | '24%' | '32%' | '35%' | '37%';

export interface Holding {
  id: string;
  ticker: string;
  name: string;
  value: number;          // current market value in USD
  shares?: number;
  costBasis?: number;     // total cost basis in USD
  purchaseDate?: string;  // ISO date — used for long-term vs short-term capital gains
  assetClass: AssetClass;
  category: CapCategory;
  // Filled in after market data fetch
  price?: number;
  change1d?: number;      // $ change today
  changePercent1d?: number;
  change1m?: number;
  changePercent1m?: number;
  change1y?: number;
  changePercent1y?: number;
  high52w?: number;
  low52w?: number;
}

export interface Portfolio {
  holdings: Holding[];
  totalValue: number;
  goalValue: number;      // default 1_000_000
  riskTolerance: RiskLevel;
  lastUpdated: string;    // ISO date string
  cashPosition?: number;  // uninvested cash
}

// ─── Market Data ─────────────────────────────────────────────────────────────

export interface PriceBar {
  date: string;           // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Quote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52w?: number;
  low52w?: number;
  shortName?: string;    // company display name from Yahoo Finance
  timestamp: number;      // unix ms
}

// ─── Technical Indicators ────────────────────────────────────────────────────

export interface MACD {
  macdLine: number;
  signalLine: number;
  histogram: number;
}

export interface BollingerBands {
  upper: number;
  middle: number;         // SMA20
  lower: number;
  bandwidth: number;
}

export interface TechnicalIndicators {
  ticker: string;
  rsi14: number;
  macd: MACD;
  sma20: number;
  sma50: number;
  sma200: number;
  ema12: number;
  ema21: number;          // 21-period EMA — key trend reference (woofstreets framework)
  ema26: number;
  bollingerBands: BollingerBands;
  atr14: number;          // Average True Range – used for stop-loss sizing
  priceHistory: PriceBar[];
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export interface PreTradeChecklist {
  trendStrong: boolean;
  priceAboveEma21: boolean;
  volumeHealthy: boolean;
  supportNearby: boolean;
  riskRewardGood: boolean;
  structureIntact: boolean;
  stopLossDefined: boolean;
  checksPassed: number;   // 0-7
}

export interface Signal {
  ticker: string;
  name?: string;
  action: SignalAction;
  confidence: number;     // 0–100
  reasons: string[];
  targetPrice?: number;
  stopLoss?: number;
  riskRewardRatio?: number;
  trendDirection?: 'uptrend' | 'downtrend' | 'sideways';
  preTradeChecklist?: PreTradeChecklist;
}

// ─── Forex ────────────────────────────────────────────────────────────────────

export interface ForexRate {
  base: string;
  quote: string;
  pair: string;           // e.g. "EUR/USD"
  rate: number;
  timestamp: number;
}

export interface ForexPairAnalysis {
  pair: string;
  rate: number;
  change24h: number;
  changePercent24h: number;
  trend: 'bullish' | 'bearish' | 'sideways';
  rsi?: number;
  support?: number;
  resistance?: number;
  signal: Signal;
  description: string;   // e.g. "Euro / US Dollar"
  category: 'major' | 'minor' | 'exotic';
}

// ─── AI Advisor ───────────────────────────────────────────────────────────────

export interface AllocationSuggestion {
  category: string;
  currentPercent: number;
  suggestedPercent: number;
  rationale: string;
}

export interface PositionAdvice {
  ticker: string;
  name?: string;
  action: SignalAction | 'NEW';
  currentWeight?: number;
  suggestedWeight?: number;
  reasoning: string;
}

export interface ForexAdvice {
  pair: string;
  action: 'BUY' | 'SELL' | 'AVOID';
  suggestedAllocationPct: number;  // % of total portfolio
  leverage?: string;               // e.g. "1:10" — conservative
  expectedReturn?: string;
  reasoning: string;
}

export interface GrowthProjection {
  conservative: number;   // annual % return
  moderate: number;
  aggressive: number;
  yearsToGoalConservative: number;
  yearsToGoalModerate: number;
  yearsToGoalAggressive: number;
}

export interface AIRecommendation {
  generatedAt: string;
  summary: string;
  portfolioScore: number;          // 0–100
  positions: PositionAdvice[];
  newPositions: PositionAdvice[];
  forexAdvice: ForexAdvice[];
  allocations: AllocationSuggestion[];
  riskAssessment: string;
  marketOutlook: string;
  keyRisks: string[];
  nextSteps: string[];
  growthProjection: GrowthProjection;
}

// ─── App State ────────────────────────────────────────────────────────────────

export type AppTab = 'portfolio' | 'analysis' | 'forex' | 'advisor' | 'signals' | 'scanner' | 'realestate' | 'settings' | 'playbook' | 'options' | 'swing';

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

export interface PortfolioSnapshot {
  snapshot_date: string;   // YYYY-MM-DD
  total_value: number;
  cash_position: number;
  holdings_count: number;
}

export interface CloudSyncState {
  status: CloudSyncStatus;
  lastSyncedAt: string | null;  // ISO string
  error: string | null;
  snapshots: PortfolioSnapshot[];
}

export interface ApiKeys {
  alphaVantage: string;
  polygon: string;
  finnhub: string;
  rapidApi: string;  // RapidAPI key — used for Zillow property search
}

export interface UserPreferences {
  taxBracket: TaxBracket;
  preferLongTerm: boolean;   // flag positions approaching the 1-year mark
  taxCountry: 'US' | 'UK' | 'AU' | 'Other';
  riskPerTrade: number;      // USD risk amount per trade (used for position sizing)
  displayCurrency: string;   // ISO 4217 code e.g. 'USD', 'EUR', 'GBP'
}

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

// ─── Real Estate ──────────────────────────────────────────────────────────────

export type PropertyType = 'single_family' | 'multi_family' | 'duplex' | 'triplex' | 'quadplex' | 'condo';
export type DistressType  = 'foreclosure' | 'pre_foreclosure' | 'bankruptcy' | 'reo' | 'auction' | null;
export type RESignal      = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'HOLD' | 'PASS';

export interface PropertyListing {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  yearBuilt?: number;
  lotSqft?: number;
  propertyType: PropertyType;
  distressType: DistressType;
  daysOnMarket?: number;
  listingUrl?: string;
  imageUrl?: string;
  description?: string;
  source: 'zillow' | 'sample' | 'hud' | 'attom';
}

export interface PadSplitAnalysis {
  // Revenue
  estimatedRooms:   number;
  revenuePerRoom:   number;
  grossMonthlyRev:  number;
  grossAnnualRev:   number;
  traditionalRent:  number;
  revenueUplift:    number;    // % vs traditional rental

  // Costs
  renovationCost:   number;
  totalInvestment:  number;    // price + renovation

  // Operations (PadSplit model — landlord pays utilities)
  vacancyFactor:    number;    // fraction reserved for vacancy
  expenseRatio:     number;    // % of gross
  annualExpenses:   number;
  noi:              number;
  capRate:          number;

  // Financing (25% down, 7.5% 30yr)
  downPayment:      number;
  loanAmount:       number;
  monthlyDebtSvc:   number;
  monthlyCashFlow:  number;
  annualCashFlow:   number;
  cocReturn:        number;    // cash-on-cash %
  dscr:             number;    // debt service coverage ratio

  // Scoring
  padSplitScore:    number;    // 0-100
  padSplitFlags:    string[];  // human-readable checklist
  signal:           RESignal;
}
