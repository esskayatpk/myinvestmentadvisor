/**
 * OCR-based portfolio extraction using Tesseract.js.
 * Runs entirely in the browser — no server needed.
 */

import { createWorker } from 'tesseract.js';
import type { Holding, AssetClass, CapCategory } from '../types';

// Common English words to filter out when looking for ticker symbols
const COMMON_WORDS = new Set([
  'A', 'I', 'AM', 'AN', 'AS', 'AT', 'BE', 'BY', 'DO', 'GO', 'HE', 'IF', 'IN',
  'IS', 'IT', 'ME', 'MY', 'NO', 'OF', 'ON', 'OR', 'SO', 'TO', 'UP', 'US', 'WE',
  'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS',
  'ONE', 'OUR', 'OUT', 'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'NEW',
  'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'HER', 'MAY', 'MAN',
  'MEN', 'YES', 'YET', 'NET', 'SET', 'GET', 'PUT', 'PER', 'TAX', 'TRY', 'TOP',
  'AGE', 'GOT', 'BIG', 'BIT', 'ACT', 'ADD', 'AID', 'AIM', 'BUY', 'CUT', 'END',
  'USE', 'RUN', 'WIN', 'SELL', 'HOLD', 'FUND', 'RATE', 'YEAR', 'LAST', 'NEXT',
  'HIGH', 'LOW', 'OPEN', 'GAIN', 'LOSS', 'COST', 'PAID', 'EARN', 'CASH', 'TYPE',
  'DATE', 'TIME', 'SOLD', 'LONG', 'TERM', 'RISK', 'PLAN', 'GOAL', 'SAVE',
  'TOTAL', 'VALUE', 'PRICE', 'SHARE', 'STOCK', 'TRADE', 'ASSET', 'INDEX', 'FUND',
  'SMALL', 'LARGE', 'YIELD', 'BONDS', 'CLOSE', 'TODAY', 'MONTH', 'DAILY',
  'ANNUL', 'SMART', 'FIRST', 'BASED', 'AFTER', 'ABOVE', 'CLASS', 'STYLE', 'BETA',
  'YTD', 'NAV', 'IPO', 'IRA', 'ETF', 'SEC', 'NYSE', 'USD', 'CDN', 'EUR', 'GBP',
]);

// Known common ETF/fund tickers (helps validate OCR output)
const KNOWN_TICKERS = new Set([
  'VTI', 'VOO', 'VUG', 'VTV', 'VXF', 'VO', 'VB', 'VBR', 'VBK',
  'SCHB', 'SCHG', 'SCHV', 'SCHA', 'SCHM', 'SCHD', 'SCHF', 'SCHE',
  'IWM', 'IWR', 'IWS', 'IWN', 'IWO', 'IJH', 'IJR', 'IVV', 'SPY', 'QQQ',
  'DIA', 'MDY', 'SLY', 'VNQ', 'BND', 'AGG', 'TIP', 'LQD', 'HYG',
  'EFA', 'EEM', 'VEA', 'VWO', 'IEFA', 'IEMG', 'ACWI', 'URTH', 'GLD', 'SLV',
  'ARKK', 'ARKG', 'ARKF', 'ARKW', 'ARKQ',
  'AAPL', 'MSFT', 'AMZN', 'GOOGL', 'GOOG', 'META', 'NVDA', 'TSLA', 'NFLX',
  'AVGO', 'ORCL', 'CSCO', 'INTC', 'AMD', 'QCOM', 'TXN',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC',
  'BRK', 'BRKB', 'BRKA', 'JNJ', 'PFE', 'UNH', 'MRK', 'ABBV',
  'XOM', 'CVX', 'COP', 'SLB', 'EOG',
]);

// ─── Text parsing utilities ──────────────────────────────────────────────────

function parseDollarAmount(text: string): number | null {
  const match = text.match(/\$?([\d,]+\.?\d{0,2})/);
  if (!match) return null;
  const val = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(val) ? null : val;
}

