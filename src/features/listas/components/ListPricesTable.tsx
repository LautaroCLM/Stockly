import React, { useMemo, useState } from 'react';
import { Loader2, Lock, Search, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, parseHundredths } from '@/lib/decimal';
import type { Product } from '@/features/inventario/types';
import type { ListActionResult, ListPrice } from '../types';

interface Props {
  products: Product[];
  prices: Map<string, ListPrice> | null;
  canOperate: boolean;
  onSetFixed: (productId: string, price: number | null) => Promise<ListActionResult>;
}

const MAX_ROWS = 100;

/** Cómo queda cada producto en la lista; se puede fijar un precio propio (excepción) o volver al porcentaje. */
export const ListPricesTable: React.FC<Props> = ({ products, prices, canOperate, onSetFixed }) => {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = products.filter((p) => p.isActive !== false);
    const found = q ? active.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)) : active;
    return found.slice(0, MAX_ROWS);
  }, [products, query]);

  const save = async (productId: string, price: number | null) => {
    setBusy(productId);
    setError(null);
    const result = await onSetFixed(productId, price);
    setBusy(null);
    if (result.ok) setEditing(null);
    else setError(result.message);
  };
  const confirmEdit = () => {
    if (!editing) return;
    const cents = parseHundredths(editing.text);
    if (cents === null) return setError('Escribí el precio sin puntos de miles, con hasta 2 decimales (ej. 850 o 849,99).');
    void save(editing.id, fromHundredths(cents));
  };

  if (!prices) return <p className="py-8 text-center text-xs text-text-muted"><Loader2 size={14} className="inline animate-spin mr-2" />Calculando precios...</p>;

  return (
    <div className="space-y-2">
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto por nombre, código o SKU"
          className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-xs min-w-[520px]">
          <thead><tr className="text-text-muted border-b border-border">
            <th className="p-2.5 text-left">Producto</th><th className="p-2.5 text-right">Precio normal</th>
            <th className="p-2.5 text-right">En esta lista</th>{canOperate && <th className="p-2.5" />}
          </tr></thead>
          <tbody>
            {rows.map((p) => {
              const lp = prices.get(p.id);
              const isEditing = editing?.id === p.id;
              return (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="p-2.5"><div className="font-medium text-text-primary">{p.name}</div><div className="text-text-muted font-mono">{p.sku}</div></td>
                  <td className="p-2.5 text-right tabular-nums text-text-secondary">{formatCurrency(p.salePrice)}</td>
                  <td className="p-2.5 text-right tabular-nums font-semibold text-text-primary">
                    {isEditing ? (
                      <input autoFocus aria-label={`Precio fijo de ${p.name}`} inputMode="decimal" value={editing.text}
                        onChange={(e) => setEditing({ id: p.id, text: e.target.value })}
                        onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditing(null); }}
                        className="w-28 h-7 px-2 text-right bg-surface-2 border border-primary rounded-lg text-text-primary focus:outline-none" />
                    ) : (
                      <span className="inline-flex items-center gap-1">{lp?.isFixed && <Lock size={11} className="text-warning" aria-label="Precio fijado" />}{formatCurrency(lp?.price ?? p.salePrice)}</span>
                    )}
                  </td>
                  {canOperate && (
                    <td className="p-2.5 text-right whitespace-nowrap">
                      {busy === p.id ? <Loader2 size={14} className="inline animate-spin text-primary" /> : isEditing ? (
                        <Button size="sm" variant="primary" className="h-7 px-2.5 text-xs" onClick={confirmEdit}>Guardar</Button>
                      ) : (
                        <>
                          <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs" onClick={() => setEditing({ id: p.id, text: String(lp?.price ?? p.salePrice).replace('.', ',') })}>Fijar precio</Button>
                          {lp?.isFixed && (
                            <Button size="sm" variant="secondary" className="h-7 px-2 text-xs ml-1.5" title="Volver al porcentaje de la lista" onClick={() => void save(p.id, null)}><Undo2 size={13} /></Button>
                          )}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === MAX_ROWS && <p className="text-[11px] text-text-muted">Se muestran los primeros {MAX_ROWS}. Buscá para encontrar otros.</p>}
    </div>
  );
};
