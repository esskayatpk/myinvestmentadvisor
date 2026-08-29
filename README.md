# myInvestmentAdvisor — Investment Intelligence Platform

> **Educational and informational use only. Not registered investment advice.**  
> Always verify data with your broker and consult a licensed advisor before investing.

A full-featured, browser-based investment research platform built with **React 19 + TypeScript + Vite**.  
All technical analysis runs **100% in your browser** — no backend required except for the optional AI advisor.

---

## ✨ Highlights

| Feature | Description |
|---|---|
| **Live News Ticker** | Scrolling banner of portfolio-company headlines filtered to WSJ, Bloomberg, Reuters, CNBC, Yahoo Finance & 20+ reputable outlets. Pauses on hover — click any headline to open the source article. |
| **Portfolio Dashboard** | Holdings table with live prices, daily P&L, asset allocation donuts, equity curve, $1M goal tracker, multi-currency display, and Supabase cloud sync. |
| **Market Scanner** | 5-pillar TA sweep across a ~90-ticker universe with sector/market context demotion, position sizing scenarios, tax impact, and earnings-risk warnings. |
| **Buy/Sell Signals** | Per-holding 5-pillar framework with pre-trade checklist gate, R:R calculator, news sentiment, insider activity, earnings data, and fundamentals. |
| **AI Advisor** | Anthropic Claude (via Supabase Edge Function) analyzes your full portfolio and returns structured recommendations + free-form chat. Automatically receives Shiller CAPE macro context. |
| **Forex Analysis** | Live rates for 10 major/minor pairs with Alpha Vantage TA signals. |
| **Real Estate Analyzer** | PadSplit co-living ROI model for RI + Southern MA markets — cap rate, CoC, DSCR, town demographics, crime grades, distressed property sources. No API key required. |
| **Macro Valuation Banner** | Shiller CAPE ~42 warning displayed on Portfolio, Scanner, and injected into every AI analysis. |
| **OCR Portfolio Import** | Tesseract.js reads brokerage screenshots directly in the browser. |

---

## 🏗️ Architecture

```
Browser (React SPA)
│
├── src/components/         UI components (one per tab + shared)
├── src/lib/                Data fetching, caching, TA calculations
├── src/store/              Zustand state + localStorage persistence
└── src/types/              TypeScript interfaces
         │
         ├── Yahoo Finance  (proxied via Vite dev server)
         ├── Polygon.io     (fallback price history)
         ├── Alpha Vantage  (Forex TA — FX_DAILY)
         ├── Finnhub        (company news, quotes, fundamentals, earnings, insider)
         └── ExchangeRate-API (live forex rates, 1 h cache)
                  │
         Supabase Edge Function (Deno)
                  │
         Anthropic Claude (claude-opus-4-5)
```

**All tabs are always-mounted** (`hidden` / `contents` toggle) — state survives tab switches and no re-fetches occur on navigation.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript 5 |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v3 (dark charcoal/teal design system) |
| State | Zustand with `partialize` localStorage persistence |
| Charts | Recharts (PieChart, LineChart, AreaChart) |
| Icons | Lucide React |
| OCR | Tesseract.js (runs in-browser, no server) |
| AI Backend | Supabase Edge Functions (Deno) → Anthropic Claude |
| DB / Sync | Supabase (portfolio snapshots, equity curve) |

---

## 📁 File Structure

```
investment-advisor/
├── index.html
├── vite.config.ts          # Yahoo Finance proxy + build config
├── tailwind.config.js
├── .env.example            # Copy → .env and fill in keys
│
├── src/
│   ├── App.tsx             # Navigation shell, tab routing, NewsTicker
│   ├── types/index.ts      # All TypeScript interfaces
│   ├── store/
│   │   └── investmentStore.ts   # Zustand store + localStorage
│   ├── lib/
│   │   ├── marketData.ts        # Yahoo Finance + Polygon + Finnhub fetching
│   │   ├── technicalAnalysis.ts # 5-pillar TA: Trend/Location/Volume/R:R/Structure
│   │   ├── forex.ts             # ExchangeRate-API + Alpha Vantage FX
│   │   ├── macroContext.ts      # Shiller CAPE constant + regime config
│   │   ├── realEstate.ts        # PadSplit model, RI/MA market configs, city stats
│   │   └── ocr.ts               # Tesseract.js wrapper
│   └── components/
│       ├── NewsTicker.tsx        # Scrolling live news banner
│       ├── PortfolioDashboard.tsx
│       ├── MarketAnalysis.tsx
│       ├── ForexAnalysis.tsx
│       ├── BuySellSignals.tsx
│       ├── MarketScanner.tsx
│       ├── RealEstateAnalysis.tsx
│       ├── AIAdvisor.tsx
│       ├── Settings.tsx
│       ├── PortfolioUpload.tsx
│       └── Toast.tsx
│
└── supabase/
    └── functions/market-advisor/
        └── index.ts        # Deno edge function → Anthropic Claude
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- A Supabase project (free tier) — only needed for AI Advisor
- API keys (all free tiers):

| Key | Where to get | Required for |
|---|---|---|
| `VITE_FINNHUB_KEY` | [finnhub.io](https://finnhub.io) — free, no credit card | **News ticker, signals news, earnings, fundamentals** |
| `VITE_ALPHA_VANTAGE_KEY` | [alphavantage.co](https://www.alphavantage.co/support/#api-key) | Forex TA |
| `VITE_POLYGON_KEY` | [polygon.io](https://polygon.io) | Price history fallback |
| `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | Your Supabase project | AI Advisor |

