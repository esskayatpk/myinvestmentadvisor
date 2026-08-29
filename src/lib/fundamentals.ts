/**
 * Fundamental analysis, insider activity, and earnings data via Finnhub.
 * All three endpoints are free on the Finnhub basic tier.
 * Cache TTL: 6 hours (this data changes infrequently).
 */

const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function cachePut(key: string, data: unknown) {
  try { sessionStorage.setItem(key, JSON.stringify({ data, t: Date.now() })); } catch { /* full */ }
}
function cacheGet<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: T; t: number };
    return Date.now() - entry.t < CACHE_TTL ? entry.data : null;
  } catch { return null; }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FundamentalData {
  peRatio?: number;
  pbRatio?: number;
  epsGrowthYoY?: number;      // % year-over-year
  revenueGrowthYoY?: number;  // % year-over-year
  debtToEquity?: number;
  currentRatio?: number;
  roe?: number;               // Return on equity %
  dividendYield?: number;
}

export interface InsiderTransaction {
  name: string;
  change: number;             // +ve = buy, -ve = sell (shares)
  value: number;              // USD value
  date: string;               // ISO date
}

export type InsiderAlert = 'heavy_selling' | 'selling' | 'neutral' | 'buying' | 'heavy_buying';

export interface InsiderSummary {
  transactions: InsiderTransaction[];
  netShares90d: number;
  alert: InsiderAlert;
}

export interface EarningsInfo {
  nextDate?: string;       // ISO date of next earnings
  daysAway?: number;       // negative = earnings just passed
  lastSurprisePct?: number; // + = beat, - = miss
  lastActualEPS?: number;
  lastEstimateEPS?: number;
}

// ─── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchFundamentals(
  ticker: string,
  finnhubKey: string,
): Promise<FundamentalData | null> {
  if (!finnhubKey) return null;
  const key = `fh_fund_${ticker}`;
  const hit = cacheGet<FundamentalData>(key);
  if (hit) return hit;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${finnhubKey}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as {
      metric?: {
        peNormalizedAnnual?: number;
        pbAnnual?: number;
        epsGrowthTTMYoy?: number;
        revenueGrowthTTMYoy?: number;
        totalDebt_totalEquityAnnual?: number;
        currentRatioAnnual?: number;
        roeRfy?: number;
        dividendYieldIndicatedAnnual?: number;
      };
    };

    const m = json.metric ?? {};
    const data: FundamentalData = {
      peRatio:           m.peNormalizedAnnual,
      pbRatio:           m.pbAnnual,
      epsGrowthYoY:      m.epsGrowthTTMYoy,
      revenueGrowthYoY:  m.revenueGrowthTTMYoy,
      debtToEquity:      m.totalDebt_totalEquityAnnual,
      currentRatio:      m.currentRatioAnnual,
      roe:               m.roeRfy,
      dividendYield:     m.dividendYieldIndicatedAnnual,
    };
    cachePut(key, data);
    return data;
  } catch (err) {
    console.warn(`[finnhub] fetchFundamentals(${ticker}) failed:`, err);
    return null;
  }
}

