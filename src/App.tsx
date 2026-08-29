import {
  LayoutDashboard, BarChart2, DollarSign,
  Brain, TrendingUp, Settings as SettingsIcon, ScanLine, Home, Download, Cloud, RotateCcw, BookMarked, Zap, Activity,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { useInvestmentStore } from './store/investmentStore';
import { isSupabaseConfigured } from './lib/cloudSync';
import { PortfolioDashboard } from './components/PortfolioDashboard';
import { MarketAnalysis } from './components/MarketAnalysis';
import { ForexAnalysis } from './components/ForexAnalysis';
import { AIAdvisor } from './components/AIAdvisor';
import { BuySellSignals } from './components/BuySellSignals';
import { MarketScanner } from './components/MarketScanner';
import { Settings } from './components/Settings';
import { RealEstateAnalysis } from './components/RealEstateAnalysis';
import { DayTraderPlaybook } from './components/DayTraderPlaybook';
import { OptionsPlaybook } from './components/OptionsPlaybook';
import { SwingTradingPlaybook } from './components/SwingTradingPlaybook';
import { Toast } from './components/Toast';
import { NewsTicker } from './components/NewsTicker';
import type { AppTab } from './types';

const TABS: Array<{
  id: AppTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'portfolio',  label: 'Portfolio',  icon: LayoutDashboard },
  { id: 'analysis',   label: 'Analysis',   icon: BarChart2 },
  { id: 'forex',      label: 'Forex',      icon: DollarSign },
  { id: 'advisor',    label: 'AI Advisor', icon: Brain },
  { id: 'signals',   label: 'Signals',  icon: TrendingUp },
  { id: 'scanner',    label: 'Scanner',     icon: ScanLine },
  { id: 'playbook',   label: 'Playbook',    icon: BookMarked },
  { id: 'options',    label: 'Options Trading', icon: Zap },
  { id: 'swing',      label: 'Swing Trading',   icon: Activity },
  { id: 'realestate', label: 'Real Estate', icon: Home },
  { id: 'settings',   label: 'Settings',    icon: SettingsIcon },
];

function formatCurrency(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  return `$${(v / 1_000).toFixed(1)}K`;
}

