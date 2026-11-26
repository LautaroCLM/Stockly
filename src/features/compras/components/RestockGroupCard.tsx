import React from 'react';
import { MessageCircle, PackagePlus, Truck } from 'lucide-react';
import { formatNumber } from '@/lib/formatters';
import type { Product } from '@/features/inventario/types';
import type { RestockGroup } from '../restockPlan';

export interface LineState {
  include: boolean;
  quantity: string;
}

interface RestockGroupCardProps {
  group: RestockGroup;
  lines: Record<string, LineState>;
  onLineChange: (productId: string, patch: Partial<LineState>) => void;
  canRegister: boolean;
  /** Para el grupo sin proveedor: proveedores activos y el elegido para este pedido. */
  supplierOptions: { id: string; name: string }[];
  pickedSupplierId: string;
  onPickSupplier: (id: string) => void;
  onWhatsApp: () => void;
  onRegister: () => void;
}

const FIELD = 'h-8 w-20 px-2 text-xs text-right bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums';

/** Un proveedor con sus productos para reponer: elegir qué pedir, cuánto, y pedirlo o registrar la compra. */
export const RestockGroupCard: React.FC<RestockGroupCardProps> = ({ group, lines, onLineChange, canRegister, supplierOptions, pickedSupplierId, onPickSupplier, onWhatsApp, onRegister }) => {
  const selected = group.items.filter((i) => lines[i.product.id]?.include).length;
  const stockText = (p: Product) => `Stock ${formatNumber(p.stock)} · mínimo ${formatNumber(p.minStock)}`;

  return (
    <section className="rounded-xl border border-border bg-surface-2/30 overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-surface-2/60">
        <div className="flex items-center gap-2 min-w-0">
          <Truck size={15} className="text-primary shrink-0" />
          <span className="text-xs font-bold text-text-primary truncate">{group.supplier?.name ?? 'Sin proveedor asignado'}</span>
          <span className="text-[11px] text-text-muted shrink-0">{selected} de {group.items.length}</span>
        </div>
        {!group.supplier && supplierOptions.length > 0 && (
          <select value={pickedSupplierId} onChange={(e) => onPickSupplier(e.target.value)} aria-label="Proveedor para este pedido"
            className="h-8 max-w-[200px] px-2 text-[11px] bg-surface-3 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary">
            <option value="">Elegí a quién pedirle…</option>
            {supplierOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </header>
      <ul className="divide-y divide-border/50">
        {group.items.map(({ product }) => {
          const line = lines[product.id];
          return (
            <li key={product.id} className={`flex items-center gap-3 px-4 py-2 ${line?.include ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={line?.include ?? false} aria-label={`Incluir ${product.name}`}
                onChange={(e) => onLineChange(product.id, { include: e.target.checked })} className="w-4 h-4 accent-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-text-primary truncate">{product.name}</p>
                <p className={`text-[10px] ${product.stock <= 0 ? 'text-danger' : 'text-warning'}`}>{stockText(product)}</p>
              </div>
              <input inputMode="decimal" value={line?.quantity ?? ''} aria-label={`Cantidad a pedir de ${product.name}`}
                disabled={!line?.include} onChange={(e) => onLineChange(product.id, { quantity: e.target.value })} className={FIELD} />
              <span className="w-12 text-[10px] text-text-muted truncate">{product.unit}</span>
            </li>
          );
        })}
      </ul>
      <footer className="flex flex-wrap items-center justify-end gap-2 px-4 py-2.5 border-t border-border">
        <button type="button" onClick={onWhatsApp} disabled={selected === 0}
          className="h-8 px-3 rounded-lg text-[11px] font-semibold text-white bg-[#25D366] hover:bg-[#1fb857] flex items-center gap-1.5 disabled:opacity-40">
          <MessageCircle size={14} />Pedir por WhatsApp
        </button>
        {canRegister && pickedSupplierId !== '' && (
          <button type="button" onClick={onRegister} disabled={selected === 0}
            title="Cuando llegue la mercadería: abre la compra ya cargada para sumar el stock"
            className="h-8 px-3 rounded-lg text-[11px] font-semibold text-primary border border-primary/40 hover:bg-primary/10 flex items-center gap-1.5 disabled:opacity-40">
            <PackagePlus size={14} />Registrar compra recibida
          </button>
        )}
      </footer>
    </section>
  );
};
