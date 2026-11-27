import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Pencil, Plus, Tags } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import type { Product } from '@/features/inventario/types';
import { savePriceListRpc } from '../api/priceListsApi';
import { usePriceLists } from '../hooks/usePriceLists';
import { useListPrices } from '../hooks/useListPrices';
import { describeAdjustment } from '../priceListForm';
import { ROUNDING_LABELS, type PriceList } from '../types';
import { ListPricesTable } from './ListPricesTable';
import { PriceListFormModal } from './PriceListFormModal';

interface Props {
  company: Company;
  canOperate: boolean;
  products: Product[];
}

/** Listas de precios: porcentaje sobre el precio de venta, con excepciones por producto. Se asignan a clientes. */
export const PriceListsPage: React.FC<Props> = ({ company, canOperate, products }) => {
  const { lists, isLoaded, error, reload } = usePriceLists(company.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PriceList | 'new' | null>(null);
  const selected = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;
  const listPrices = useListPrices(company.id, selected?.id ?? null);

  const save = async (id: string | null, values: Parameters<typeof savePriceListRpc>[2]) => {
    const result = await savePriceListRpc(company.id, id, values);
    if (result.ok) {
      await reload();
      setSelectedId(result.value);
      void listPrices.reload();
    }
    return result;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-text-muted max-w-xl">
          Cada lista es un porcentaje sobre el precio de venta. Asignale una lista a un cliente (en Clientes) y, al elegirlo en una venta, se cobra con esa lista.
        </p>
        {canOperate && (
          <Button variant="primary" size="sm" className="gap-1.5" onClick={() => setEditing('new')}><Plus size={14} /><span>Nueva lista</span></Button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {isLoaded && lists.length === 0 ? (
        <div className="py-12 text-center text-xs text-text-muted space-y-1">
          <Tags size={28} className="mx-auto text-text-muted" />
          <p>Todavía no hay listas de precios.</p>
          {canOperate && <p>Creá una, por ejemplo "Mayorista" con -15 %.</p>}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <div className="space-y-2" role="tablist" aria-label="Listas de precios">
            {lists.map((l) => (
              <div key={l.id} role="tab" aria-selected={selected?.id === l.id} tabIndex={0} onClick={() => setSelectedId(l.id)}
                onKeyDown={(e) => e.key === 'Enter' && setSelectedId(l.id)}
                className={`p-3 rounded-xl border cursor-pointer ${selected?.id === l.id ? 'border-primary bg-primary/10' : 'border-border bg-surface-2 hover:border-primary/50'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-text-primary">{l.name}</span>
                  {canOperate && (
                    <button type="button" aria-label={`Editar ${l.name}`} className="p-1 rounded text-text-muted hover:text-text-primary"
                      onClick={(e) => { e.stopPropagation(); setEditing(l); }}><Pencil size={13} /></button>
                  )}
                </div>
                <p className="text-[11px] text-text-secondary">{describeAdjustment(l.adjustmentPercent)} · {ROUNDING_LABELS[l.roundingStep]}</p>
                {!l.isActive && <p className="text-[11px] text-warning">Desactivada: sus clientes pagan el precio normal</p>}
              </div>
            ))}
          </div>
          {selected && (
            <div className="space-y-2">
              {listPrices.error && <p role="alert" className="text-xs text-danger">{listPrices.error}</p>}
              <ListPricesTable products={products} prices={listPrices.prices} canOperate={canOperate} onSetFixed={listPrices.setFixed} />
            </div>
          )}
        </div>
      )}
      <AnimatePresence>
        {editing && <PriceListFormModal list={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSave={save} />}
      </AnimatePresence>
    </div>
  );
};
