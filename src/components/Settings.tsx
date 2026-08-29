import { useState } from 'react';
import {
  Save, Key, Shield, AlertCircle, Receipt,
  Upload, Database, Settings2, Trash2, RotateCcw,
  Target, Wallet, ServerCrash, CheckCircle2,
  Cloud, CloudDownload, CloudUpload, Globe,
} from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';
import { useToast } from './Toast';
import { PortfolioUpload } from './PortfolioUpload';
import { isSupabaseConfigured } from '../lib/cloudSync';
import { CURRENCIES } from '../lib/currencies';
import type { RiskLevel, TaxBracket } from '../types';

type AdminTab = 'general' | 'preferences' | 'portfolio' | 'data';

const ADMIN_TABS: Array<{ id: AdminTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'general',     label: 'General',          icon: Settings2 },
  { id: 'preferences', label: 'Preferences',       icon: Receipt },
  { id: 'portfolio',   label: 'Portfolio & Import', icon: Upload },
  { id: 'data',        label: 'Data & Admin',       icon: Database },
];

const RISK_OPTIONS: Array<{ value: RiskLevel; label: string; desc: string; color: string }> = [
  { value: 'low',         label: 'Low',         desc: 'Capital preservation, bonds & blue chips',    color: 'border-blue-700 text-blue-400' },
  { value: 'medium',      label: 'Medium',       desc: 'Balanced equities, diversified ETFs',        color: 'border-yellow-700 text-yellow-400' },
  { value: 'medium-high', label: 'Medium-High',  desc: 'Growth ETFs, small/mid cap, some forex',     color: 'border-orange-700 text-orange-400' },
  { value: 'high',        label: 'High',         desc: 'Concentrated positions, leverage, exotics', color: 'border-red-700 text-red-400' },
];