function parsePercent(text: string): number | null {
  const match = text.match(/([+-]?\d+\.?\d*)%/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  return isNaN(val) ? null : val;
}

function isProbablyTicker(word: string): boolean {
  if (word.length < 1 || word.length > 5) return false;
  if (!/^[A-Z]+$/.test(word)) return false;
  if (COMMON_WORDS.has(word)) return false;
  return true;
}

function guessAssetClass(ticker: string, contextLine: string): AssetClass {
  const ctx = contextLine.toLowerCase();
  if (ctx.includes('etf') || ctx.includes('index') || ctx.includes('fund')) return 'etf';
  if (ctx.includes('bond') || ctx.includes('treasury') || ctx.includes('fixed')) return 'bond';
  if (ctx.includes('btc') || ctx.includes('eth') || ctx.includes('crypto')) return 'crypto';
  if (KNOWN_TICKERS.has(ticker)) return 'etf';
  return 'stock';
}

function guessCategory(ticker: string, contextLine: string): CapCategory {
  const ctx = contextLine.toLowerCase();
  if (ctx.includes('small')) return 'small-cap';
  if (ctx.includes('mid')) return 'mid-cap';
  if (ctx.includes('large') || ctx.includes('mega')) return 'large-cap';
  if (ctx.includes('international') || ctx.includes('global') || ctx.includes('world')) return 'international';
  const smalls = ['IWM', 'IJR', 'VB', 'SCHA', 'VBR', 'VBK', 'SLY'];
  const mids = ['IJH', 'MDY', 'VO', 'SCHM', 'IWR', 'IWS'];
  if (smalls.includes(ticker)) return 'small-cap';
  if (mids.includes(ticker)) return 'mid-cap';
  return 'n/a';
}

// ─── Line-by-line parser ─────────────────────────────────────────────────────

interface ParsedRow {
  ticker: string;
  value: number;
  shares?: number;
  costBasis?: number;
  allocationPct?: number;
}

function parseOCRText(text: string): ParsedRow[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];

  for (const line of lines) {
    // Skip header-like lines
    if (/symbol|ticker|account|total|portfolio|balance|value|position/i.test(line)) continue;

    const words = line.split(/\s+/);
    const candidates = words.filter(isProbablyTicker);

    if (candidates.length === 0) continue;

    // Find dollar amounts in this line
    const amounts: number[] = [];
    for (const w of words) {
      const v = parseDollarAmount(w);
      if (v !== null && v > 0.01) amounts.push(v);
    }

    // Find percentage
    const pct = parsePercent(line);

    // Pick the most likely ticker: prefer known tickers, else first candidate
    const ticker = candidates.find((c) => KNOWN_TICKERS.has(c)) ?? candidates[0];
    if (!ticker) continue;

    // Pick the most likely value: largest dollar amount > $100
    const value = amounts.filter((a) => a > 100).sort((a, b) => b - a)[0];
    if (value === undefined && pct === null) continue;

    rows.push({
      ticker,
      value: value ?? 0,
      allocationPct: pct ?? undefined,
    });
  }

  return rows;
}

// ─── Duplicate / merge logic ─────────────────────────────────────────────────

function dedupeRows(rows: ParsedRow[]): ParsedRow[] {
  const seen = new Map<string, ParsedRow>();
  for (const row of rows) {
    if (seen.has(row.ticker)) {
      const existing = seen.get(row.ticker)!;
      // Keep whichever has the larger value (likely the position market value)
      if (row.value > existing.value) seen.set(row.ticker, row);
    } else {
      seen.set(row.ticker, row);
    }
  }
  return [...seen.values()];
}

// ─── Main OCR function ───────────────────────────────────────────────────────

export interface OCRResult {
  rawText: string;
  holdings: Holding[];
  confidence: number;
  warnings: string[];
}

export async function extractPortfolioFromImage(
  imageFile: File,
  onProgress?: (progress: number, status: string) => void
): Promise<OCRResult> {
  const warnings: string[] = [];

  onProgress?.(5, 'Initializing OCR engine...');

  const worker = await createWorker('eng', 1, {
    logger: (m: { progress: number; status: string }) => {
      if (m.progress !== undefined) {
        onProgress?.(Math.round(m.progress * 85) + 5, m.status);
      }
    },
  });

  try {
    const { data } = await worker.recognize(imageFile);
    const rawText = data.text;
    const confidence = data.confidence;

    onProgress?.(92, 'Parsing financial data...');

    const rows = dedupeRows(parseOCRText(rawText));

    if (rows.length === 0) {
      warnings.push(
        'No ticker symbols detected. Please use the manual editor to add holdings, or try a clearer screenshot.'
      );
    }

    if (confidence < 60) {
      warnings.push(
        `Low OCR confidence (${confidence.toFixed(0)}%). Results may be inaccurate — please review carefully.`
      );
    }

    // Convert to holdings
    const holdings: Holding[] = rows.map((row, i) => {
      const contextLine = rawText
        .split('\n')
        .find((l) => l.includes(row.ticker)) ?? '';

      return {
        id: `ocr-${i}-${Date.now()}`,
        ticker: row.ticker,
        name: row.ticker, // Will be resolved after quote fetch
        value: row.value,
        assetClass: guessAssetClass(row.ticker, contextLine),
        category: guessCategory(row.ticker, contextLine),
      };
    });

    onProgress?.(100, 'Done');

    return { rawText, holdings, confidence, warnings };
  } finally {
    await worker.terminate();
  }
}