Yahoo Finance, ExchangeRate-API, and Tesseract.js require **no key**.

### Install & Run

```bash
git clone <repo>
cd myinvestmentadvisor
npm install

cp .env.example .env
# Fill in your keys in .env

npm run dev
# → http://localhost:5173
```

### Deploy AI Advisor (Supabase)

```bash
npm install -g supabase
supabase login
supabase functions deploy market-advisor --project-ref YOUR_REF
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref YOUR_REF
```

### Production Build

```bash
npm run build   # outputs to dist/
```

> **Note:** Yahoo Finance is proxied through Vite in dev. In production you'll need a server-side proxy (e.g. an additional Supabase edge function).

---

## 📊 5-Pillar Technical Analysis Framework

Every signal (Signals tab + Scanner tab) is scored across five independent dimensions:

| Pillar | Indicators Used | Weight |
|---|---|---|
| **Trend** | SMA 20/50/200 alignment, EMA 21, price vs MAs | 25% |
| **Location** | RSI 14, Bollinger Band position (upper/mid/lower) | 20% |
| **Volume** | Volume vs 20-day baseline, volume trend confirmation | 20% |
| **Risk:Reward** | ATR-based stop-loss, 2:1 R:R minimum gate | 20% |
| **Structure** | MACD direction + histogram momentum | 15% |

**Pre-trade checklist gate (6 checks):** trend aligned · RSI not overbought · volume confirms · R:R ≥ 2:1 · MACD confirming · no earnings within 14 days. Signal is downgraded if < 4/6 pass.

**Market context demotion:** SPY + sector ETF trend assessed before final signal. 1 headwind demotes STRONG_BUY → BUY; 2 headwinds demote STRONG_BUY → WATCH.

---

## 🏘️ Real Estate Analyzer

PadSplit co-living investment model for **Rhode Island + Southern Massachusetts**:

- **10 target markets**: Providence, Pawtucket, Woonsocket, Cranston, Central Falls (RI) · Fall River, New Bedford, Brockton, Attleboro, Taunton (MA)
- **Revenue model**: per-bedroom room rates ($650–950/mo), 19% PadSplit platform fee, 18% utilities, 7% vacancy, 4% insurance, 6% maintenance + property tax
- **Financing**: 25% down, 7.5% 30-year fixed
- **Output**: Cap rate, CoC return, DSCR, NOI, monthly cash flow, PadSplit Score 0–100, signal (STRONG_BUY → PASS)
- **Town profile**: US Census ACS 2022 demographics + FBI UCR 2022 crime grades
- **No API key required** — enter any property manually or load 12 demo listings

---

## 📰 Live News Ticker

The scrolling banner between the tab bar and main content shows:

- **Left panel**: Live SPY / QQQ / IWM / DIA index quotes (color-coded ±%)
- **Right panel**: Headlines from your portfolio companies, filtered to reputable sources (WSJ, Bloomberg, Reuters, CNBC, Yahoo Finance, MarketWatch, Barron's, Seeking Alpha, FT, Business Insider, Forbes, Fortune, Motley Fool, MSNBC, TheStreet, IBD, Benzinga, Zacks, Morningstar, AP, NYT, WaPo, Kiplinger, Investopedia)
- Pauses on hover · click to open source article in new tab · auto-refreshes every 5 minutes
- Falls back to Finnhub general market news when portfolio is empty
- Static Shiller CAPE + Buffett Indicator context always shown (no key required)

---

## 📈 Macro Valuation Context

**Shiller CAPE ~42** as of July 2026 — only the 3rd time above 40 in 155 years.

| Instance | Peak CAPE | Drawdown |
|---|---|---|
| Dotcom Bubble (1999–2000) | 44 | −49% |
| Post-COVID melt-up (2021–2022) | 40 | −25% |
| **Today (2026)** | **~42** | Unknown |

The CAPE regime (Undervalued / Fair / Elevated / High / **Extreme**) is displayed as:
- A red warning banner on the **Portfolio Dashboard**
- A warning banner above **Scanner** results
- Automatically injected into every **AI Advisor** analysis prompt

> CAPE is a risk-context tool, not a timing indicator. Markets can stay overvalued 1–3+ years.

---

## 🔑 Environment Variables

```bash
# Yahoo Finance — no key needed (Vite proxy)

# Finnhub — required for news ticker + signals news/fundamentals
VITE_FINNHUB_KEY=your_finnhub_key

# Alpha Vantage — required for Forex TA
VITE_ALPHA_VANTAGE_KEY=your_av_key

# Polygon.io — price history fallback
VITE_POLYGON_KEY=your_polygon_key

# Supabase — required for AI Advisor
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## 📚 Full Documentation

Open [`MARKET_ADVISOR_GUIDE.html`](MARKET_ADVISOR_GUIDE.html) in a browser for the complete guide (v1.3) — covers every tab, all indicators, the PadSplit model, forex trading guide, troubleshooting, and full data-source reference.

---

*myInvestmentAdvisor · v1.3 · July 2026 · Built with React + Vite + Tailwind + Supabase + Anthropic Claude*  
*For educational and informational purposes only. Not registered investment advice.*
