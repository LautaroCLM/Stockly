import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Check, Layers, Loader2, RotateCcw, X } from 'lucide-react';
import { fromHundredths } from '@/lib/decimal';
import { Button } from '@/components/ui/Button';
import { toUserMessage } from '@/lib/errorMessages';
import type { Product, StockAdjustmentData, StockAdjustmentResult, StockMovementReason, StockMovementDirection } from '../types';
import { REASONS_REQUIRING_NOTES, previewAdjustment, validateAdjustmentForm } from '../adjustmentMath';
import { ADJUSTMENT_REASONS, AdjustmentPreviewBox, QuantityFields, ReasonPicker } from './AdjustmentFields';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (data: StockAdjustmentData) => Promise<StockAdjustmentResult> | StockAdjustmentResult;
}

const TEXT_FIELD =
  'w-full text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none disabled:opacity-50';

/** Ajuste manual de existencias (conteo físico, merma o consumo interno) con clave de idempotencia. */
export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({ isOpen, product, onClose, onSubmit }) => {
  const [reason, setReason] = useState<StockMovementReason>('physical_count');
  const [direction, setDirection] = useState<StockMovementDirection>('increase');
  const [quantityInput, setQuantityInput] = useState('1');
  const [physicalCountInput, setPhysicalCountInput] = useState('0');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Una clave por intención de ajuste: reintentar tras un corte no duplica el movimiento
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  useEffect(() => {
    if (!isOpen || !product) return;
    setErrorMessage(null);
    setIsUncertain(false);
    setIsSubmitting(false);
    setReferenceDoc('');
    setNotes('');
    setReason('physical_count');
    setDirection('increase');
    setQuantityInput('1');
    setPhysicalCountInput(product.stock.toString());
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [isOpen, product]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen || !product) return null;

  const isPhysicalCount = reason === 'physical_count';
  const preview = previewAdjustment(product.stock, reason, direction, isPhysicalCount ? physicalCountInput : quantityInput);

  // Si el usuario cambia algo tras un resultado incierto, es una intención nueva: nueva clave
  const editing = <T,>(setter: (value: T) => void) => (value: T) => {
    if (isUncertain) {
      setIsUncertain(false);
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    setter(value);
  };

  const selectReason = editing((r: StockMovementReason) => {
    setReason(r);
    const config = ADJUSTMENT_REASONS.find((item) => item.id === r);
    if (config) setDirection(config.defaultDirection);
    setErrorMessage(null);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    const invalid = validateAdjustmentForm(product, reason, preview.inputHundredths, notes);
    if (invalid || preview.inputHundredths === null) {
      setErrorMessage(invalid);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        productId: product.id,
        reason,
        direction: preview.direction,
        quantity: preview.deltaQuantity,
        countedQuantity: isPhysicalCount ? fromHundredths(preview.inputHundredths) : undefined,
        notes: notes.trim() || undefined,
        referenceDoc: referenceDoc.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });
      if (res.success) {
        onClose();
      } else {
        setErrorMessage(res.error || 'Ocurrió un error al registrar el movimiento.');
        if (res.uncertain) setIsUncertain(true);
      }
    } catch (err) {
      setErrorMessage(toUserMessage(err, 'Error al registrar el ajuste de existencias.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isSubmitting && onClose()} />
      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">Ajustar Existencias de Stock</h2>
              <span className="text-xs text-text-muted">
                {product.name} • <span className="font-mono text-text-secondary">{product.sku}</span>
              </span>
            </div>
          </div>
          <button onClick={onClose} disabled={isSubmitting} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              isUncertain ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-danger/10 border-danger/25 text-danger'
            }`}>
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="font-semibold block">{isUncertain ? 'Resultado Incierto por Corte de Red' : 'Error en el ajuste'}</span>
                <p className="leading-relaxed whitespace-pre-line">{errorMessage}</p>
                {isUncertain && (
                  <p className="text-[11px] text-amber-200/90 pt-1">
                    El resultado en el servidor sigue sin confirmarse. No inicie un ajuste nuevo para compensar esta diferencia. Haga clic en <strong>Reintentar con la misma clave</strong> para reenviar la solicitud de forma segura sin duplicar el movimiento físico.
                  </p>
                )}
              </div>
            </div>
          )}

          <ReasonPicker value={reason} disabled={isSubmitting} onChange={selectReason} />
          <QuantityFields product={product} isPhysicalCount={isPhysicalCount} disabled={isSubmitting}
            value={isPhysicalCount ? physicalCountInput : quantityInput}
            onChange={editing(isPhysicalCount ? setPhysicalCountInput : setQuantityInput)} />
          <AdjustmentPreviewBox product={product} isPhysicalCount={isPhysicalCount} preview={preview} />

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Documento de Respaldo <span className="text-text-muted text-[11px]">(Opcional)</span>
            </label>
            <input type="text" disabled={isSubmitting} value={referenceDoc} onChange={(e) => editing(setReferenceDoc)(e.target.value)}
              placeholder="Ej. Remito R-00214, Acta de Inventario N° 05..." className={`h-9 px-3 ${TEXT_FIELD}`} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Observaciones / Justificación {REASONS_REQUIRING_NOTES.includes(reason) && <span className="text-danger">*</span>}
            </label>
            <textarea rows={2} disabled={isSubmitting} value={notes} onChange={(e) => editing(setNotes)(e.target.value)}
              placeholder="Detalle o justificación del ajuste físico..." className={`p-2.5 resize-none ${TEXT_FIELD}`} />
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button variant="primary" size="md" type="submit" disabled={isSubmitting} className="gap-1.5 shadow-md">
              {isSubmitting ? (
                <><Loader2 size={15} className="animate-spin" /><span>Registrando en base...</span></>
              ) : isUncertain ? (
                <><RotateCcw size={15} /><span>Reintentar con la misma clave</span></>
              ) : (
                <><Check size={15} /><span>Confirmar ajuste</span></>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
