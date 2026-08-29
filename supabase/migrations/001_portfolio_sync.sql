-- ============================================================
-- Migration 001: Portfolio Cloud Sync
-- Run this in your Supabase SQL editor or via the CLI:
--   supabase db push
-- ============================================================

-- ── portfolio_data ────────────────────────────────────────
-- Single row per user. Stores the full current portfolio
-- including holdings as JSONB (personal tool, no auth needed).

CREATE TABLE IF NOT EXISTS portfolio_data (
  user_id       text        PRIMARY KEY DEFAULT 'default',
  goal_value    numeric     NOT NULL DEFAULT 1000000,
  cash_position numeric     NOT NULL DEFAULT 0,
  risk_tolerance text       NOT NULL DEFAULT 'medium-high',
  holdings      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── portfolio_snapshots ───────────────────────────────────
-- One row per calendar day per user.
-- Used to draw the portfolio equity curve.

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text        NOT NULL DEFAULT 'default',
  snapshot_date  date        NOT NULL DEFAULT CURRENT_DATE,
  total_value    numeric     NOT NULL,
  cash_position  numeric     NOT NULL DEFAULT 0,
  holdings_count integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

-- Index for fast range queries on the equity curve
CREATE INDEX IF NOT EXISTS idx_snapshots_user_date
  ON portfolio_snapshots(user_id, snapshot_date DESC);

-- ── Row Level Security ────────────────────────────────────
-- This is a personal single-user tool with no login.
-- We allow the anon role full access so the frontend can
-- read/write using only the public anon key.

ALTER TABLE portfolio_data      ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_portfolio_data"      ON portfolio_data;
DROP POLICY IF EXISTS "anon_all_portfolio_snapshots" ON portfolio_snapshots;

CREATE POLICY "anon_all_portfolio_data"
  ON portfolio_data
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "anon_all_portfolio_snapshots"
  ON portfolio_snapshots
  FOR ALL TO anon
  USING (true)
  WITH CHECK (true);