export default function App() {
  const { activeTab, setActiveTab, setSignalFilter, portfolio, signals, syncToCloud, loadFromCloud, cloudSync } = useInvestmentStore();

  // ── Auto-load from cloud on first mount when local portfolio is empty ──────
  // Only fires once; if the user already has local holdings we skip the load to
  // avoid overwriting in-progress edits with an older cloud snapshot.
  useEffect(() => {
    if (isSupabaseConfigured() && portfolio.holdings.length === 0) {
      loadFromCloud();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-sync to cloud 5 s after any holdings change ─────────────────────
  // The 5-second delay batches rapid consecutive edits into a single write.
  useEffect(() => {
    if (!isSupabaseConfigured() || portfolio.holdings.length === 0) return;
    const timer = setTimeout(() => { syncToCloud(); }, 5_000);
    return () => clearTimeout(timer);
  }, [portfolio.holdings, syncToCloud]);

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e as any); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => { setInstalled(true); setInstallPrompt(null); });
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const handleInstall = async () => {
    if (!installPrompt) return;
    await (installPrompt as any).prompt();
    setInstallPrompt(null);
  };

  const signalCounts = {
    buy: signals.filter((s) => s.action === 'STRONG_BUY' || s.action === 'BUY').length,
    sell: signals.filter((s) => s.action === 'STRONG_SELL' || s.action === 'SELL').length,
  };

  const goalProgress = Math.min((portfolio.totalValue / portfolio.goalValue) * 100, 100);

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">

      {/* ── Top Header ── */}
      <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-indigo-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-bold text-white text-sm leading-tight">My Investment Advisor</div>
              <div className="text-xs text-gray-500 leading-tight">Investment Intelligence</div>
            </div>
          </div>

          {/* Goal progress bar */}
          <div className="flex-1 hidden md:block mx-6">
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500 shrink-0">
                {formatCurrency(portfolio.totalValue)} → {formatCurrency(portfolio.goalValue)}
              </div>
              <div className="flex-1 bg-gray-800 rounded-full h-2 max-w-xs">
                <div
                  className="bg-gradient-to-r from-brand-500 to-teal-400 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${goalProgress}%` }}
                />
              </div>
              <div className="text-xs text-brand-400 font-semibold shrink-0">
                {goalProgress.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* Signal badges */}
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {signalCounts.buy > 0 && (
              <button
                onClick={() => { setSignalFilter('BUY_ALL'); setActiveTab('signals'); }}
                className="text-xs bg-emerald-900 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                {signalCounts.buy} Buy
              </button>
            )}
            {signalCounts.sell > 0 && (
              <button
                onClick={() => { setSignalFilter('SELL_ALL'); setActiveTab('signals'); }}
                className="text-xs bg-red-900 text-red-300 border border-red-700 px-2 py-0.5 rounded-full hover:bg-red-800 transition-colors cursor-pointer"
              >
                {signalCounts.sell} Sell
              </button>
            )}
          </div>

          {/* Cloud sync status — visible when Supabase is configured */}
          {isSupabaseConfigured() && (
            <button
              onClick={() => syncToCloud()}
              title={cloudSync.lastSyncedAt
                ? `Last synced ${new Date(cloudSync.lastSyncedAt).toLocaleTimeString()} · Click to sync now`
                : 'Click to sync portfolio to cloud'}
              className={`hidden sm:flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors shrink-0 ${
                cloudSync.status === 'success' ? 'border-emerald-800 text-emerald-500 hover:bg-emerald-950' :
                cloudSync.status === 'error'   ? 'border-red-800 text-red-500 hover:bg-red-950' :
                cloudSync.status === 'syncing' ? 'border-brand-700 text-brand-400' :
                'border-gray-700 text-gray-500 hover:bg-gray-800'
              }`}
            >
              {cloudSync.status === 'syncing'
                ? <RotateCcw className="w-2.5 h-2.5 animate-spin" />
                : <Cloud className="w-2.5 h-2.5" />}
              {cloudSync.status === 'syncing' ? 'Syncing…' :
               cloudSync.status === 'success' ? 'Synced' :
               cloudSync.status === 'error'   ? 'Sync error' : 'Cloud'}
            </button>
          )}

          {installPrompt && !installed && (
            <button
              onClick={handleInstall}
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-brand-900/50 border border-brand-700 text-brand-300 hover:bg-brand-800/60 transition-colors shrink-0"
              title="Install as app on this device"
            >
              <Download className="w-3 h-3" />
              Install App
            </button>
          )}
        </div>

        {/* ── Tab bar ── */}
        <nav className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto pb-0.5">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg whitespace-nowrap transition-colors border-b-2 ${
                activeTab === id
                  ? 'border-brand-500 text-brand-400 bg-brand-950/30'
                  : 'border-transparent text-gray-300 hover:text-white hover:bg-gray-700/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Live news + index ticker ── */}
      <NewsTicker />

      {/* ── Main content ── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6 flex flex-col min-h-0 overflow-y-auto">
        {/* All tabs are always mounted — hidden via CSS display:none, not unmounted.
            This preserves each tab's React state across switches and avoids
            re-fetching market data every time the user navigates back. */}
        <div className={activeTab === 'portfolio' ? 'contents' : 'hidden'}><PortfolioDashboard /></div>
        <div className={activeTab === 'analysis'  ? 'contents' : 'hidden'}><MarketAnalysis /></div>
        <div className={activeTab === 'forex'     ? 'contents' : 'hidden'}><ForexAnalysis /></div>
        <div className={activeTab === 'advisor'   ? 'contents' : 'hidden'}><AIAdvisor /></div>
        <div className={activeTab === 'signals'   ? 'contents' : 'hidden'}><BuySellSignals /></div>
        <div className={activeTab === 'scanner'    ? 'contents' : 'hidden'}><MarketScanner /></div>
        <div className={activeTab === 'playbook'   ? 'contents' : 'hidden'}><DayTraderPlaybook /></div>
        <div className={activeTab === 'options'    ? 'contents' : 'hidden'}><OptionsPlaybook /></div>
        <div className={activeTab === 'swing'      ? 'contents' : 'hidden'}><SwingTradingPlaybook /></div>
        <div className={activeTab === 'realestate' ? 'contents' : 'hidden'}><RealEstateAnalysis /></div>
        <div className={activeTab === 'settings'   ? 'contents' : 'hidden'}><Settings /></div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-900 py-3 text-center text-xs text-gray-700">
        My Investment Advisor · Informational &amp; purposes only · Not registered investment advice
        · Always verify data with your broker
      </footer>

      <Toast />
    </div>
  );
}
