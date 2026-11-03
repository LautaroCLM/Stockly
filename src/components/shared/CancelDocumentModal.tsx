import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, Ban, Loader2, X } from 'lucide-react';
import type { CancelDocumentResult } from '@/lib/documentCancellation';

const MAX_REASON_LENGTH = 500;

interface CancelDocumentModalProps {
  isOpen: boolean;
  /** Ej. "Anular venta" */
  title: string;
  documentNumber: string;
  details: { label: string; value: string }[];
  /** Qué pasa con el stock al anular. */
  impactText: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<CancelDocumentResult>;
}

/** Confirmación de anulación de un documento (venta o compra) con motivo obligatorio. */
export const CancelDocumentModal: React.FC<CancelDocumentModalProps> = ({
  isOpen,
  title,
  documentNumber,
  details,
  impactText,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setReason('');
    setError(null);
    setIsUncertain(false);
    setIsSubmitting(false);
  }, [isOpen, documentNumber]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const trimmedReason = reason.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    if (!trimmedReason) {
      setError('Indicá el motivo de la anulación.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await onConfirm(trimmedReason);
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
              <h2 className="text-base font-bold text-text-primary">{title}</h2>
              <span className="text-xs text-text-muted font-mono">{documentNumber}</span>
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
            {details.map((detail) => (
              <div key={detail.label} className="flex justify-between gap-3 text-text-muted">
                <span>{detail.label}:</span>
                <span className="text-text-primary font-medium text-right">{detail.value}</span>
              </div>
            ))}
            <p className="pt-1.5 border-t border-border/50 text-text-secondary leading-relaxed">
              {impactText} El documento queda en el historial marcado como anulado; esta acción no se puede deshacer.
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
              placeholder="Ej. Error de carga, devolución, factura duplicada..."
              className="w-full p-2.5 bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Volver
            </Button>
            <Button variant="danger" size="md" type="submit" disabled={isSubmitting || !trimmedReason} className="gap-1.5">
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Ban size={15} />}
              <span>{isUncertain ? 'Reintentar anulación' : title}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
