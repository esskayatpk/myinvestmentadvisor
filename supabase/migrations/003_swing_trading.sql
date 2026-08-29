-- ============================================================
-- Migration 003: Swing Trading Journal & Settings
-- Run in Supabase SQL editor or via the CLI:
--   supabase db push
-- ============================================================

-- ── swing_journal ─────────────────────────────────────────
-- One row per trade. Stores all journal entries for the
-- swing trading playbook.

CREATE TABLE IF NOT EXISTS swing_journal (
  id          text        PRIMARY KEY,
  user_id     text        NOT NULL DEFAULT 'default',
  date        text        NOT NULL,
  ticker      text        NOT NULL,
  strategy    text        NOT NULL,
  direction   text        NOT NULL,
  entry       numeric     NOT NULL,
  stop        numeric     NOT NULL,
  target      numeric     NOT NULL,
  exit_price  numeric,
  status      text        NOT NULL DEFAULT 'open',
  r_multiple  numeric,
  notes       text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS swing_journal_user_id_idx ON swing_journal (user_id);
CREATE INDEX IF NOT EXISTS swing_journal_date_idx    ON swing_journal (date DESC);

ALTER TABLE swing_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swing_journal_all" ON swing_journal;
CREATE POLICY "swing_journal_all" ON swing_journal FOR ALL USING (true);

-- ── swing_settings ────────────────────────────────────────
-- Single row per user. Stores current phase and preferences.

CREATE TABLE IF NOT EXISTS swing_settings (
  user_id       text        PRIMARY KEY DEFAULT 'default',
  current_phase integer     NOT NULL DEFAULT 1,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE swing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swing_settings_all" ON swing_settings;
CREATE POLICY "swing_settings_all" ON swing_settings FOR ALL USING (true);
