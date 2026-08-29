-- ============================================================
-- Migration 002: Add display_currency to portfolio_data
-- Run in your Supabase SQL editor after 001_portfolio_sync.sql
-- ============================================================

ALTER TABLE portfolio_data
  ADD COLUMN IF NOT EXISTS display_currency text NOT NULL DEFAULT 'USD';
