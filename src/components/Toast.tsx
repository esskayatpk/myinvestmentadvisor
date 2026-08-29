import { useEffect } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import { useInvestmentStore } from '../store/investmentStore';

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS = {
  success: 'bg-green-800 border-green-600 text-green-100',
  error: 'bg-red-900 border-red-600 text-red-100',
  info: 'bg-blue-900 border-blue-600 text-blue-100',
  warning: 'bg-yellow-900 border-yellow-600 text-yellow-100',
};

export function Toast() {
  const { toasts, removeToast } = useInvestmentStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg text-sm ${COLORS[t.type]}`}
          >
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// Convenience hook so components don't need to know the store detail
export function useToast() {
  const addToast = useInvestmentStore((s) => s.addToast);
  return {
    success: (message: string) => addToast({ type: 'success', message }),
    error: (message: string) => addToast({ type: 'error', message }),
    info: (message: string) => addToast({ type: 'info', message }),
    warning: (message: string) => addToast({ type: 'warning', message }),
  };
}

// Auto-dismiss helper (exported for completeness; store already handles it)
export function useAutoToastClear() {
  const { toasts, removeToast } = useInvestmentStore();
  useEffect(() => {
    if (toasts.length === 0) return;
    // Additional cleanup if any toast older than 6 s still lingers
    const id = setTimeout(() => {
      const now = Date.now();
      toasts.forEach((t) => {
        const created = parseInt(t.id, 36);
        if (now - created > 6000) removeToast(t.id);
      });
    }, 6000);
    return () => clearTimeout(id);
  }, [toasts, removeToast]);
}
