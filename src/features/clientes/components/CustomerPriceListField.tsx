import React from 'react';
import type { PriceList } from '@/features/listas/types';
import { describeAdjustment } from '@/features/listas/priceListForm';

interface Props {
  lists: PriceList[];
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
}

/** Lista de precios del cliente: al elegirlo en una venta se cobra con esa lista. */
export const CustomerPriceListField: React.FC<Props> = ({ lists, value, disabled, onChange }) => {
  // Si ya tenía una lista desactivada, se sigue mostrando para no perderla al guardar
  const options = lists.filter((l) => l.isActive || l.id === value);
  if (options.length === 0) return null;
  const selected = options.find((l) => l.id === value);
  return (
    <div className="space-y-1.5">
      <label htmlFor="customer-price-list" className="text-xs font-medium text-foreground">Lista de precios</label>
      <select id="customer-price-list" value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}
        className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none cursor-pointer">
        <option value="">Precio normal</option>
        {options.map((l) => <option key={l.id} value={l.id}>{l.name}{l.isActive ? '' : ' (desactivada)'}</option>)}
      </select>
      <p className="text-[11px] text-muted-foreground">
        {selected ? `${describeAdjustment(selected.adjustmentPercent)}. Se aplica sola al elegirlo en una venta.` : 'Paga el precio de venta normal.'}
      </p>
    </div>
  );
};
