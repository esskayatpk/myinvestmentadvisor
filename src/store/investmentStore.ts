import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Portfolio,
  Holding,
  TechnicalIndicators,
  Signal,
  ForexPairAnalysis,
  AIRecommendation,
  AppTab,
  ApiKeys,
  Toast,
  Quote,
  UserPreferences,
  CloudSyncState,
} from '../types';
import {
  syncPortfolioToCloud,
  loadPortfolioFromCloud,
  takePortfolioSnapshot,
  fetchPortfolioSnapshots,
} from '../lib/cloudSync';

const DEFAULT_PORTFOLIO: Portfolio = {
  holdings: [],
  totalValue: 500_000,
  goalValue: 1_000_000,
  riskTolerance: 'medium-high',
  lastUpdated: new Date().toISOString(),
  cashPosition: 0,
};

const DEFAULT_CLOUD_SYNC: CloudSyncState = {
  status: 'idle',
  lastSyncedAt: null,
  error: null,
  snapshots: [],
};

// Debounce handle for auto-sync after holdings/portfolio changes.
// Without this, every keystroke in the portfolio editor would fire a Supabase write.
let _syncDebounce: ReturnType<typeof setTimeout> | null = null;

interface InvestmentState {
  // ── Core data ──
  portfolio: Portfolio;
  quotes: Record<string, Quote>;            // ticker → latest quote
  indicators: Record<string, TechnicalIndicators>;  // ticker → indicators
  signals: Signal[];
  forexPairs: ForexPairAnalysis[];
  aiRecommendation: AIRecommendation | null;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string; image?: { data: string; mediaType: string } }>;
  marketNews: Array<{ id: string; headline: string; source: string; url?: string; tickers?: string[]; addedAt: string; sentiment?: 'bullish' | 'bearish' | 'neutral' }>;

  // ── UI state ──
  activeTab: AppTab;
  signalFilter: string;
  isLoading: Record<string, boolean>;
  toasts: Toast[];
  apiKeys: ApiKeys;
  userPreferences: UserPreferences;

  // ── Cloud sync ──
  cloudSync: CloudSyncState;

  // ── Actions ──
  setPortfolio: (portfolio: Portfolio) => void;
  addHolding: (holding: Holding) => void;
  updateHolding: (id: string, updates: Partial<Holding>) => void;
  removeHolding: (id: string) => void;
  setHoldings: (holdings: Holding[]) => void;
  setQuotes: (quotes: Record<string, Quote>) => void;
  setIndicators: (indicators: Record<string, TechnicalIndicators>) => void;
  setSignals: (signals: Signal[]) => void;
  setForexPairs: (pairs: ForexPairAnalysis[]) => void;
  setAIRecommendation: (rec: AIRecommendation) => void;
  setChatMessages: (msgs: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string; image?: { data: string; mediaType: string } }>) => void;
  addMarketNews: (item: Omit<InvestmentState['marketNews'][0], 'id' | 'addedAt'>) => void;
  removeMarketNews: (id: string) => void;
  clearMarketNews: () => void;
  setActiveTab: (tab: AppTab) => void;
  setSignalFilter: (filter: string) => void;
  setLoading: (key: string, value: boolean) => void;
  setApiKeys: (keys: Partial<ApiKeys>) => void;
  setUserPreferences: (prefs: Partial<UserPreferences>) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  recalcTotalValue: () => void;
  // Cloud sync actions
  syncToCloud: () => Promise<void>;
  loadFromCloud: () => Promise<boolean>;
  takeSnapshot: () => Promise<void>;
  loadSnapshots: (days?: number) => Promise<void>;
  setCloudSync: (patch: Partial<CloudSyncState>) => void;
}

