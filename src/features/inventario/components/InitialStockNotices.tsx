import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/** Cuándo usar la carga inicial y cuándo un ajuste. */
export const InitialStockExplanation: React.FC = () => (
  <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-text-secondary flex items-start gap-2.5">
    <AlertCircle size={16} className="text-primary shrink-0 mt-0.5" />
    <div className="space-y-1">
      <p className="font-semibold text-text-primary">Diferencia con ajustes ordinarios:</p>
      <p className="text-text-muted leading-relaxed">
        Esta función establece el saldo de apertura de cada producto. Solo admite productos con stock en 0 y sin historial
        previo. Si un producto ya posee movimientos registrados, debe regularizarse mediante <strong>Ajuste de Stock</strong>.
      </p>
    </div>
  </div>
);

export const InitialStockRestricted: React.FC = () => (
  <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center gap-2">
    <AlertTriangle size={15} className="shrink-0" />
    <span>Operación restringida: se requiere rol de Administrador para registrar la carga inicial.</span>
  </div>
);

export const InitialStockSuccess: React.FC<{ count: number; syncWarning?: string; onClose: () => void }> = ({ count, syncWarning, onClose }) => (
  <div role="status" className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 space-y-2">
    <div className="flex items-center gap-2 font-semibold text-emerald-400">
      <CheckCircle2 size={16} />
      <span>Carga inicial confirmada con éxito ({count} productos registrados)</span>
    </div>
    {syncWarning && <p className="text-amber-400 text-[11px]">{syncWarning}</p>}
    <div className="pt-2 flex justify-end">
      <Button variant="primary" size="sm" onClick={onClose}>Cerrar</Button>
    </div>
  </div>
);

/** Error del envío; si el resultado es incierto, permite reintentar con la misma clave. */
export const InitialStockError: React.FC<{ message: string; isUncertain: boolean; isBusy: boolean; onRetry: () => void }> = ({
  message,
  isUncertain,
  isBusy,
  onRetry,
}) => (
  <div role="alert" className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
    <div className="flex items-center gap-2">
      <AlertTriangle size={15} className="shrink-0" />
      <span>{message}</span>
    </div>
    {isUncertain && (
      <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={isBusy}
        className="h-7 text-xs border-danger/40 text-danger hover:bg-danger/20 shrink-0 gap-1.5">
        <RotateCcw size={13} />
        Reintentar misma clave
      </Button>
    )}
  </div>
);
