-- Run this once in your Supabase SQL Editor
-- Dashboard → Database → SQL Editor → New query → paste → Run

create table if not exists ibkr_positions (
  id             uuid default gen_random_uuid() primary key,
  account_id     text not null,
  ticker         text not null,
  name           text,
  shares         numeric,
  market_value   numeric not null,
  avg_cost       numeric,
  cost_basis     numeric,
  asset_class    text default 'stock',
  category       text default 'n/a',
  currency       text default 'USD',
  unrealized_pnl numeric,
  synced_at      timestamptz default now(),
  unique (account_id, ticker)
);

create table if not exists ibkr_sync_status (
  id             text primary key,
  account_ids    text[],
  position_count integer,
  cash_position  numeric,
  synced_at      timestamptz default now()
);

alter table ibkr_positions   enable row level security;
alter table ibkr_sync_status enable row level security;

create policy "allow all" on ibkr_positions   for all using (true) with check (true);
create policy "allow all" on ibkr_sync_status for all using (true) with check (true);
