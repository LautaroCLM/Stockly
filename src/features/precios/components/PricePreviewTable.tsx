import React from 'react';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { rowChangePercent } from '../priceMath';
import type { PreviewRow } from '../types';

interface PricePreviewTableProps {
  rows: PreviewRow[];
  excluded: ReadonlySet<string>;
  disabled?: boolean;
  onToggle: (productId: string) => void;
  onToggleAll: (selectAll: boolean) => void;
}

/** Productos que cambiarían, con precio actual y nuevo. Se puede destildar los que no se quieren tocar. */
export const PricePreviewTable: React.FC<PricePreviewTableProps> = ({ rows, excluded, disabled, onToggle, onToggleAll }) => {
  const allSelected = excluded.size === 0;
  return (
    <div className="rounded-xl border border-border overflow-hidden bg-surface">
      <div className="max-h-[420px] overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-2 text-text-muted z-10">
            <tr>
              <th scope="col" className="w-10 p-2.5 text-center">
                <input type="checkbox" aria-label="Seleccionar todos los productos" checked={allSelected} disabled={disabled}
                  onChange={(e) => onToggleAll(e.target.checked)} />
              </th>
              <th scope="col" className="p-2.5 text-left font-semibold">Producto</th>
              <th scope="col" className="p-2.5 text-right font-semibold">Precio actual</th>
              <th scope="col" className="p-2.5 text-right font-semibold">Precio nuevo</th>
              <th scope="col" className="p-2.5 text-right font-semibold">Cambio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const off = excluded.has(row.productId);
              const change = rowChangePercent(row);
              return (
                <tr key={row.productId} className={`border-t border-border/60 ${off ? 'opacity-40' : ''}`}>
                  <td className="p-2.5 text-center">
                    <input type="checkbox" aria-label={`Cambiar el precio de ${row.name}`} checked={!off} disabled={disabled}
                      onChange={() => onToggle(row.productId)} />
                  </td>
                  <td className="p-2.5">
                    <span className="block text-text-primary font-medium">{row.name}</span>
                    <span className="block text-[10px] text-text-muted">{row.sku}</span>
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-text-secondary">{formatCurrency(row.oldPrice)}</td>
                  <td className="p-2.5 text-right tabular-nums font-bold text-text-primary">{formatCurrency(row.newPrice)}</td>
                  <td className={`p-2.5 text-right tabular-nums ${change >= 0 ? 'text-success' : 'text-danger'}`}>{formatPercent(change)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
