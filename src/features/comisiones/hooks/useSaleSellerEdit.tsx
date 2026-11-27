import React, { useCallback, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Pencil } from 'lucide-react';
import type { Sale } from '@/features/inventario/types';
import { useSellers } from './useSellers';
import { SaleSellerModal } from '../components/SaleSellerModal';

/**
 * Vendedor en el Historial de Ventas: nombre en cada fila, ticket con "Lo atendió" y,
 * con permiso de Personal, corregir el vendedor de una venta.
 */
export function useSaleSellerEdit(companyId: string, canEdit: boolean, onChanged: () => void) {
  const sellers = useSellers(companyId);
  const [editing, setEditing] = useState<Sale | null>(null);

  const withSellerName = useCallback(
    (sale: Sale): Sale => ({ ...sale, sellerName: sale.sellerId ? sellers.names.get(sale.sellerId) ?? null : null }),
    [sellers.names]
  );

  const slotFor = (sale: Sale): React.ReactNode => {
    const name = sale.sellerId ? sellers.names.get(sale.sellerId) : null;
    if (!name && (!canEdit || sellers.choices.length === 0 || sale.status === 'anulada')) return null;
    return (
      <div className="flex items-center gap-1 text-[11px] text-text-muted">
        <span>{name ? `Vendedor: ${name}` : 'Sin vendedor'}</span>
        {canEdit && sale.status === 'completada' && (
          <button type="button" aria-label={`Cambiar vendedor de ${sale.saleNumber}`} title="Cambiar vendedor"
            className="p-0.5 rounded hover:text-text-primary" onClick={() => setEditing(sale)}>
            <Pencil size={11} />
          </button>
        )}
      </div>
    );
  };

  const modal = (
    <AnimatePresence>
      {editing && (
        <SaleSellerModal companyId={companyId} sale={editing} sellers={sellers.choices}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      )}
    </AnimatePresence>
  );

  return { slotFor, withSellerName, modal };
}
