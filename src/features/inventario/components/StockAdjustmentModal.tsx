import React, { useState, useEffect } from 'react';
import { Product, StockAdjustmentData, StockMovementReason, StockMovementDirection } from '../types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { X, Layers, AlertTriangle, Check, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onSubmit: (data: StockAdjustmentData) => { success: boolean; error?: string };
}

interface ReasonOption {
  id: StockMovementReason;
  label: string;
  defaultDirection: StockMovementDirection;
  description: string;
}

const REASONS: ReasonOption[] = [
  {
    id: 'initial_load',
    label: 'Carga inicial de stock',
    defaultDirection: 'increase',
    description: 'Establecer existencias físicas iniciales al dar de alta el producto',
  },
  {
    id: 'purchase',
    label: 'Entrada de mercadería',
    defaultDirection: 'increase',
    description: 'Recepción física de mercadería o lote de compra',
  },
  {
    id: 'physical_count',
    label: 'Ajuste por conteo físico',
    defaultDirection: 'increase',
    description: 'Conciliación periódica de inventario en salón o depósito',
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
    description: 'Material retirado para mantenimiento o uso operativo propio',
  },
];

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  isOpen,
  product,
  onClose,
  onSubmit,
}) => {
  const [reason, setReason] = useState<StockMovementReason>('purchase');
  const [direction, setDirection] = useState<StockMovementDirection>('increase');
  const [quantityInput, setQuantityInput] = useState('1');
  const [physicalCountInput, setPhysicalCountInput] = useState('0');
  const [referenceDoc, setReferenceDoc] = useState('');
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync defaults on open
  useEffect(() => {
    if (isOpen && product) {
      setErrorMessage(null);
      setReferenceDoc('');
      setNotes('');
      // If product has 0 stock, suggest initial_load
      if (product.stock === 0) {
        setReason('initial_load');
        setDirection('increase');
        setQuantityInput('10');
      } else {
        setReason('purchase');
        setDirection('increase');
        setQuantityInput('1');
      }
      setPhysicalCountInput(product.stock.toString());
    }
  }, [isOpen, product]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  // Handle reason change
  function handleSelectReason(r: StockMovementReason) {
    setReason(r);
    const config = REASONS.find((item) => item.id === r);
    if (config) {
      setDirection(config.defaultDirection);
    }
    setErrorMessage(null);
  }

  // Calculate new stock and delta
  let deltaQuantity = 0;
  let effectiveDirection = direction;

  if (reason === 'physical_count') {
    const targetCount = parseFloat(physicalCountInput) || 0;
    const diff = targetCount - product.stock;
    if (diff >= 0) {
      effectiveDirection = 'increase';
      deltaQuantity = diff;
    } else {
      effectiveDirection = 'decrease';
      deltaQuantity = Math.abs(diff);
    }
  } else {
    deltaQuantity = parseFloat(quantityInput) || 0;
    effectiveDirection = direction;
  }

  const projectedStock =
    effectiveDirection === 'increase'
      ? product.stock + deltaQuantity
      : product.stock - deltaQuantity;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMessage(null);

    if (deltaQuantity <= 0) {
      setErrorMessage(
        reason === 'physical_count'
          ? 'El conteo físico ingresado es idéntico al stock actual. No hay variación.'
          : 'La cantidad debe ser un número positivo mayor a cero.'
      );
      return;
    }

    // Require notes for loss, internal_use, or physical_count
    if ((reason === 'loss_damage' || reason === 'internal_use') && !notes.trim()) {
      setErrorMessage('Para registrar mermas o consumo interno se requiere indicar una justificación en las observaciones.');
      return;
    }

    const res = onSubmit({
      productId: product!.id,
      reason,
      direction: effectiveDirection,
      quantity: deltaQuantity,
      notes: notes.trim() || undefined,
      referenceDoc: referenceDoc.trim() || undefined,
    });

    if (!res.success) {
      setErrorMessage(res.error || 'Ocurrió un error al registrar el movimiento.');
    } else {
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

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
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Current Stock Banner */}
          <div className="bg-surface-2/70 border border-border rounded-xl p-3 flex items-center justify-between">
            <div>
              <span className="text-xs text-text-muted block">Stock actual registrado:</span>
              <span className="text-lg font-bold text-text-primary tabular-nums">
                {product.stock} <span className="text-xs font-normal text-text-muted">{product.unit}</span>
              </span>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-text-muted block">Umbral de reposición:</span>
              <span className="text-xs font-semibold text-text-secondary tabular-nums">
                Mínimo: {product.minStock} {product.unit}
              </span>
            </div>
          </div>

          {/* Reason Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-text-secondary">
              Motivo del Movimiento <span className="text-danger">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {REASONS.map((r) => {
                const isSelected = reason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelectReason(r.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-0.5 ${
                      isSelected
                        ? 'bg-primary/15 border-primary text-text-primary shadow-sm'
                        : 'bg-surface-2 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{r.label}</span>
                      {r.defaultDirection === 'increase' ? (
                        <ArrowUpRight size={13} className="text-emerald-400" />
                      ) : (
                        <ArrowDownLeft size={13} className="text-amber-400" />
                      )}
                    </div>
                    <span className="text-[10px] text-text-muted line-clamp-1">
                      {r.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity or Physical Count Input */}
          {reason === 'physical_count' ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Conteo Físico Real Comprobado ({product.unit}) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={physicalCountInput}
                onChange={(e) => setPhysicalCountInput(e.target.value)}
                placeholder="Cantidad contada en depósito..."
                className="w-full h-9 px-3 text-sm font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-secondary">
                  Sentido del Ajuste
                </label>
                <div className="grid grid-cols-2 gap-1.5 bg-surface-2 p-1 rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setDirection('increase')}
                    className={`py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 transition-all ${
                      direction === 'increase'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <ArrowUpRight size={12} />
                    <span>Entrada (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('decrease')}
                    className={`py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 transition-all ${
                      direction === 'decrease'
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
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
                  min="1"
                  step="1"
                  required
                  value={quantityInput}
                  onChange={(e) => setQuantityInput(e.target.value)}
                  className="w-full h-9 px-3 text-sm font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Projected Result Box */}
          <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-text-muted">
              <span>Stock previo:</span>
              <span className="font-mono tabular-nums">{product.stock} {product.unit}</span>
            </div>
            <div className="flex items-center justify-between text-text-muted">
              <span>Variación calculada:</span>
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
              value={referenceDoc}
              onChange={(e) => setReferenceDoc(e.target.value)}
              placeholder="Ej. Remito R-00214, Acta de Inventario N° 05..."
              className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Observaciones / Justificación {(reason === 'loss_damage' || reason === 'internal_use') && <span className="text-danger">*</span>}
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalle o justificación del ajuste físico..."
              className="w-full p-2.5 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" size="md" type="submit" className="gap-1.5 shadow-md">
              <Check size={15} />
              <span>Confirmar Ajuste de Stock</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
