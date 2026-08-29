/**
 * cloudSync.ts
 *
 * All Supabase cloud-sync helpers for portfolio data.
 * Tables: portfolio_data, portfolio_snapshots
 * Run supabase/migrations/001_portfolio_sync.sql first.
 *
 * Architecture note: This is a single-user personal tool with no authentication.
 * All rows use user_id = 'default'. Row Level Security policies allow all
 * operations — appropriate here since the Supabase project is private to the owner.
 */
import { supabase } from './supabase';
import type { Holding, Portfolio } from '../types';

/** Fixed user identifier — single-user personal tool (no auth). */
const USER_ID = 'default';

export interface PortfolioSnapshot {
  snapshot_date: string;  // YYYY-MM-DD
  total_value: number;
  cash_position: number;
  holdings_count: number;
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

/** Returns true if Supabase env vars are present. */
export function isSupabaseConfigured(): boolean {
  return !!(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

/**
 * Push the full current portfolio to Supabase.
 * Holdings are stored as a JSONB column for simplicity.
 */
export async function syncPortfolioToCloud(
  portfolio: Portfolio,
  holdings: Holding[],
  displayCurrency = 'USD'
): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');

  const { error } = await supabase
    .from('portfolio_data')
    .upsert(
      {
        user_id: USER_ID,
        goal_value: portfolio.goalValue,
        cash_position: portfolio.cashPosition ?? 0,
        risk_tolerance: portfolio.riskTolerance,
        display_currency: displayCurrency,
        holdings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

  if (error) throw error;
}

/**
 * Pull the latest portfolio data from Supabase.
 * Returns null if no data exists yet.
 */
export async function loadPortfolioFromCloud(): Promise<{
  holdings: Holding[];
  meta: Pick<Portfolio, 'goalValue' | 'cashPosition' | 'riskTolerance'>;
  displayCurrency: string;
} | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from('portfolio_data')
    .select('*')
    .eq('user_id', USER_ID)
    .maybeSingle();

  if (error || !data) return null;

  return {
    holdings: (data.holdings as Holding[]) ?? [],
    meta: {
      goalValue: data.goal_value ?? 1_000_000,
      cashPosition: data.cash_position ?? 0,
      riskTolerance: data.risk_tolerance ?? 'medium-high',
    },
    displayCurrency: (data.display_currency as string) ?? 'USD',
  };
}

/**
 * Upsert today's portfolio snapshot.
 * The UNIQUE(user_id, snapshot_date) constraint means multiple
 * calls on the same day simply update the record.
 */
export async function takePortfolioSnapshot(
  totalValue: number,
  cashPosition: number,
  holdingsCount: number
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  if (totalValue <= 0) return;

  const today = new Date().toISOString().split('T')[0];

  const { error } = await supabase
    .from('portfolio_snapshots')
    .upsert(
      {
        user_id: USER_ID,
        snapshot_date: today,
        total_value: totalValue,
        cash_position: cashPosition,
        holdings_count: holdingsCount,
      },
      { onConflict: 'user_id,snapshot_date' }
    );

  if (error) throw error;
}

/**
 * Fetch historical snapshots for the equity curve chart.
 * Defaults to the last 90 days.
 */
export async function fetchPortfolioSnapshots(
  days = 90
): Promise<PortfolioSnapshot[]> {
  if (!isSupabaseConfigured()) return [];

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('snapshot_date, total_value, cash_position, holdings_count')
    .eq('user_id', USER_ID)
    .gte('snapshot_date', since.toISOString().split('T')[0])
    .order('snapshot_date', { ascending: true });

  if (error) return [];
  return (data ?? []) as PortfolioSnapshot[];
}
