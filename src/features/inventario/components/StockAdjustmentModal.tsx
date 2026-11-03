import React, { useState, useEffect, useRef } from 'react';
import type {
  Product,
  StockAdjustmentData,
  StockAdjustmentResult,
  StockMovementReason,
  StockMovementDirection,
} from '../types';
import { fromHundredths, parseHundredths, toHundredths } from '@/lib/decimal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { X, Layers, AlertTriangle, Check, ArrowUpRight, ArrowDownLeft, Loader2, RotateCcw } from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (data: StockAdjustmentData) => Promise<StockAdjustmentResult> | StockAdjustmentResult;
}

interface ReasonOption {
  id: StockMovementReason;
  label: string;
  defaultDirection: StockMovementDirection;
  description: string;
}

// Motivos de ajuste manual: el conteo físico usa public.register_physical_count y el resto public.register_stock_adjustment
const REASONS: ReasonOption[] = [
  {
    id: 'physical_count',
    label: 'Ajuste por conteo físico',
    defaultDirection: 'increase',
    description: 'Conciliación periódica de inventario real en depósito o salón (incremento o decremento)',
  },
  {
    id: 'loss_damage',
    label: 'Merma, rotura o daño',
    defaultDirection: 'decrease',
    description: 'Egreso justificado por material dañado, vencido o inutilizable',
  },
  {
    id: 'internal_use',
    label: 'Consumo interno',
    defaultDirection: 'decrease',
    description: 'Material retirado para mantenimiento o uso operativo propio de la empresa',
  },
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  product,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState<StockMovementReason>('physical_count');
  const [direction, setDirection] = useState<StockMovementDirection>('increase');
  const [quantityInput, setQuantityInput] = useState('1');
  const [physicalCountInput, setPhysicalCountInput] = useState('0');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Clave de idempotencia única por intención de ajuste del usuario
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // Sincronizar estado inicial al abrir
  useEffect(() => {
    if (isOpen && product) {
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
    }
  }, [isOpen, product]);

  // Manejar tecla escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, isSubmitting]);

  if (!isOpen || !product) return null;

  function resetIdempotencyIfFresh() {
    if (isUncertain) {
      setIsUncertain(false);
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }

  // Manejar cambio de motivo
  function handleSelectReason(r: StockMovementReason) {
    resetIdempotencyIfFresh();
    setReason(r);
    const config = REASONS.find((item) => item.id === r);
    if (config) {
      setDirection(config.defaultDirection);
    }
    setErrorMessage(null);
  }

  // Calcular variación (delta) y dirección efectiva en centésimas exactas
  const isPhysicalCount = reason === 'physical_count';
  const inputHundredths = parseHundredths(isPhysicalCount ? physicalCountInput : quantityInput);
  const currentHundredths = toHundredths(product.stock);

  let deltaHundredths = 0;
  let effectiveDirection = direction;

  if (isPhysicalCount) {
    const diff = (inputHundredths ?? currentHundredths) - currentHundredths;
    effectiveDirection = diff >= 0 ? 'increase' : 'decrease';
    deltaHundredths = Math.abs(diff);
  } else {
    deltaHundredths = inputHundredths ?? 0;
  }

  const deltaQuantity = fromHundredths(deltaHundredths);
  const projectedStock = fromHundredths(
    effectiveDirection === 'increase'
      ? currentHundredths + deltaHundredths
      : currentHundredths - deltaHundredths
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (!product) return;

    if (inputHundredths === null) {
      setErrorMessage('Ingrese un número válido, mayor o igual a cero y con como máximo 2 decimales.');
      return;
    }

    if (!isPhysicalCount && inputHundredths <= 0) {
      setErrorMessage('La cantidad debe ser un número positivo mayor a cero.');
      return;
    }

    // Validación defensiva de unidades indivisibles
    const isDiscreteUnit = ['unidad', 'bulto', 'par'].includes(product.unit.toLowerCase());
    if (isDiscreteUnit && inputHundredths % 100 !== 0) {
      setErrorMessage(
        `La unidad "${product.unit}" es indivisible y no admite cantidades fraccionarias con decimales.`
      );
      return;
    }

    // Requerir justificación obligatoria para mermas o consumo interno
    if ((reason === 'loss_damage' || reason === 'internal_use') && !notes.trim()) {
      setErrorMessage(
        'Para registrar mermas o consumo interno se requiere indicar una justificación en las observaciones.'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        productId: product.id,
        reason,
        direction: effectiveDirection,
        quantity: deltaQuantity,
        countedQuantity: isPhysicalCount ? fromHundredths(inputHundredths) : undefined,
        notes: notes.trim() || undefined,
        referenceDoc: referenceDoc.trim() || undefined,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Ocurrió un error al registrar el movimiento.');
        if (res.uncertain) {
          setIsUncertain(true);
        }
      } else {
        onClose();
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Error al registrar el ajuste de existencias.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Ajustar Existencias de Stock
              </h2>
              <span className="text-xs text-text-muted">
                {product.name} • <span className="font-mono text-text-secondary">{product.sku}</span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Banner de error / incertidumbre */}
          {errorMessage && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                isUncertain
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                  : 'bg-danger/10 border-danger/25 text-danger'
              }`}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <span className="font-semibold block">
                  {isUncertain ? 'Resultado Incierto por Corte de Red' : 'Error en el ajuste'}
                </span>
                <p className="leading-relaxed whitespace-pre-line">{errorMessage}</p>
                {isUncertain && (
                  <p className="text-[11px] text-amber-200/90 pt-1">
                    El resultado en el servidor sigue sin confirmarse. No inicie un ajuste nuevo para compensar esta diferencia. Haga clic en <strong>Reintentar con la misma clave</strong> para reenviar la solicitud de forma segura sin duplicar el movimiento físico.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Reason Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Motivo del Ajuste <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {REASONS.map((r) => {
                const isSelected = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleSelectReason(r.id)}
                    className={`text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-text-primary shadow-sm'
                        : 'border-border/60 bg-surface-2/40 text-text-muted hover:border-border hover:bg-surface-2'
                    }`}
                  >
                    <div>
                      <span className="font-semibold block text-text-primary">{r.label}</span>
                      <span className="text-[11px] text-text-muted">{r.description}</span>
                    </div>
                    {isSelected && <Check size={14} className="text-primary shrink-0 ml-2" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inputs based on reason */}
          {reason === 'physical_count' ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Stock Físico Real Recontado ({product.unit}) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                step={['unidad', 'bulto', 'par'].includes(product.unit.toLowerCase()) ? '1' : '0.01'}
                required
                disabled={isSubmitting}
                value={physicalCountInput}
                onChange={(e) => {
                  resetIdempotencyIfFresh();
                  setPhysicalCountInput(e.target.value);
                }}
                className="w-full h-9 px-3 text-sm font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums disabled:opacity-50"
              />
              <span className="text-[11px] text-text-muted block">
                Ingrese el total de existencias presentes en salón o depósito. Al confirmar, el stock queda en este valor: la diferencia se calcula contra el stock vigente en ese momento, aunque haya ventas mientras cuenta.
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-secondary">
                  Sentido del Movimiento
                </label>
                <div className="grid grid-cols-2 p-1 bg-surface-2 border border-border rounded-lg">
                  <button
                    type="button"
                    disabled={true}
                    className="py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 text-text-muted/40 cursor-not-allowed"
                    title="Para mermas o consumo interno el sentido es estrictamente de salida"
                  >
                    <ArrowUpRight size={12} />
                    <span>Entrada (+)</span>
                  </button>
                  <button
                    type="button"
                    className="py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  >
                    <ArrowDownLeft size={12} />
                    <span>Salida (-)</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-secondary">
                  Cantidad a Mover ({product.unit}) <span className="text-danger">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step={['unidad', 'bulto', 'par'].includes(product.unit.toLowerCase()) ? '1' : '0.01'}
                  required
                  disabled={isSubmitting}
                  value={quantityInput}
                  onChange={(e) => {
                    resetIdempotencyIfFresh();
                    setQuantityInput(e.target.value);
                  }}
                  className="w-full h-9 px-3 text-sm font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums disabled:opacity-50"
                />
              </div>
            </div>
          )}

          {/* Projected Result Box */}
          <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-text-muted">
              <span>Stock actual en base:</span>
              <span className="font-mono tabular-nums">{product.stock} {product.unit}</span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>{isPhysicalCount ? 'Variación estimada:' : 'Variación calculada:'}</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  effectiveDirection === 'increase' ? 'text-emerald-400' : 'text-danger'
                }`}
              >
                {effectiveDirection === 'increase' ? '+' : '-'}{deltaQuantity} {product.unit}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
              <span className="font-bold text-text-primary">Stock resultante proyectado:</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text-primary font-mono tabular-nums">
                  {projectedStock} {product.unit}
                </span>
                {projectedStock < 0 ? (
                  <Badge variant="danger" size="sm">Quiebre / Negativo</Badge>
                ) : projectedStock === 0 ? (
                  <Badge variant="danger" size="sm">Agotado (0)</Badge>
                ) : projectedStock <= product.minStock ? (
                  <Badge variant="warning" size="sm">Bajo Mínimo</Badge>
                ) : (
                  <Badge variant="success" size="sm">Normal</Badge>
                )}
              </div>
            </div>
          </div>

          {/* Reference doc & Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Documento de Respaldo <span className="text-text-muted text-[11px]">(Opcional)</span>
            </label>
            <input
              type="text"
              disabled={isSubmitting}
              value={referenceDoc}
              onChange={(e) => {
                resetIdempotencyIfFresh();
                setReferenceDoc(e.target.value);
              }}
              placeholder="Ej. Remito R-00214, Acta de Inventario N° 05..."
              className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Observaciones / Justificación {(reason === 'loss_damage' || reason === 'internal_use') && <span className="text-danger">*</span>}
            </label>
            <textarea
              rows={2}
              disabled={isSubmitting}
              value={notes}
              onChange={(e) => {
                resetIdempotencyIfFresh();
                setNotes(e.target.value);
              }}
              placeholder="Detalle o justificación del ajuste físico..."
              className="w-full p-2.5 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none disabled:opacity-50"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" size="md" type="submit" disabled={isSubmitting} className="gap-1.5 shadow-md">
              {isSubmitting ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Registrando en base...</span>
                </>
              ) : isUncertain ? (
                <>
                  <RotateCcw size={15} />
                  <span>Reintentar con la misma clave</span>
                </>
              ) : (
                <>
                  <Check size={15} />
                  <span>Confirmar Ajuste en PostgreSQL</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
