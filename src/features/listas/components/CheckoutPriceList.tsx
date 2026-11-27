import React from 'react';
import { Loader2, Tags } from 'lucide-react';
import type { SalePricing } from '../hooks/useSalePricing';
import { describeAdjustment } from '../priceListForm';

const CUSTOMER_LIST = '__cliente__';
const NO_LIST = '__normal__';

/** En el cobro: qué lista de precios se aplica. El Master Admin puede cambiarla para esta venta. */
export const CheckoutPriceList: React.FC<{ pricing: SalePricing; disabled: boolean }> = ({ pricing, disabled }) => {
  const { list, lists, canChange, isOverride, isRepricing, error } = pricing;
  if (!canChange && !list && !error) return null;

  const value = !isOverride ? CUSTOMER_LIST : list ? list.id : NO_LIST;
  const choose = (v: string) => pricing.chooseList(v === CUSTOMER_LIST ? undefined : v === NO_LIST ? null : v);

  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-text-secondary flex items-center gap-1.5">
          <Tags size={14} className="text-primary" /> Lista de precios
          {isRepricing && <Loader2 size={12} className="animate-spin text-primary" />}
        </span>
        {canChange && lists.length > 0 ? (
          <select aria-label="Lista de precios de la venta" value={value} disabled={disabled} onChange={(e) => choose(e.target.value)}
            className="h-8 px-2 text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary cursor-pointer">
            <option value={CUSTOMER_LIST}>La del cliente</option>
            <option value={NO_LIST}>Precio normal</option>
            {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ) : (
          <span className="font-bold text-text-primary">{list ? list.name : 'Precio normal'}</span>
        )}
      </div>
      <p className="text-text-muted">{list ? `${list.name}: ${describeAdjustment(list.adjustmentPercent)}.` : 'Se cobra el precio de venta normal.'}</p>
      {error && <p role="alert" className="text-warning">{error}</p>}
    </div>
  );
};
