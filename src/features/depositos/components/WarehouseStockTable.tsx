import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { Product } from '@/features/inventario/types';
import type { StockByWarehouse, Warehouse } from '../types';

interface Props {
  products: Product[];
  warehouses: Warehouse[];
  stock: StockByWarehouse;
}

const MAX_ROWS = 100;
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });

/** Stock de cada producto en cada depósito activo, más el total. */
export const WarehouseStockTable: React.FC<Props> = ({ products, warehouses, stock }) => {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => p.isActive !== false && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)));
    return list.slice(0, MAX_ROWS);
  }, [products, query]);

  return (
    <div className="space-y-2">
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto por nombre o SKU"
          className="w-full h-8 pl-8 pr-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
      </div>
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-text-muted border-b border-border">
              <th className="p-2.5 text-left">Producto</th>
              {warehouses.map((w) => <th key={w.id} className="p-2.5 text-right whitespace-nowrap">{w.name}</th>)}
              <th className="p-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const byWh = stock.get(p.id);
              return (
                <tr key={p.id} className="border-b border-border/60">
                  <td className="p-2.5"><div className="font-medium text-text-primary">{p.name}</div><div className="text-text-muted font-mono">{p.sku}</div></td>
                  {warehouses.map((w) => {
                    const q = byWh?.get(w.id) ?? 0;
                    return <td key={w.id} className={`p-2.5 text-right tabular-nums ${q < 0 ? 'text-danger' : q === 0 ? 'text-text-muted' : 'text-text-primary'}`}>{fmt(q)}</td>;
                  })}
                  <td className="p-2.5 text-right tabular-nums font-semibold text-text-primary">{fmt(p.stock)} <span className="text-text-muted font-normal">{p.unit}</span></td>
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
