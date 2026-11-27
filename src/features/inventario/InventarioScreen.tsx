import React, { useState } from 'react';
import { ExpiryPage } from '@/features/vencimientos/components/ExpiryPage';
import type { StockLotsState } from '@/features/vencimientos/hooks/useStockLots';
import { WarehousesPage } from '@/features/depositos/components/WarehousesPage';
import type { WarehousesState } from '@/features/depositos/hooks/useWarehouses';
import { InventarioPage } from './InventarioPage';

type Tab = 'productos' | 'vencimientos' | 'depositos';

interface ExpiryTab {
  lotsState: StockLotsState;
  isMasterAdmin: boolean;
  onStockChanged: () => void;
}

interface WarehousesTab {
  warehouses: WarehousesState;
  isMasterAdmin: boolean;
  canTransfer: boolean;
  onStockChanged: () => void;
}

type Props = React.ComponentProps<typeof InventarioPage> & {
  /** Pestaña Vencimientos; ausente si la persona no tiene acceso a productos. */
  expiry?: ExpiryTab;
  /** Pestaña Depósitos; ausente si hay un solo depósito y no es el admin. */
  depositos?: WarehousesTab;
};

const TAB_CLASS = (active: boolean) =>
  `px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
    active ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
  }`;

/** Inventario: catálogo de productos, vencimientos por lote y depósitos. */
export const InventarioScreen: React.FC<Props> = ({ expiry, depositos, ...inventory }) => {
  const [tab, setTab] = useState<Tab>('productos');
  if (!expiry && !depositos) return <InventarioPage {...inventory} />;

  const attention = expiry ? expiry.lotsState.summary.expiredLots + expiry.lotsState.summary.soonLots : 0;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'productos', label: 'Productos' },
    ...(expiry ? [{ key: 'vencimientos' as const, label: attention > 0 ? `Vencimientos (${attention})` : 'Vencimientos' }] : []),
    ...(depositos ? [{ key: 'depositos' as const, label: 'Depósitos' }] : []),
  ];
  const expiredWarning = (expiry?.lotsState.summary.expiredLots ?? 0) > 0;

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1.5 max-w-7xl mx-auto">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`${TAB_CLASS(tab === t.key)} ${t.key === 'vencimientos' && expiredWarning && tab !== t.key ? 'text-danger' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'vencimientos' && expiry ? (
        <div className="max-w-7xl mx-auto">
          <ExpiryPage companyId={inventory.company.id} lotsState={expiry.lotsState} canOperate={inventory.isMasterAdmin ?? false}
            isMasterAdmin={expiry.isMasterAdmin} onStockChanged={expiry.onStockChanged} />
        </div>
      ) : tab === 'depositos' && depositos ? (
        <div className="max-w-7xl mx-auto">
          <WarehousesPage companyId={inventory.company.id} warehouses={depositos.warehouses} products={inventory.products}
            canTransfer={depositos.canTransfer} isMasterAdmin={depositos.isMasterAdmin} onStockChanged={depositos.onStockChanged} />
        </div>
      ) : (
        <InventarioPage {...inventory} />
      )}
    </div>
  );
};
