import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ShieldCheck, Loader2, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface NegativeStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAllowNegative: boolean;
  onConfirm: (targetValue: boolean, reason: string) => Promise<{ success: boolean; error?: string }>;
}

export const NegativeStockModal: React.FC<NegativeStockModalProps> = ({
  isOpen,
  onClose,
  currentAllowNegative,
  onConfirm,
}) => {
  const targetValue = !currentAllowNegative;
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setActionError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanReason = reason.trim();
    if (!cleanReason) {
      setActionError('El motivo justificatorio es obligatorio para la auditoría.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    const res = await onConfirm(targetValue, cleanReason);
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setActionError(res.error || 'Error al actualizar la política.');
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                targetValue
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : 'bg-primary/10 text-primary border border-primary/30'
              }`}
            >
              {targetValue ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                {targetValue
                  ? 'Habilitar Stock Negativo'
                  : 'Desactivar Stock Negativo'}
              </h2>
              <p className="text-xs text-text-secondary">
                Cambio de política operativa de inventario
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
          {actionError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Explicación del impacto */}
          <div
            className={`p-3.5 rounded-xl border text-xs leading-relaxed space-y-2 ${
              targetValue
                ? 'bg-amber-500/10 border-amber-500/30 text-text-primary'
                : 'bg-emerald-500/10 border-emerald-500/30 text-text-primary'
            }`}
          >
            <p className="font-semibold flex items-center gap-1.5">
              <span>Impacto operativo del cambio:</span>
            </p>
            {targetValue ? (
              <p className="text-text-secondary text-[11px]">
                Al activar esta política, el sistema <strong className="text-amber-400">admitirá saldos bajo cero</strong>. Las ventas y movimientos de egreso no serán bloqueados aunque las existencias registradas sean inferiores a la cantidad demandada.
              </p>
            ) : (
              <p className="text-text-secondary text-[11px]">
                Al desactivar esta política, el sistema pasa a modo <strong className="text-emerald-400">estricto</strong>. Las operaciones de checkout o egresos que excedan las existencias físicas disponibles en catálogo serán <strong className="text-text-primary">rechazadas inmediatamente por la base de datos</strong>.
              </p>
            )}
          </div>

          {/* Campo Motivo */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-primary flex items-center justify-between">
              <span>Motivo justificatorio (Auditoría)</span>
              <span className="text-[10px] text-danger font-medium">* Requerido</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Cambio a control de existencias estricto por directiva de balance mensual..."
              rows={3}
              required
              disabled={isSubmitting}
              className="w-full bg-surface-2 border border-border rounded-xl p-3 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors resize-none"
            />
            <p className="text-[10px] text-text-muted">
              Este motivo quedará asentado en el registro inmutable de auditoría corporativa (<span className="font-mono">audit_log</span>).
            </p>
          </div>

          {/* Botones de acción */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting || !reason.trim()}
              className="text-xs"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="animate-spin mr-1.5" />
                  <span>Guardando política...</span>
                </>
              ) : (
                <span>Confirmar cambio de política</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