// useInvestmentStore is the single global state container for the entire app.
// Zustand's persist middleware serialises the store to localStorage on every
// mutation, so data survives browser refreshes without any manual save step.
export const useInvestmentStore = create<InvestmentState>()(
  persist(
    (set, get) => ({
      portfolio: DEFAULT_PORTFOLIO,
      quotes: {},
      indicators: {},
      signals: [],
      forexPairs: [],
      aiRecommendation: null,
      chatMessages: [],
      marketNews: [],
      activeTab: 'portfolio',
      signalFilter: 'ALL',
      isLoading: {},
      toasts: [],
      cloudSync: DEFAULT_CLOUD_SYNC,
      apiKeys: {
        alphaVantage: import.meta.env.VITE_ALPHA_VANTAGE_KEY ?? 'demo',
        polygon: import.meta.env.VITE_POLYGON_KEY ?? '',
        finnhub: import.meta.env.VITE_FINNHUB_KEY ?? '',
        rapidApi: import.meta.env.VITE_RAPIDAPI_KEY ?? '',
      },
      userPreferences: {
        taxBracket: '22%',
        preferLongTerm: true,
        taxCountry: 'US',
        riskPerTrade: 500,
        displayCurrency: 'USD',
      },

      setPortfolio: (portfolio) => {
        set({ portfolio });
        // Debounce cloud sync so rapid edits don't each trigger a Supabase write.
        if (_syncDebounce) clearTimeout(_syncDebounce);
        _syncDebounce = setTimeout(() => get().syncToCloud(), 3000);
      },

      addHolding: (holding) =>
        set((state) => ({
          portfolio: {
            ...state.portfolio,
            holdings: [...state.portfolio.holdings, holding],
          },
        })),

      updateHolding: (id, updates) =>
        set((state) => ({
          portfolio: {
            ...state.portfolio,
            holdings: state.portfolio.holdings.map((h) =>
              h.id === id ? { ...h, ...updates } : h
            ),
          },
        })),

      removeHolding: (id) =>
        set((state) => ({
          portfolio: {
            ...state.portfolio,
            holdings: state.portfolio.holdings.filter((h) => h.id !== id),
          },
        })),

      setHoldings: (holdings) => {
        set((state) => ({
          portfolio: { ...state.portfolio, holdings },
        }));
        if (_syncDebounce) clearTimeout(_syncDebounce);
        _syncDebounce = setTimeout(() => get().syncToCloud(), 3000);
      },

      setQuotes: (quotes) => set({ quotes }),

      setIndicators: (indicators) => set({ indicators }),

      setSignals: (signals) => set({ signals }),

      setForexPairs: (forexPairs) => set({ forexPairs }),

      setAIRecommendation: (aiRecommendation) => set({ aiRecommendation }),

      setChatMessages: (chatMessages) => set({ chatMessages }),

      addMarketNews: (item) => set((state) => ({
        marketNews: [{ ...item, id: Math.random().toString(36).slice(2), addedAt: new Date().toISOString() }, ...state.marketNews].slice(0, 50),
      })),

      removeMarketNews: (id) => set((state) => ({ marketNews: state.marketNews.filter((n) => n.id !== id) })),

      clearMarketNews: () => set({ marketNews: [] }),

      setActiveTab: (activeTab) => set({ activeTab }),

      setSignalFilter: (signalFilter) => set({ signalFilter }),

      setLoading: (key, value) =>
        set((state) => ({
          isLoading: { ...state.isLoading, [key]: value },
        })),

      setApiKeys: (keys) =>
        set((state) => ({
          apiKeys: { ...state.apiKeys, ...keys },
        })),

      setUserPreferences: (prefs) =>
        set((state) => ({
          userPreferences: { ...state.userPreferences, ...prefs },
        })),

      addToast: (toast) => {
        const id = Math.random().toString(36).slice(2);
        set((state) => ({
          toasts: [...state.toasts, { ...toast, id }],
        }));
        setTimeout(() => get().removeToast(id), 5000);
      },

      removeToast: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        })),

      // Recomputes totalValue by summing all holding values + cash.
      // Called explicitly after quote updates since quotes update holding.value
      // in-place rather than going through setPortfolio.
      recalcTotalValue: () =>
        set((state) => ({
          portfolio: {
            ...state.portfolio,
            totalValue: state.portfolio.holdings.reduce(
              (sum, h) => sum + h.value,
              state.portfolio.cashPosition ?? 0
            ),
          },
        })),

      // ── Cloud sync ────────────────────────────────────────

      setCloudSync: (patch) =>
        set((state) => ({ cloudSync: { ...state.cloudSync, ...patch } })),

      syncToCloud: async () => {
        const state = get();
        set((s) => ({ cloudSync: { ...s.cloudSync, status: 'syncing', error: null } }));
        try {
          await syncPortfolioToCloud(
            state.portfolio,
            state.portfolio.holdings,
            state.userPreferences.displayCurrency ?? 'USD'
          );
          const now = new Date().toISOString();
          set((s) => ({ cloudSync: { ...s.cloudSync, status: 'success', lastSyncedAt: now, error: null } }));
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Sync failed';
          set((s) => ({ cloudSync: { ...s.cloudSync, status: 'error', error: msg } }));
        }
      },

      loadFromCloud: async () => {
        set((s) => ({ cloudSync: { ...s.cloudSync, status: 'syncing', error: null } }));
        try {
          const result = await loadPortfolioFromCloud();
          if (!result) {
            set((s) => ({ cloudSync: { ...s.cloudSync, status: 'idle' } }));
            return false;
          }
          set((state) => ({
            portfolio: {
              ...state.portfolio,
              ...result.meta,
              holdings: result.holdings,
              totalValue: result.holdings.reduce((sum, h) => sum + h.value, result.meta.cashPosition ?? 0),
              lastUpdated: new Date().toISOString(),
            },
            userPreferences: {
              ...state.userPreferences,
              displayCurrency: result.displayCurrency ?? state.userPreferences.displayCurrency,
            },
            cloudSync: {
              ...state.cloudSync,
              status: 'success',
              lastSyncedAt: new Date().toISOString(),
              error: null,
            },
          }));
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Load failed';
          set((s) => ({ cloudSync: { ...s.cloudSync, status: 'error', error: msg } }));
          return false;
        }
      },

      takeSnapshot: async () => {
        const { portfolio } = get();
        try {
          await takePortfolioSnapshot(
            portfolio.totalValue,
            portfolio.cashPosition ?? 0,
            portfolio.holdings.length
          );
        } catch {
          // Snapshot failures are silent — non-critical
        }
      },

      loadSnapshots: async (days = 90) => {
        try {
          const snapshots = await fetchPortfolioSnapshots(days);
          set((s) => ({ cloudSync: { ...s.cloudSync, snapshots } }));
        } catch {
          // Silent — non-critical
        }
      },
    }),
    {
      name: 'market-advisor-storage',
      // Don't persist loading state or transient toasts
      partialize: (state) => ({
        portfolio: state.portfolio,
        apiKeys: state.apiKeys,
        userPreferences: state.userPreferences,
        marketNews: state.marketNews,
        chatMessages: state.chatMessages,
        aiRecommendation: state.aiRecommendation,
        // Persist only lastSyncedAt so the UI shows when data was last synced
        cloudSync: { ...DEFAULT_CLOUD_SYNC, lastSyncedAt: state.cloudSync.lastSyncedAt },
      }),
    }
  )
);
