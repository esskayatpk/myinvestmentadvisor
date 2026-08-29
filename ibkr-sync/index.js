/**
 * IBKR → Supabase Sync Script
 * ─────────────────────────────────────────────────────────────────────────────
 * SETUP:
 *   1. Download & run the IBKR Client Portal Gateway:
 *      https://www.interactivebrokers.com/en/trading/ib-api.php
 *      Run:  cd clientportal.gw && bin/run.sh root/conf.yaml   (Mac/Linux)
 *            cd clientportal.gw && bin\run.bat root\conf.yaml  (Windows)
 *   2. Open https://localhost:5000 in your browser and log in to IBKR
 *   3. Copy .env.example → .env and fill in your Supabase credentials
 *   4. Run:  npm install && npm run sync
 *
 * The script will upsert your IBKR positions into the `ibkr_positions` Supabase
 * table. The Market Advisor app will then offer a "Load from IBKR" button.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js';
import https from 'https';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env (simple parser, no dotenv dependency needed) ───────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '.env');
  const rootEnvPath = resolve(__dirname, '..', '.env');
  const file = existsSync(envPath) ? envPath : existsSync(rootEnvPath) ? rootEnvPath : null;
  if (!file) throw new Error('No .env file found. Copy .env.example → .env and fill in values.');
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
    if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const IBKR_GATEWAY = process.env.IBKR_GATEWAY_URL ?? 'https://localhost:5000';
const WATCH_MODE   = process.argv.includes('--watch');
const SYNC_INTERVAL_MS = Number(process.env.IBKR_SYNC_INTERVAL_SEC ?? 300) * 1000; // default 5 min

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// IBKR gateway uses a self-signed certificate — disable TLS verification for localhost
const agent = new https.Agent({ rejectUnauthorized: false });

// ── IBKR API helpers ─────────────────────────────────────────────────────────

async function ibkrGet(path) {
  const url = `${IBKR_GATEWAY}/v1/api${path}`;
  const res = await fetch(url, { agent });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IBKR ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function getAccounts() {
  const data = await ibkrGet('/portfolio/accounts');
  return data.map(a => a.accountId ?? a.id);
}

async function getPositions(accountId) {
  // IBKR paginates positions starting at page 0
  const positions = [];
  let page = 0;
  while (true) {
    const data = await ibkrGet(`/portfolio/${accountId}/positions/${page}`);
    if (!data || data.length === 0) break;
    positions.push(...data);
    page++;
  }
  return positions;
}

async function getAccountSummary(accountId) {
  return ibkrGet(`/portfolio/${accountId}/summary`);
}

// ── Map IBKR asset class → app's AssetClass type ─────────────────────────────
function mapAssetClass(ibkrAssetClass) {
  const map = {
    'STK': 'stock',
    'ETF': 'etf',
    'FUND': 'fund',
    'BOND': 'bond',
    'CASH': 'forex',
    'CRYPTO': 'crypto',
    'OPT': 'stock',   // options treated as stock for simplicity
    'FUT': 'stock',
  };
  return map[ibkrAssetClass?.toUpperCase()] ?? 'stock';
}

// ── Map market cap / sector to category ─────────────────────────────────────
function guessCategory(position) {
  const mktCap = position.mktValue ?? 0;
  const assetClass = mapAssetClass(position.assetClass);
  if (assetClass === 'etf') return 'n/a';
  if (assetClass === 'forex') return 'n/a';
  if (mktCap > 200_000) return 'mega-cap';
  if (mktCap > 10_000) return 'large-cap';
  if (mktCap > 2_000)  return 'mid-cap';
  if (mktCap > 300)    return 'small-cap';
  return 'micro-cap';
}

// ── Main sync function ───────────────────────────────────────────────────────
async function sync() {
  console.log(`\n🔄  Syncing IBKR → Supabase  [${new Date().toLocaleTimeString()}]`);

  // 1. Authenticate check
  let accounts;
  try {
    accounts = await getAccounts();
  } catch (err) {
    console.error('❌  Cannot reach IBKR gateway. Is it running and are you logged in?');
    console.error('   ', err.message);
    console.error('\n   Steps to fix:');
    console.error('   1. Start the gateway: bin/run.bat root\\conf.yaml');
    console.error('   2. Open https://localhost:5000 and log in');
    console.error('   3. Run this script again\n');
    return false;
  }

  console.log(`✅  Connected to IBKR. Accounts: ${accounts.join(', ')}`);

  // 2. Fetch positions for all accounts
  const allRows = [];
  for (const accountId of accounts) {
    let positions;
    try {
      positions = await getPositions(accountId);
    } catch (err) {
      console.error(`⚠️   Could not fetch positions for ${accountId}: ${err.message}`);
      continue;
    }

    console.log(`   ${accountId}: ${positions.length} positions`);

    for (const pos of positions) {
      const ticker = pos.ticker ?? pos.contractDesc ?? pos.symbol ?? 'UNKNOWN';
      const marketValue = Math.abs(pos.mktValue ?? pos.marketValue ?? 0);
      if (marketValue < 0.01) continue; // skip zero/tiny positions

      allRows.push({
        account_id:   accountId,
        ticker:       ticker.toUpperCase().replace(/\s+/g, ''),
        name:         pos.companyName ?? pos.description ?? ticker,
        shares:       Math.abs(pos.position ?? pos.pos ?? 0),
        market_value: marketValue,
        avg_cost:     pos.avgCost ?? pos.averageCost ?? null,
        cost_basis:   pos.costBasisPrice ? Math.abs(pos.position ?? 1) * pos.costBasisPrice : null,
        asset_class:  mapAssetClass(pos.assetClass ?? pos.secType),
        category:     guessCategory(pos),
        currency:     pos.currency ?? 'USD',
        unrealized_pnl: pos.unrealizedPnl ?? pos.unrealPnl ?? null,
        synced_at:    new Date().toISOString(),
      });
    }
  }

  if (allRows.length === 0) {
    console.warn('⚠️   No positions found. If you have positions, check that you are logged in to the gateway.');
    return false;
  }

  // 3. Get cash balance
  let cashPosition = 0;
  try {
    const summary = await getAccountSummary(accounts[0]);
    cashPosition = Math.abs(summary?.cashbalance?.amount ?? summary?.TotalCashValue?.amount ?? 0);
  } catch { /* not critical */ }

  // 4. Upsert to Supabase
  const { error: upsertError } = await supabase
    .from('ibkr_positions')
    .upsert(allRows, { onConflict: 'account_id,ticker' });

  if (upsertError) {
    // Table might not exist yet — print the SQL to create it
    if (upsertError.code === '42P01') {
      console.error('\n❌  Table `ibkr_positions` does not exist in Supabase.');
      console.error('   Run this SQL in your Supabase SQL Editor:\n');
      console.error(CREATE_TABLE_SQL);
      console.error('\n   Then run this script again.\n');
    } else {
      console.error('❌  Supabase upsert error:', upsertError.message);
    }
    return false;
  }

  // 5. Write a sync-status record so the app knows data is fresh
  await supabase.from('ibkr_sync_status').upsert({
    id: accounts[0],
    account_ids: accounts,
    position_count: allRows.length,
    cash_position: cashPosition,
    synced_at: new Date().toISOString(),
  }, { onConflict: 'id' });

  const total = allRows.reduce((s, r) => s + r.market_value, 0);
  console.log(`✅  Synced ${allRows.length} positions  |  Total value: $${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  if (cashPosition > 0) console.log(`   Cash: $${cashPosition.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
  return true;
}

// ── SQL to create required tables (shown if missing) ────────────────────────
const CREATE_TABLE_SQL = `
-- Run this once in your Supabase SQL Editor (Database → SQL Editor → New query)

create table if not exists ibkr_positions (
  id            uuid default gen_random_uuid() primary key,
  account_id    text not null,
  ticker        text not null,
  name          text,
  shares        numeric,
  market_value  numeric not null,
  avg_cost      numeric,
  cost_basis    numeric,
  asset_class   text default 'stock',
  category      text default 'n/a',
  currency      text default 'USD',
  unrealized_pnl numeric,
  synced_at     timestamptz default now(),
  unique (account_id, ticker)
);

create table if not exists ibkr_sync_status (
  id            text primary key,
  account_ids   text[],
  position_count integer,
  cash_position numeric,
  synced_at     timestamptz default now()
);

-- Allow the anon key to read/write (adjust RLS as needed for your setup)
alter table ibkr_positions  enable row level security;
alter table ibkr_sync_status enable row level security;

create policy "allow all" on ibkr_positions  for all using (true) with check (true);
create policy "allow all" on ibkr_sync_status for all using (true) with check (true);
`;

// ── Entry point ──────────────────────────────────────────────────────────────
if (WATCH_MODE) {
  console.log(`👁   Watch mode — syncing every ${SYNC_INTERVAL_MS / 1000}s. Press Ctrl+C to stop.\n`);
  await sync();
  setInterval(sync, SYNC_INTERVAL_MS);
} else {
  const ok = await sync();
  process.exit(ok ? 0 : 1);
}
