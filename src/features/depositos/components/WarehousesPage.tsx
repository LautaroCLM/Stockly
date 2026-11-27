import React from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/feedback/ToastProvider';
import { formatDateTime } from '@/lib/formatters';
import type { Product } from '@/features/inventario/types';
import type { WarehousesState } from '../hooks/useWarehouses';
import { useWarehouseStock } from '../hooks/useWarehouseStock';
import { TransferForm } from './TransferForm';
import { WarehouseManager } from './WarehouseManager';
import { WarehouseStockTable } from './WarehouseStockTable';

interface Props {
  companyId: string;
  warehouses: WarehousesState;
  products: Product[];
  canTransfer: boolean;
  isMasterAdmin: boolean;
  onStockChanged: () => void;
}

/** Inventario → Depósitos: administración, stock por depósito y transferencias. */
export const WarehousesPage: React.FC<Props> = ({ companyId, warehouses, products, canTransfer, isMasterAdmin, onStockChanged }) => {
  const data = useWarehouseStock(companyId);
  const { notify } = useToast();
  const active = warehouses.active;
  const from = warehouses.defaultWarehouse?.id ?? active[0]?.id ?? '';
  const to = (warehouses.current && warehouses.current.id !== from ? warehouses.current.id : active.find((w) => w.id !== from)?.id) ?? '';

  return (
    <div className="space-y-4">
      <p className="text-xs text-text-muted max-w-2xl">
        Cada PC elige su depósito en el encabezado: lo que se vende, compra, ajusta o cuenta en esa PC mueve el stock de ese depósito.
        Los vencimientos por lote son de toda la empresa.
      </p>
      {isMasterAdmin && <WarehouseManager companyId={companyId} warehouses={warehouses} />}
      {data.error && <p role="alert" className="text-xs text-danger">{data.error}</p>}
      {!data.stock ? (
        !data.error && <p className="py-8 text-center text-xs text-text-muted"><Loader2 size={14} className="inline animate-spin mr-2" />Cargando stock por depósito...</p>
      ) : active.length < 2 ? (
        <p className="py-6 text-center text-xs text-text-muted">Con un solo depósito activo, todo el stock está en "{active[0]?.name ?? 'Principal'}". Agregá otro para empezar a transferir.</p>
      ) : (
        <>
          {canTransfer && (
            <TransferForm key={`${from}-${to}`} companyId={companyId} warehouses={active} products={products} stock={data.stock}
              defaultFrom={from} defaultTo={to}
              onDone={(number) => { notify({ message: `Transferencia ${number} registrada` }); void data.reload(); onStockChanged(); }} />
          )}
          <WarehouseStockTable products={products} warehouses={active} stock={data.stock} />
          {data.transfers.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-bold text-text-primary">Últimas transferencias</h2>
              {data.transfers.map((t) => (
                <div key={t.id} className="p-3 rounded-xl border border-border bg-surface-2/40 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-text-primary">{t.number}</span>
                    <span className="text-text-secondary">{warehouses.names.get(t.fromId)} → {warehouses.names.get(t.toId)}</span>
                    <span className="text-text-muted ml-auto">{formatDateTime(t.createdAt)}</span>
                  </div>
                  <div className="text-text-secondary mt-1">{t.items.map((i) => `${i.quantity} × ${i.name}`).join(' · ')}</div>
                  {t.notes && <div className="text-text-muted mt-0.5">{t.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
