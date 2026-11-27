import React from 'react';
import { UserCheck } from 'lucide-react';
import type { SellersState } from '../hooks/useSellers';

interface Props {
  sellers: SellersState;
  disabled?: boolean;
}

/** Vendedor de la venta (para su comisión). Solo aparece si hay vendedores con porcentaje. */
export const CheckoutSeller: React.FC<Props> = ({ sellers, disabled }) => {
  if (sellers.choices.length === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-surface-2/40">
      <label htmlFor="checkout-seller" className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
        <UserCheck size={14} className="text-primary" />Vendedor
      </label>
      <select id="checkout-seller" value={sellers.selected?.id ?? ''} disabled={disabled}
        onChange={(e) => sellers.select(e.target.value || null)}
        className="h-8 px-2 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary cursor-pointer">
        <option value="">Sin vendedor</option>
        {sellers.choices.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </div>
  );
};