export async function fetchInsiderActivity(
  ticker: string,
  finnhubKey: string,
): Promise<InsiderSummary | null> {
  if (!finnhubKey) return null;
  const key = `fh_insider_${ticker}`;
  const hit = cacheGet<InsiderSummary>(key);
  if (hit) return hit;

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/stock/insider-transactions?symbol=${encodeURIComponent(ticker)}&token=${finnhubKey}`,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json() as {
      data?: Array<{
        name: string;
        share: number;
        value: number;
        transactionDate: string;
        transactionCode: string; // 'P' = purchase, 'S' = sale
      }>;
    };

    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const recent = (json.data ?? []).filter(
      (t) => t.transactionDate >= cutoff && (t.transactionCode === 'P' || t.transactionCode === 'S'),
    );

    const transactions: InsiderTransaction[] = recent.slice(0, 12).map((t) => ({
      name:   t.name,
      change: t.transactionCode === 'P' ? Math.abs(t.share) : -Math.abs(t.share),
      value:  Math.abs(t.value),
      date:   t.transactionDate,
    }));

    const netShares90d = transactions.reduce((s, t) => s + t.change, 0);
    const alert: InsiderAlert =
      netShares90d < -500_000 ? 'heavy_selling'
      : netShares90d < -50_000 ? 'selling'
      : netShares90d > 500_000 ? 'heavy_buying'
      : netShares90d > 50_000  ? 'buying'
      : 'neutral';

    const summary: InsiderSummary = { transactions, netShares90d, alert };
    cachePut(key, summary);
    return summary;
  } catch (err) {
    console.warn(`[finnhub] fetchInsiderActivity(${ticker}) failed:`, err);
    return null;
  }
}

export async function fetchEarningsInfo(
  ticker: string,
  finnhubKey: string,
): Promise<EarningsInfo | null> {
  if (!finnhubKey) return null;
  const key = `fh_earn_${ticker}`;
  const hit = cacheGet<EarningsInfo>(key);
  if (hit) return hit;

  try {
    const from = new Date().toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);

    const [calRes, histRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(ticker)}&from=${from}&to=${to}&token=${finnhubKey}`),
      fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${encodeURIComponent(ticker)}&limit=2&token=${finnhubKey}`),
    ]);

    const calJson  = calRes.ok  ? await calRes.json() as { earningsCalendar?: Array<{ date: string; epsEstimate?: number }> } : {};
    const histJson = histRes.ok ? await histRes.json() as Array<{ actual?: number; estimate?: number }> : [];

    const next  = calJson.earningsCalendar?.[0];
    const last  = histJson[0];

    const daysAway = next?.date
      ? Math.ceil((new Date(next.date).getTime() - Date.now()) / 86400000)
      : undefined;

    const lastSurprisePct =
      last?.actual != null && last?.estimate != null && last.estimate !== 0
        ? ((last.actual - last.estimate) / Math.abs(last.estimate)) * 100
        : undefined;

    const info: EarningsInfo = {
      nextDate:        next?.date,
      daysAway,
      lastSurprisePct,
      lastActualEPS:   last?.actual,
      lastEstimateEPS: last?.estimate,
    };
    cachePut(key, info);
    return info;
  } catch (err) {
    console.warn(`[finnhub] fetchEarningsInfo(${ticker}) failed:`, err);
    return null;
  }
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

export interface FundamentalScore {
  score: number;    // -20 to +20 advisory adjustment
  reasons: string[];
}

export function scoreFundamentals(data: FundamentalData): FundamentalScore {
  let score = 0;
  const reasons: string[] = [];

  if (data.peRatio != null) {
    if (data.peRatio > 0 && data.peRatio < 15) {
      score += 5;
      reasons.push(`Low P/E (${data.peRatio.toFixed(1)}) — potentially undervalued`);
    } else if (data.peRatio > 60) {
      score -= 5;
      reasons.push(`Very high P/E (${data.peRatio.toFixed(1)}) — priced for perfection, valuation risk`);
    } else if (data.peRatio < 0) {
      score -= 5;
      reasons.push('Negative P/E — company currently unprofitable');
    }
  }

  if (data.epsGrowthYoY != null) {
    if (data.epsGrowthYoY > 20) {
      score += 8;
      reasons.push(`Strong EPS growth (${data.epsGrowthYoY.toFixed(1)}% YoY) — earnings expanding rapidly`);
    } else if (data.epsGrowthYoY > 0) {
      score += 3;
      reasons.push(`Positive EPS growth (${data.epsGrowthYoY.toFixed(1)}% YoY)`);
    } else if (data.epsGrowthYoY < -20) {
      score -= 8;
      reasons.push(`Sharp EPS decline (${data.epsGrowthYoY.toFixed(1)}% YoY) — earnings deteriorating`);
    } else {
      score -= 3;
      reasons.push(`Declining EPS (${data.epsGrowthYoY.toFixed(1)}% YoY) — earnings under pressure`);
    }
  }

  if (data.revenueGrowthYoY != null) {
    if (data.revenueGrowthYoY > 15) {
      score += 5;
      reasons.push(`Strong revenue growth (${data.revenueGrowthYoY.toFixed(1)}% YoY)`);
    } else if (data.revenueGrowthYoY < -10) {
      score -= 5;
      reasons.push(`Declining revenue (${data.revenueGrowthYoY.toFixed(1)}% YoY)`);
    }
  }

  if (data.debtToEquity != null && data.debtToEquity > 2.5) {
    score -= 3;
    reasons.push(`High debt-to-equity (${data.debtToEquity.toFixed(1)}) — leverage risk`);
  }

  return { score: Math.max(-20, Math.min(20, score)), reasons };
}

export function scoreInsider(summary: InsiderSummary): FundamentalScore {
  const netK = (summary.netShares90d / 1000).toFixed(0);
  if (summary.alert === 'heavy_selling') {
    return { score: -15, reasons: [`⚠️ Heavy insider selling — ${netK}k net shares sold in last 90 days; key executives reducing exposure significantly`] };
  } else if (summary.alert === 'selling') {
    return { score: -8, reasons: [`Insider selling — ${Math.abs(+netK)}k net shares sold by management in last 90 days`] };
  } else if (summary.alert === 'heavy_buying') {
    return { score: 12, reasons: [`Strong insider buying — ${netK}k net shares bought; management is confident in the company's prospects`] };
  } else if (summary.alert === 'buying') {
    return { score: 6, reasons: [`Insider buying — ${netK}k net shares purchased by management in last 90 days`] };
  }
  return { score: 0, reasons: ['Insider activity: neutral — no significant buying or selling in last 90 days'] };
}
