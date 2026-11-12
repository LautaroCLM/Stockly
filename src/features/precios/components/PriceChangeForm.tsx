import React from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Category } from '@/features/inventario/types';
import type { Supplier } from '@/features/proveedores/types';
import { validatePercent, toggleId } from '../priceMath';
import { ROUNDING_LABELS, ROUNDING_STEPS } from '../types';
import type { RoundingStep } from '../types';
import { ChipSelector } from './ChipSelector';

export interface PriceFormState {
  direction: 'up' | 'down';
  percentText: string;
  step: RoundingStep;
  categoryIds: string[];
  supplierIds: string[];
  note: string;
}

export const INITIAL_PRICE_FORM: PriceFormState = {
  direction: 'up', percentText: '', step: 1, categoryIds: [], supplierIds: [], note: '',
};

interface PriceChangeFormProps {
  value: PriceFormState;
  categories: Category[];
  suppliers: Supplier[];
  disabled?: boolean;
  onChange: (patch: Partial<PriceFormState>) => void;
}

const FIELD = 'h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary disabled:opacity-50';

/** Qué cambio hacer: subir o bajar, cuánto, cómo redondear y a qué productos. */
export const PriceChangeForm: React.FC<PriceChangeFormProps> = ({ value, categories, suppliers, disabled, onChange }) => {
  const percentError = value.percentText.trim() === '' ? null : validatePercent(value.percentText, value.direction);
  const segment = 'flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold transition-colors focus:outline-none disabled:opacity-50';

  return (
    <section className="p-4 rounded-xl bg-surface border border-border space-y-4" aria-label="Datos del cambio de precios">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-text-secondary">Qué querés hacer</span>
          <div className="flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Subir o bajar precios">
            <button type="button" disabled={disabled} aria-pressed={value.direction === 'up'} onClick={() => onChange({ direction: 'up' })}
              className={cn(segment, value.direction === 'up' ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-text-secondary')}>
              <ArrowUp size={14} />Subir precios
            </button>
            <button type="button" disabled={disabled} aria-pressed={value.direction === 'down'} onClick={() => onChange({ direction: 'down' })}
              className={cn(segment, 'border-l border-border', value.direction === 'down' ? 'bg-primary/15 text-primary' : 'bg-surface-2 text-text-secondary')}>
              <ArrowDown size={14} />Bajar precios
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price-percent" className="text-xs font-semibold text-text-secondary">Porcentaje</label>
          <div className="relative">
            <input id="price-percent" inputMode="decimal" placeholder="Ej: 10" value={value.percentText} disabled={disabled} autoFocus
              aria-invalid={percentError !== null} aria-describedby={percentError ? 'price-percent-error' : undefined}
              onChange={(e) => onChange({ percentText: e.target.value })} className={cn(FIELD, 'w-32 pr-7')} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="price-rounding" className="text-xs font-semibold text-text-secondary">Redondear precios</label>
          <select id="price-rounding" value={value.step} disabled={disabled} className={cn(FIELD, 'cursor-pointer')}
            onChange={(e) => onChange({ step: ROUNDING_STEPS.find((s) => s === Number(e.target.value)) ?? 1 })}>
            {ROUNDING_STEPS.map((step) => <option key={step} value={step}>{ROUNDING_LABELS[step]}</option>)}
          </select>
        </div>
      </div>
      {percentError && <p id="price-percent-error" role="alert" className="text-[11px] text-danger">{percentError}</p>}

      <ChipSelector label="Categorías" allLabel="Todas las categorías" items={categories} selectedIds={value.categoryIds} disabled={disabled}
        onToggle={(id) => onChange({ categoryIds: toggleId(value.categoryIds, id) })} onClear={() => onChange({ categoryIds: [] })} />
      <ChipSelector label="Proveedores" allLabel="Todos los proveedores" items={suppliers} selectedIds={value.supplierIds} disabled={disabled}
        onToggle={(id) => onChange({ supplierIds: toggleId(value.supplierIds, id) })} onClear={() => onChange({ supplierIds: [] })} />

      <div className="space-y-1.5">
        <label htmlFor="price-note" className="text-xs font-semibold text-text-secondary">Nota (opcional)</label>
        <input id="price-note" value={value.note} maxLength={200} disabled={disabled} placeholder="Ej: Nueva lista de precios de noviembre"
          onChange={(e) => onChange({ note: e.target.value })} className={cn(FIELD, 'w-full')} />
      </div>
    </section>
  );
};