export function Settings() {
  const {
    apiKeys, setApiKeys, portfolio, setPortfolio,
    userPreferences, setUserPreferences,
    signals, setSignals, clearMarketNews, setForexPairs, setIndicators, setQuotes,
    marketNews, cloudSync, syncToCloud, loadFromCloud,
  } = useInvestmentStore();
  const toast = useToast();

  const [adminTab, setAdminTab] = useState<AdminTab>('general');
  const [keys, setKeys] = useState({ ...apiKeys });
  const [showKeys, setShowKeys] = useState(false);
  const [prefs, setPrefs] = useState({ ...userPreferences });
  const [goalValue, setGoalValue] = useState(portfolio.goalValue);
  const [cashPosition, setCashPosition] = useState(portfolio.cashPosition ?? 0);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const saveGeneral = () => {
    setApiKeys(keys);
    toast.success('API keys saved');
  };

  const savePreferences = () => {
    setUserPreferences(prefs);
    toast.success('Preferences saved');
  };

  const savePortfolioGoals = () => {
    setPortfolio({ ...portfolio, goalValue, cashPosition });
    toast.success('Portfolio goals updated');
  };

  function clearCache() {
    const keys = Object.keys(sessionStorage).filter(
      (k) => k.startsWith('px:') || k.startsWith('q:') || k.startsWith('fh:') || k.startsWith('fund:')
    );
    keys.forEach((k) => sessionStorage.removeItem(k));
    toast.success(`Cleared ${keys.length} cached entries`);
  }

  function handleReset(action: string) {
    if (confirmReset !== action) { setConfirmReset(action); return; }
    setConfirmReset(null);
    if (action === 'signals')  { setSignals([]); toast.success('Signals cleared'); }
    if (action === 'news')     { clearMarketNews(); toast.success('News cleared'); }
    if (action === 'analysis') { setIndicators({}); setQuotes({}); setForexPairs([]); clearCache(); toast.success('Analysis data cleared'); }
    if (action === 'portfolio') {
      setPortfolio({ ...portfolio, holdings: [], totalValue: 0, cashPosition: 0 });
      setSignals([]);
      setIndicators({});
      setQuotes({});
      toast.success('Portfolio reset');
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-white font-bold text-lg">Settings &amp; Admin</h2>
        <p className="text-gray-500 text-sm">Configure your investment advisor, manage portfolio data, and control app behaviour</p>
      </div>

      {/* ── Sub-nav ── */}
      <nav className="flex gap-1 bg-gray-900/60 border border-gray-800 rounded-xl p-1">
        {ADMIN_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setAdminTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              adminTab === id
                ? 'bg-brand-700 text-white shadow'
                : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/60'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </nav>

      {/* ════════════════════════════════════════════════
          TAB: GENERAL — API Keys + Data Sources
          ════════════════════════════════════════════════ */}
      {adminTab === 'general' && (
        <div className="space-y-6">

          {/* API Keys */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-300 font-semibold flex items-center gap-2">
                <Key className="w-4 h-4 text-brand-400" />
                API Keys
              </h3>
              <button onClick={() => setShowKeys((v) => !v)} className="text-xs text-gray-500 hover:text-gray-300">
                {showKeys ? 'Hide' : 'Show'} values
              </button>
            </div>

            <div className="flex items-start gap-2 text-amber-200 text-xs bg-amber-950/30 border border-amber-800 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
              Keys are stored in your browser's localStorage only — never sent anywhere except the respective API endpoints.
            </div>

            {([
              { key: 'alphaVantage' as const, label: 'Alpha Vantage', desc: 'Free at alphavantage.co — forex TA, news sentiment', placeholder: 'demo', link: 'https://www.alphavantage.co/support/#api-key' },
              { key: 'polygon'      as const, label: 'Polygon.io',    desc: 'Free at polygon.io — price history fallback',          placeholder: 'Enter your Polygon key', link: 'https://polygon.io/' },
              { key: 'finnhub'      as const, label: 'Finnhub',       desc: 'Free at finnhub.io — news, quotes, insider activity, earnings, fundamentals. Required for full signal analysis.', placeholder: 'Enter your Finnhub key', link: 'https://finnhub.io/' },
            ] as const).map(({ key, label, desc, placeholder, link }) => (
              <div key={key}>
                <label className="text-sm text-gray-400 mb-1 flex items-center justify-between">
                  <span>{label}</span>
                  <a href={link} target="_blank" rel="noreferrer" className="text-xs text-brand-400 hover:text-brand-300">Get free key →</a>
                </label>
                <p className="text-xs text-gray-600 mb-1">{desc}</p>
                <input
                  type={showKeys ? 'text' : 'password'}
                  value={keys[key]}
                  onChange={(e) => setKeys({ ...keys, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-brand-500 focus:outline-none"
                />
              </div>
            ))}

            <div className="bg-gray-800/50 rounded-lg p-3 text-xs text-gray-400">
              <strong className="text-gray-300">Supabase:</strong> Set{' '}
              <code className="text-brand-400">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-brand-400">VITE_SUPABASE_ANON_KEY</code> in your <code>.env</code> file.
              The AI Advisor also needs <code className="text-brand-400">ANTHROPIC_API_KEY</code> in your Supabase secrets.
            </div>

            <button onClick={saveGeneral} className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
              <Save className="w-4 h-4" /> Save API Keys
            </button>
          </section>

          {/* Data Sources */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-gray-300 font-semibold">Data Sources</h3>
            <div className="space-y-2 text-sm">
              {[
                { source: 'Yahoo Finance (proxy)', purpose: 'Real-time stock/ETF quotes & price history', tier: 'Free' },
                { source: 'ExchangeRate-API',       purpose: 'Live forex rates (base USD)',               tier: 'Free, no key' },
                { source: 'Alpha Vantage',          purpose: 'Forex TA, news sentiment',                  tier: 'Free 25 req/day' },
                { source: 'Polygon.io',             purpose: 'Price history fallback',                    tier: 'Free 5 req/min' },
                { source: 'Finnhub',                purpose: 'News, quotes, insider, earnings, fundamentals', tier: 'Free 60 req/min' },
                { source: 'Supabase + Claude',      purpose: 'AI portfolio analysis & chat',              tier: 'Your plan' },
              ].map(({ source, purpose, tier }) => (
                <div key={source} className="flex items-start justify-between gap-4">
                  <div>
                    <span className="text-white font-medium">{source}</span>
                    <span className="text-gray-500 ml-2 text-xs">{purpose}</span>
                  </div>
                  <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full shrink-0">{tier}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Disclaimer */}
          <div className="border border-gray-700 rounded-2xl p-5 text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-400">DISCLAIMER:</strong> My Investment Advisor is an <strong>educational tool</strong> only.
            Nothing displayed constitutes professional investment advice, a solicitation to buy or sell securities, or a guarantee of returns.
            Past performance does not guarantee future results. Always consult a licensed financial advisor.
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: PREFERENCES — Tax, Position Sizing, Risk
          ════════════════════════════════════════════════ */}
      {adminTab === 'preferences' && (
        <div className="space-y-6">

          {/* Display Currency */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-brand-400" />
              Display Currency
            </h3>
            <p className="text-xs text-gray-500">
              All portfolio values, P&amp;L, and position sizes are stored in USD internally.
              Select a currency to convert all displayed amounts using live exchange rates.
            </p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(CURRENCIES).map(([code, { symbol, name }]) => (
                <button
                  key={code}
                  onClick={() => setPrefs({ ...prefs, displayCurrency: code })}
                  title={name}
                  className={`px-3 py-2 rounded-lg text-sm border transition-all font-mono ${
                    (prefs.displayCurrency ?? 'USD') === code
                      ? 'border-brand-500 text-brand-300 bg-brand-900/20'
                      : 'border-gray-700 text-gray-500 hover:border-gray-500'
                  }`}
                >
                  {symbol} {code}
                </button>
              ))}
            </div>
            {(prefs.displayCurrency ?? 'USD') !== 'USD' && (
              <p className="text-xs text-gray-600">
                Exchange rates fetched from ExchangeRate-API (updated hourly, cached 1 hr).
              </p>
            )}
          </section>

          {/* Tax & Trading */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-brand-400" />
              Tax &amp; Trading Preferences
            </h3>
            <p className="text-xs text-gray-500">Used to flag short-term vs long-term tax treatment on open positions. Never shared externally.</p>

            {/* Tax country */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Tax Country</label>
              <div className="flex gap-2 flex-wrap">
                {(['US', 'UK', 'AU', 'Other'] as const).map((c) => (
                  <button key={c} onClick={() => setPrefs({ ...prefs, taxCountry: c })}
                    className={`px-4 py-2 rounded-lg text-sm border transition-all ${prefs.taxCountry === c ? 'border-brand-500 text-brand-300 bg-brand-900/20' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Tax bracket */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Income Tax Bracket</label>
              <div className="flex gap-2 flex-wrap">
                {(['10%', '12%', '22%', '24%', '32%', '35%', '37%'] as TaxBracket[]).map((b) => (
                  <button key={b} onClick={() => setPrefs({ ...prefs, taxBracket: b })}
                    className={`px-4 py-2 rounded-lg text-sm border transition-all ${prefs.taxBracket === b ? 'border-brand-500 text-brand-300 bg-brand-900/20' : 'border-gray-700 text-gray-500 hover:border-gray-500'}`}>
                    {b}
                  </button>
                ))}
              </div>
              {prefs.taxCountry === 'US' && (
                <p className="text-xs text-gray-600 mt-2">
                  US long-term capital gains: {prefs.taxBracket === '10%' || prefs.taxBracket === '12%' ? '0%' : prefs.taxBracket === '22%' || prefs.taxBracket === '24%' || prefs.taxBracket === '32%' ? '15%' : '20%'}
                  {' '}— vs short-term (ordinary income) rate: {prefs.taxBracket}.
                </p>
              )}
            </div>

            {/* Prefer long-term toggle */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-gray-300 font-medium">Flag positions approaching 1-year mark</div>
                <div className="text-xs text-gray-500 mt-0.5">Shows a tax note when a holding is 11+ months old, reminding you to hold for long-term capital gains treatment.</div>
              </div>
              <button onClick={() => setPrefs({ ...prefs, preferLongTerm: !prefs.preferLongTerm })}
                role="switch" aria-checked={prefs.preferLongTerm}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors ${prefs.preferLongTerm ? 'bg-brand-500' : 'bg-gray-700'}`}>
                <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${prefs.preferLongTerm ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          </section>

          {/* Position Sizing */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-400" />
              Position Sizing
            </h3>
            <p className="text-xs text-gray-500">Used to calculate minimum share count and investment amount based on 1.5× ATR stop-loss.</p>
            <div>
              <label className="text-sm text-gray-300 font-medium">Risk per trade (USD)</label>
              <div className="text-xs text-gray-500 mt-0.5">Maximum dollar amount you're willing to lose on a single trade.</div>
              <div className="flex items-center gap-3 mt-2">
                <input
                  type="number" min={50} max={50000} step={50}
                  value={prefs.riskPerTrade ?? 500}
                  onChange={(e) => setPrefs({ ...prefs, riskPerTrade: Math.max(50, Number(e.target.value)) })}
                  className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
                />
                <span className="text-xs text-gray-500">USD · Min $50</span>
              </div>
              <p className="text-xs text-gray-600 mt-2">Example: $500 risk with 1.5× ATR stop of $2.00 → buy at least 250 shares.</p>
            </div>
          </section>

          {/* Risk Tolerance */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-400" />
              Risk Tolerance
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {RISK_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setPortfolio({ ...portfolio, riskTolerance: opt.value })}
                  className={`border rounded-xl p-4 text-left transition-all ${
                    portfolio.riskTolerance === opt.value ? `${opt.color} bg-gray-800` : 'border-gray-700 text-gray-500 hover:border-gray-500'
                  }`}>
                  <div className="font-semibold mb-1">{opt.label}</div>
                  <div className="text-xs text-gray-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          </section>

          <button onClick={savePreferences} className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
            <Save className="w-4 h-4" /> Save Preferences
          </button>
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: PORTFOLIO & IMPORT
          ════════════════════════════════════════════════ */}
      {adminTab === 'portfolio' && (
        <div className="space-y-6">

          {/* Investment Goals */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-5">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-brand-400" />
              Investment Goals
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <label className="text-sm text-gray-400 block mb-1">Investment Goal (USD)</label>
                <p className="text-xs text-gray-600 mb-2 flex-1">Portfolio value you're aiming to reach. Shown in the header progress bar.</p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number" min={10000} step={10000}
                    value={goalValue}
                    onChange={(e) => setGoalValue(Math.max(10000, Number(e.target.value)))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-sm text-gray-400 block mb-1">Cash / Uninvested (USD)</label>
                <p className="text-xs text-gray-600 mb-2 flex-1">Cash on hand not currently in positions. Included in total value.</p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 text-sm">$</span>
                  <input
                    type="number" min={0} step={1000}
                    value={cashPosition}
                    onChange={(e) => setCashPosition(Math.max(0, Number(e.target.value)))}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <button onClick={savePortfolioGoals} className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm">
              <Save className="w-4 h-4" /> Save Goals
            </button>
          </section>

          {/* Portfolio Import (PortfolioUpload) */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-brand-400" />
              Import Portfolio Holdings
            </h3>
            <p className="text-xs text-gray-500">
              Upload a screenshot of your brokerage portfolio, paste CSV data, or enter holdings manually.
              Imported data overwrites your current holdings.
            </p>
          </section>

          <PortfolioUpload />
        </div>
      )}

      {/* ════════════════════════════════════════════════
          TAB: DATA & ADMIN
          ════════════════════════════════════════════════ */}
      {adminTab === 'data' && (
        <div className="space-y-6">

          {/* ── Cloud Sync ── */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Cloud className="w-4 h-4 text-brand-400" />
              Cloud Sync (Supabase)
            </h3>

            {!isSupabaseConfigured() ? (
              <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800 rounded-lg p-3 text-xs text-amber-200">
                <AlertCircle className="w-4 h-4 mt-0.5 text-amber-400 shrink-0" />
                <div>
                  Supabase not configured. Add{' '}
                  <code className="text-brand-400">VITE_SUPABASE_URL</code> and{' '}
                  <code className="text-brand-400">VITE_SUPABASE_ANON_KEY</code> to your{' '}
                  <code>.env</code> file, then run the migration script in{' '}
                  <code className="text-brand-400">supabase/migrations/001_portfolio_sync.sql</code>.
                </div>
              </div>
            ) : (
              <>
                {/* Status row */}
                <div className="flex items-center gap-3 text-sm">
                  <span className={`flex items-center gap-1.5 font-medium ${
                    cloudSync.status === 'success' ? 'text-emerald-400'
                    : cloudSync.status === 'syncing' ? 'text-brand-400'
                    : cloudSync.status === 'error'   ? 'text-red-400'
                    : 'text-gray-500'
                  }`}>
                    {cloudSync.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {cloudSync.status === 'syncing' && <RotateCcw className="w-3.5 h-3.5 animate-spin" />}
                    {cloudSync.status === 'error'   && <AlertCircle className="w-3.5 h-3.5" />}
                    {cloudSync.status === 'idle'    && <Cloud className="w-3.5 h-3.5" />}
                    {{
                      idle:    'Not synced this session',
                      syncing: 'Syncing…',
                      success: 'Synced',
                      error:   cloudSync.error ?? 'Sync error',
                    }[cloudSync.status]}
                  </span>
                  {cloudSync.lastSyncedAt && (
                    <span className="text-xs text-gray-600">
                      Last: {new Date(cloudSync.lastSyncedAt).toLocaleString()}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  <strong className="text-gray-400">Sync Now</strong> — push your current holdings, goals, and cash position to Supabase.
                  Holdings are also auto-synced 3 seconds after any change.
                  <br />
                  <strong className="text-gray-400">Load from Cloud</strong> — pull the last saved snapshot (use when opening on a new device or browser).
                </p>

                <div className="flex gap-3 flex-wrap">
                  <button
                    onClick={async () => {
                      await syncToCloud();
                      toast.success('Portfolio synced to cloud');
                    }}
                    disabled={cloudSync.status === 'syncing'}
                    className="flex items-center gap-2 bg-brand-700 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <CloudUpload className="w-4 h-4" />
                    Sync Now
                  </button>
                  <button
                    onClick={async () => {
                      const loaded = await loadFromCloud();
                      if (loaded) toast.success('Portfolio loaded from cloud');
                      else toast.warning('No cloud data found');
                    }}
                    disabled={cloudSync.status === 'syncing'}
                    className="flex items-center gap-2 bg-gray-800 border border-gray-700 hover:border-gray-500 disabled:opacity-50 text-gray-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                  >
                    <CloudDownload className="w-4 h-4" />
                    Load from Cloud
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Cache stats */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <ServerCrash className="w-4 h-4 text-brand-400" />
              Session Cache
            </h3>
            <p className="text-xs text-gray-500">
              Price history, quotes, news, and fundamentals are cached in sessionStorage for 15 min – 6 hours.
              Clear the cache to force fresh data on next load.
            </p>
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-400">
                <span className="font-bold text-white">
                  {Object.keys(sessionStorage).filter((k) => k.startsWith('px:') || k.startsWith('q:') || k.startsWith('fh:') || k.startsWith('fund:')).length}
                </span>
                {' '}cached entries
              </div>
              <button onClick={clearCache}
                className="flex items-center gap-2 text-sm bg-gray-800 border border-gray-700 hover:border-gray-500 text-gray-300 px-4 py-2 rounded-lg transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Clear Cache
              </button>
            </div>
          </section>

          {/* Data actions */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-4">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-orange-400" />
              Data Management
            </h3>
            <p className="text-xs text-gray-500">
              These actions clear stored data from your browser. Your settings and API keys are not affected.
            </p>

            <div className="space-y-3">
              {[
                {
                  action: 'signals',
                  label: 'Clear Buy/Sell Signals',
                  desc: `Remove all ${signals.length} cached signal records. They will regenerate when you run analysis.`,
                  danger: false,
                },
                {
                  action: 'news',
                  label: 'Clear Market News',
                  desc: `Remove all ${marketNews.length} stored news articles.`,
                  danger: false,
                },
                {
                  action: 'analysis',
                  label: 'Clear Analysis Cache',
                  desc: 'Clear indicators, quotes, and Forex pair data from memory. Fresh on next reload.',
                  danger: false,
                },
                {
                  action: 'portfolio',
                  label: 'Reset Portfolio',
                  desc: 'Remove ALL holdings and reset portfolio value to zero. This cannot be undone.',
                  danger: true,
                },
              ].map(({ action, label, desc, danger }) => (
                <div key={action} className={`flex items-start justify-between gap-4 rounded-xl border p-4 ${
                  danger ? 'border-red-900/50 bg-red-950/10' : 'border-gray-800 bg-gray-900/30'
                }`}>
                  <div>
                    <div className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-gray-300'}`}>{label}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                  </div>
                  <button
                    onClick={() => handleReset(action)}
                    className={`shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      confirmReset === action
                        ? 'border-red-600 bg-red-900/40 text-red-300 font-bold'
                        : danger
                          ? 'border-red-800 text-red-400 hover:bg-red-900/20'
                          : 'border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}
                  >
                    {confirmReset === action ? (
                      <><AlertCircle className="w-3 h-3" /> Confirm?</>
                    ) : (
                      <><Trash2 className="w-3 h-3" /> Clear</>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {confirmReset && (
              <button onClick={() => setConfirmReset(null)} className="text-xs text-gray-500 hover:text-gray-300">
                ✕ Cancel
              </button>
            )}
          </section>

          {/* App stats */}
          <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 space-y-3">
            <h3 className="text-gray-300 font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              App Status
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-sm">
              {[
                { label: 'Holdings',  value: portfolio.holdings.length },
                { label: 'Signals',   value: signals.length },
                { label: 'News',      value: marketNews.length },
                { label: 'Cache',     value: Object.keys(sessionStorage).filter((k) => k.startsWith('px:') || k.startsWith('q:') || k.startsWith('fh:') || k.startsWith('fund:')).length },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-800/60 rounded-xl p-3">
                  <div className="text-xl font-bold text-white">{value}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
