import { useState, useRef, useCallback } from 'react';
import { Upload, ImagePlus, Loader2, AlertCircle, CheckCircle2, Trash2, Plus, RefreshCw, Wifi } from 'lucide-react';
import { extractPortfolioFromImage } from '../lib/ocr';
import { useInvestmentStore } from '../store/investmentStore';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import type { Holding, AssetClass, CapCategory } from '../types';

const ASSET_CLASSES: AssetClass[] = ['etf', 'stock', 'fund', 'bond', 'forex', 'crypto'];
const CATEGORIES: CapCategory[] = ['mid-cap', 'small-cap', 'large-cap', 'mega-cap', 'international', 'n/a'];

function newHolding(): Holding {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ticker: '',
    name: '',
    value: 0,
    assetClass: 'etf',
    category: 'n/a',
  };
}

export function PortfolioUpload() {
  const { setHoldings, portfolio, setPortfolio, recalcTotalValue } = useInvestmentStore();
  const toast = useToast();

  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [isRunningOCR, setIsRunningOCR] = useState(false);
  const [rawText, setRawText] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editRows, setEditRows] = useState<Holding[]>(portfolio.holdings);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showRawText, setShowRawText] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (PNG, JPG, etc.)');
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setIsRunningOCR(true);
    setOcrProgress(0);
    setWarnings([]);

    try {
      const result = await extractPortfolioFromImage(file, (progress, status) => {
        setOcrProgress(progress);
        setOcrStatus(status);
      });

      setRawText(result.rawText);
      setWarnings(result.warnings);

      if (result.holdings.length > 0) {
        setEditRows(result.holdings);
        toast.success(`Extracted ${result.holdings.length} holding(s). Review below before confirming.`);
      } else {
        toast.warning('No holdings detected. You can add them manually below.');
        setEditRows([newHolding()]);
      }
    } catch (err) {
      console.error(err);
      toast.error('OCR failed. Please try a clearer image or add holdings manually.');
    } finally {
      setIsRunningOCR(false);
    }
  }, [toast]);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Row editing ───────────────────────────────────────────────────────────

  const updateRow = (id: string, field: keyof Holding, value: string | number) =>
    setEditRows((rows) => rows.map((r) => r.id === id ? { ...r, [field]: value } : r));

  const removeRow = (id: string) =>
    setEditRows((rows) => rows.filter((r) => r.id !== id));

  const addRow = () => setEditRows((rows) => [...rows, newHolding()]);

  const handleConfirm = () => {
    const valid = editRows.filter((r) => r.ticker.trim() && r.value > 0);
    if (valid.length === 0) {
      toast.warning('Add at least one holding with a ticker and value.');
      return;
    }
    const normalized = valid.map((r) => ({
      ...r,
      ticker: r.ticker.trim().toUpperCase(),
      name: r.name?.trim() || r.ticker.trim().toUpperCase(),
    }));
    setHoldings(normalized);
    const total = normalized.reduce((s, h) => s + h.value, portfolio.cashPosition ?? 0);
    setPortfolio({ ...portfolio, holdings: normalized, totalValue: total, lastUpdated: new Date().toISOString() });
    recalcTotalValue();
    toast.success(`Portfolio saved — ${valid.length} position(s), total $${total.toLocaleString()}`);
  };

  // ── IBKR sync ────────────────────────────────────────────────────────────

  const [ibkrLoading, setIbkrLoading] = useState(false);
  const [ibkrStatus, setIbkrStatus] = useState<{ synced_at: string; position_count: number; cash_position: number } | null>(null);

  // Load last sync status on mount
  const checkIbkrStatus = useCallback(async () => {
    const { data } = await supabase.from('ibkr_sync_status').select('*').limit(1).maybeSingle();
    if (data) setIbkrStatus(data as typeof ibkrStatus);
  }, []);

  const loadFromIBKR = async () => {
    setIbkrLoading(true);
    try {
      // Refresh status
      const { data: statusData } = await supabase.from('ibkr_sync_status').select('*').limit(1).maybeSingle();
      if (!statusData) {
        toast.warning('No IBKR data found. Run the ibkr-sync script first (see ibkr-sync/index.js).');
        return;
      }
      setIbkrStatus(statusData as typeof ibkrStatus);

      const { data: rows, error } = await supabase.from('ibkr_positions').select('*');
      if (error) throw error;
      if (!rows || rows.length === 0) {
        toast.warning('No positions found in Supabase. Run the ibkr-sync script first.');
        return;
      }

      const holdings: Holding[] = rows.map((r) => ({
        id: `ibkr-${r.ticker}`,
        ticker: r.ticker,
        name: r.name ?? r.ticker,
        value: Number(r.market_value),
        shares: r.shares ? Number(r.shares) : undefined,
        costBasis: r.cost_basis ? Number(r.cost_basis) : undefined,
        assetClass: (r.asset_class ?? 'stock') as AssetClass,
        category: (r.category ?? 'n/a') as CapCategory,
      }));

      const cashPos = Number(statusData.cash_position ?? 0);
      const total = holdings.reduce((s, h) => s + h.value, cashPos);

      setEditRows(holdings);
      setHoldings(holdings);
      setPortfolio({ ...portfolio, holdings, totalValue: total, cashPosition: cashPos, lastUpdated: new Date().toISOString() });
      recalcTotalValue();
      toast.success(`Loaded ${holdings.length} IBKR positions — $${total.toLocaleString('en-US', { maximumFractionDigits: 0 })}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`IBKR load failed: ${msg}`);
    } finally {
      setIbkrLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── IBKR Sync Panel ── */}
      <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-800 rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-900 flex items-center justify-center shrink-0">
              <Wifi className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <div className="text-white font-semibold flex items-center gap-2">
                Interactive Brokers Live Sync
                {ibkrStatus && (
                  <span className="text-xs bg-emerald-900 text-emerald-300 border border-emerald-700 px-2 py-0.5 rounded-full">
                    ● Data available
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-400 mt-0.5">
                {ibkrStatus
                  ? `Last synced: ${new Date(ibkrStatus.synced_at).toLocaleString()} · ${ibkrStatus.position_count} positions`
                  : 'Run the ibkr-sync script to push your live IBKR positions here'
                }
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={checkIbkrStatus}
              className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600 px-3 py-1.5 rounded-lg transition-colors"
            >
              Check Status
            </button>
            <button
              onClick={loadFromIBKR}
              disabled={ibkrLoading}
              className="flex items-center gap-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {ibkrLoading
                ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading...</>
                : <><RefreshCw className="w-3.5 h-3.5" /> Load from IBKR</>
              }
            </button>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-blue-800/50 text-xs text-gray-500 space-y-1">
          <div><span className="text-blue-400 font-medium">Step 1:</span> Start the IBKR Client Portal Gateway and log in at <span className="text-blue-300">https://localhost:5000</span></div>
          <div><span className="text-blue-400 font-medium">Step 2:</span> Run <code className="bg-gray-800 text-brand-300 px-1 rounded">cd ibkr-sync &amp;&amp; npm install &amp;&amp; npm run sync</code> in a terminal</div>
          <div><span className="text-blue-400 font-medium">Step 3:</span> Click <span className="text-white font-medium">Load from IBKR</span> above — your positions load instantly</div>
          <div><span className="text-gray-600">For live auto-refresh every 5 min, use <code className="bg-gray-800 text-brand-300 px-1 rounded">npm run watch</code> instead</span></div>
        </div>
      </div>

      {/* ── Upload Zone ── */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer
          ${isDragging
            ? 'border-brand-400 bg-brand-900/20'
            : 'border-gray-600 hover:border-brand-500 bg-gray-900/40'}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />

        {isRunningOCR ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-10 h-10 text-brand-400 animate-spin" />
            <p className="text-brand-300 font-medium">{ocrStatus || 'Processing...'}</p>
            <div className="w-64 bg-gray-700 rounded-full h-2">
              <div
                className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${ocrProgress}%` }}
              />
            </div>
            <p className="text-gray-400 text-sm">{ocrProgress}%</p>
          </div>
        ) : previewUrl ? (
          <div className="flex flex-col items-center gap-3">
            <img
              src={previewUrl}
              alt="Portfolio snapshot"
              className="max-h-48 rounded-lg border border-gray-600 shadow-md"
            />
            <p className="text-gray-400 text-sm flex items-center gap-1">
              <ImagePlus className="w-4 h-4" /> Click or drop a new image to re-scan
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="w-12 h-12 text-gray-500" />
            <p className="text-lg font-semibold text-gray-200">Drop your portfolio screenshot here</p>
            <p className="text-gray-400 text-sm">
              PNG / JPG — brokerage screenshot (Fidelity, Schwab, TD, Robinhood, etc.)
            </p>
            <p className="text-gray-500 text-xs mt-1">
              OCR runs locally in your browser — image never leaves your device
            </p>
          </div>
        )}
      </div>

      {/* ── Warnings ── */}
      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-yellow-200 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-yellow-400" />
          {w}
        </div>
      ))}

      {/* ── Raw OCR text toggle ── */}
      {rawText && (
        <button
          onClick={() => setShowRawText((v) => !v)}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          {showRawText ? 'Hide' : 'Show'} raw OCR text
        </button>
      )}
      {showRawText && rawText && (
        <pre className="text-xs bg-gray-900 border border-gray-700 rounded-lg p-3 overflow-auto max-h-40 text-gray-400 whitespace-pre-wrap">
          {rawText}
        </pre>
      )}

      {/* ── Editable holdings table ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-gray-200 font-semibold">Portfolio Holdings</h3>
          <span className="text-xs text-gray-500">Edit any field — confirm when ready</span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 text-gray-400 uppercase text-xs">
              <tr>
                <th className="px-3 py-2 text-left">Ticker</th>
                <th className="px-3 py-2 text-left">Name / Label</th>
                <th className="px-3 py-2 text-right">Market Value ($)</th>
                <th className="px-3 py-2 text-left">Asset Class</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {editRows.map((row) => (
                <tr key={row.id} className="bg-gray-900/60 hover:bg-gray-800/60">
                  <td className="px-3 py-1.5">
                    <input
                      value={row.ticker}
                      onChange={(e) => updateRow(row.id, 'ticker', e.target.value.toUpperCase())}
                      placeholder="VTI"
                      className="w-20 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white font-mono uppercase text-xs focus:border-brand-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      value={row.name ?? ''}
                      onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                      placeholder="Auto-filled after save"
                      className="w-48 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 text-xs focus:border-brand-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      value={row.value || ''}
                      onChange={(e) => updateRow(row.id, 'value', parseFloat(e.target.value) || 0)}
                      placeholder="50000"
                      className="w-32 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-right text-white text-xs focus:border-brand-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={row.assetClass}
                      onChange={(e) => updateRow(row.id, 'assetClass', e.target.value)}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      {ASSET_CLASSES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={row.category}
                      onChange={(e) => updateRow(row.id, 'category', e.target.value)}
                      className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 text-xs focus:border-brand-500 focus:outline-none"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <button onClick={() => removeRow(row.id)} className="text-red-500 hover:text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={addRow}
            className="flex items-center gap-1 text-sm text-brand-400 hover:text-brand-300"
          >
            <Plus className="w-4 h-4" /> Add row manually
          </button>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-400">
              Total: <span className="text-white font-semibold">
                ${editRows.reduce((s, r) => s + (r.value || 0), 0).toLocaleString()}
              </span>
            </div>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Portfolio
            </button>
          </div>
        </div>
      </div>

      {/* ── Portfolio settings ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-gray-800">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Current Portfolio Value ($)</label>
          <input
            type="number"
            value={portfolio.totalValue}
            onChange={(e) => setPortfolio({ ...portfolio, totalValue: parseFloat(e.target.value) || 0 })}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Goal Value ($)</label>
          <input
            type="number"
            value={portfolio.goalValue}
            onChange={(e) => setPortfolio({ ...portfolio, goalValue: parseFloat(e.target.value) || 1_000_000 })}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Cash (uninvested)</label>
          <input
            type="number"
            value={portfolio.cashPosition ?? 0}
            onChange={(e) => setPortfolio({ ...portfolio, cashPosition: parseFloat(e.target.value) || 0 })}
            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <p className="text-xs text-gray-600 text-center">
        ⚠️ This tool is for <strong>informational and educational purposes only</strong>. 
        Nothing here constitutes registered financial or investment advice. Always consult a licensed financial advisor.
      </p>
    </div>
  );
}
