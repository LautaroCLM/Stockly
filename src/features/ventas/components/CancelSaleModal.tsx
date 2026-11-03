import React, { useEffect, useState } from 'react';
import type { Sale } from '@/features/inventario/types';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { AlertTriangle, Ban, Loader2, X } from 'lucide-react';
import type { CancelSaleResult } from '../api/saleCancellationApi';

const MAX_REASON_LENGTH = 500;

interface CancelSaleModalProps {
  sale: Sale | null;
  onClose: () => void;
  onConfirm: (sale: Sale, reason: string) => Promise<CancelSaleResult>;
}

export const CancelSaleModal: React.FC<CancelSaleModalProps> = ({ sale, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setReason('');
    setError(null);
    setIsUncertain(false);
    setIsSubmitting(false);
  }, [sale]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && sale && !isSubmitting) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sale, isSubmitting, onClose]);

  if (!sale) return null;

  const trimmedReason = reason.trim();
  const itemCount = sale.items.reduce((acc, item) => acc + item.quantity, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sale || isSubmitting) return;
    if (!trimmedReason) {
      setError('Indicá el motivo de la anulación.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await onConfirm(sale, trimmedReason);
    setIsSubmitting(false);

    if (result.status === 'cancelled') {
      onClose();
      return;
    }
    setIsUncertain(result.status === 'uncertain');
    setError(result.message);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden">
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-danger/10 border border-danger/25 flex items-center justify-center text-danger">
              <Ban size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Anular venta</h2>
              <span className="text-xs text-text-muted font-mono">{sale.saleNumber}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-1.5">
            <div className="flex justify-between text-text-muted">
              <span>Cliente:</span>
              <span className="text-text-primary font-medium">{sale.clientName}</span>
            </div>
            <div className="flex justify-between text-text-muted">
              <span>Total:</span>
              <span className="text-text-primary font-bold tabular-nums">{formatCurrency(sale.total)}</span>
            </div>
            <p className="pt-1.5 border-t border-border/50 text-text-secondary leading-relaxed">
              Se van a reponer {itemCount} unidades al stock. La venta queda en el historial marcada como anulada; esta acción no se puede deshacer.
            </p>
          </div>

          {error && (
            <div
              className={`p-3 rounded-xl border flex items-start gap-2 ${
                isUncertain ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-danger/10 border-danger/25 text-danger'
              }`}
            >
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="cancel-reason" className="font-semibold text-text-secondary">
              Motivo de la anulación <span className="text-danger">*</span>
            </label>
            <textarea
              id="cancel-reason"
              rows={3}
              maxLength={MAX_REASON_LENGTH}
              disabled={isSubmitting}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej. Error en el cobro, devolución del cliente..."
              className="w-full p-2.5 bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Volver
            </Button>
            <Button variant="danger" size="md" type="submit" disabled={isSubmitting || !trimmedReason} className="gap-1.5">
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
              <span>{isUncertain ? 'Reintentar anulación' : 'Anular venta'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
