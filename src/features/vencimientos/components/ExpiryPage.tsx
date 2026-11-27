import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CalendarClock, Loader2, Search } from 'lucide-react';
import { lotStatus } from '../lotStatus';
import { useLotActions } from '../hooks/useLotActions';
import type { StockLotsState } from '../hooks/useStockLots';
import type { StockLot } from '../types';
import { LotActionModal, type LotAction } from './LotActionModal';
import { LotsTable } from './LotsTable';
import { WarningDaysSetting } from './WarningDaysSetting';

type Filter = 'attention' | 'expired' | 'soon' | 'all';

interface Props {
  companyId: string;
  lotsState: StockLotsState;
  canOperate: boolean;
  isMasterAdmin: boolean;
  onStockChanged: () => void;
}

/** Inventario → Vencimientos: lotes con lo que queda, filtros, editar, separar y dar de baja. */
export const ExpiryPage: React.FC<Props> = ({ companyId, lotsState, canOperate, isMasterAdmin, onStockChanged }) => {
  const { lots, summary, warningDays, isLoaded, error, reload } = lotsState;
  const actions = useLotActions(companyId, reload, onStockChanged);
  const [filter, setFilter] = useState<Filter>('attention');
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<{ lot: StockLot; action: LotAction } | null>(null);

  const filters: { key: Filter; label: string }[] = [
    { key: 'attention', label: `Vencidos y por vencer (${summary.expiredLots + summary.soonLots})` },
    { key: 'expired', label: `Vencidos (${summary.expiredLots})` },
    { key: 'soon', label: `Por vencer (${summary.soonLots})` },
    { key: 'all', label: `Todos (${lots.length})` },
  ];

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lots.filter((lot) => {
      const status = lotStatus(lot, warningDays);
      const passes =
        filter === 'all' || (filter === 'attention' ? status === 'expired' || status === 'soon' : status === filter);
      return passes && (!q || lot.productName.toLowerCase().includes(q) || lot.sku.toLowerCase().includes(q) || (lot.lotCode ?? '').toLowerCase().includes(q));
    });
  }, [lots, warningDays, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted max-w-xl">
          Solo aparecen los productos con "Controla vencimiento" (se activa al editar el producto). Las ventas descuentan solas del lote que vence primero.
        </p>
        {isMasterAdmin && <WarningDaysSetting warningDays={warningDays} onSave={actions.setWarningDays} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filtrar lotes" className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                filter === f.key ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto o lote"
            className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
        </div>
      </div>

      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {!isLoaded ? (
        <p className="py-10 text-center text-xs text-text-muted"><Loader2 size={14} className="inline animate-spin mr-2" />Cargando vencimientos...</p>
      ) : shown.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-muted space-y-1">
          <CalendarClock size={28} className="mx-auto" />
          <p>{lots.length === 0 ? 'Todavía no hay productos con vencimiento y stock.' : 'No hay lotes en este filtro.'}</p>
          {lots.length === 0 && <p>Editá un producto, marcá "Controla vencimiento" y cargá la fecha en cada compra.</p>}
        </div>
      ) : (
        <LotsTable lots={shown} warningDays={warningDays} canOperate={canOperate} onAction={(lot, action) => setActive({ lot, action })} />
      )}

      <AnimatePresence>
        {active && (
          <LotActionModal lot={active.lot} action={active.action} onClose={() => setActive(null)}
            onEdit={actions.edit} onSplit={actions.split} onWriteOff={actions.writeOff} />
        )}
      </AnimatePresence>
    </div>
  );
};
