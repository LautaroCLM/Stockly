import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Check } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import type { Product, StockMovementDirection, StockMovementReason } from '../types';
import { isIndivisibleUnit } from '../stockValidation';
import type { AdjustmentPreview } from '../adjustmentMath';

interface ReasonOption {
  id: StockMovementReason;
  label: string;
  defaultDirection: StockMovementDirection;
  description: string;
}

// El conteo físico usa register_physical_count y el resto register_stock_adjustment
export const ADJUSTMENT_REASONS: ReasonOption[] = [
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

const NUMBER_INPUT =
  'w-full h-9 px-3 text-sm font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums disabled:opacity-50';

export const ReasonPicker: React.FC<{
  value: StockMovementReason;
  disabled: boolean;
  onChange: (reason: StockMovementReason) => void;
}> = ({ value, disabled, onChange }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-text-secondary">
      Motivo del Ajuste <span className="text-danger">*</span>
    </label>
    <div className="grid grid-cols-1 gap-1.5">
      {ADJUSTMENT_REASONS.map((r) => {
        const isSelected = value === r.id;
        return (
          <button key={r.id} type="button" disabled={disabled} onClick={() => onChange(r.id)}
            className={`text-left p-2.5 rounded-xl border transition-all text-xs flex items-center justify-between ${
              isSelected
                ? 'border-primary bg-primary/10 text-text-primary shadow-sm'
                : 'border-border/60 bg-surface-2/40 text-text-muted hover:border-border hover:bg-surface-2'
            }`}>
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
);

export const QuantityFields: React.FC<{
  product: Product;
  isPhysicalCount: boolean;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}> = ({ product, isPhysicalCount, value, disabled, onChange }) => {
  // El mínimo debe ser múltiplo del paso: con min 0.01 y step 1 el navegador solo aceptaba 0,01; 1,01...
  const step = isIndivisibleUnit(product.unit.toLowerCase()) ? '1' : '0.01';
  if (isPhysicalCount) {
    return (
      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-secondary">
          Stock Físico Real Recontado ({product.unit}) <span className="text-danger">*</span>
        </label>
        <input type="number" min="0" step={step} required disabled={disabled} value={value}
          onChange={(e) => onChange(e.target.value)} className={NUMBER_INPUT} />
        <span className="text-[11px] text-text-muted block">
          Ingrese el total de existencias presentes en salón o depósito. Al confirmar, el stock queda en este valor: la diferencia se calcula contra el stock vigente en ese momento, aunque haya ventas mientras cuenta.
        </span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-secondary">Sentido del Movimiento</label>
        <div className="grid grid-cols-2 p-1 bg-surface-2 border border-border rounded-lg">
          <button type="button" disabled title="Para mermas o consumo interno el sentido es estrictamente de salida"
            className="py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 text-text-muted/40 cursor-not-allowed">
            <ArrowUpRight size={12} />
            <span>Entrada (+)</span>
          </button>
          <button type="button" className="py-1 text-xs font-semibold rounded flex items-center justify-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <ArrowDownLeft size={12} />
            <span>Salida (-)</span>
          </button>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-text-secondary">
          Cantidad a Mover ({product.unit}) <span className="text-danger">*</span>
        </label>
        <input type="number" min={step === '1' ? '1' : '0.01'} step={step} required disabled={disabled} value={value}
          onChange={(e) => onChange(e.target.value)} className={NUMBER_INPUT} />
      </div>
    </div>
  );
};

export const AdjustmentPreviewBox: React.FC<{ product: Product; isPhysicalCount: boolean; preview: AdjustmentPreview }> = ({
  product,
  isPhysicalCount,
  preview,
}) => {
  const { direction, deltaQuantity, projectedStock } = preview;
  return (
    <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-1.5 text-xs">
      <div className="flex items-center justify-between text-text-muted">
        <span>Stock actual en base:</span>
        <span className="font-mono tabular-nums">{product.stock} {product.unit}</span>
      </div>
      <div className="flex items-center justify-between text-text-muted">
        <span>{isPhysicalCount ? 'Variación estimada:' : 'Variación calculada:'}</span>
        <span className={`font-mono font-bold tabular-nums ${direction === 'increase' ? 'text-emerald-400' : 'text-danger'}`}>
          {direction === 'increase' ? '+' : '-'}{deltaQuantity} {product.unit}
        </span>
      </div>
      <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
        <span className="font-bold text-text-primary">Stock resultante proyectado:</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-text-primary font-mono tabular-nums">{projectedStock} {product.unit}</span>
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
  );
};
