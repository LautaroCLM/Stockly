import React, { useState } from 'react';
import { ExpiryPage } from '@/features/vencimientos/components/ExpiryPage';
import type { StockLotsState } from '@/features/vencimientos/hooks/useStockLots';
import { InventarioPage } from './InventarioPage';

type Tab = 'productos' | 'vencimientos';

interface ExpiryTab {
  lotsState: StockLotsState;
  isMasterAdmin: boolean;
  onStockChanged: () => void;
}

type Props = React.ComponentProps<typeof InventarioPage> & {
  /** Pestaña Vencimientos; ausente si la persona no tiene acceso a productos. */
  expiry?: ExpiryTab;
};

/** Inventario: catálogo de productos y vencimientos por lote. */
export const InventarioScreen: React.FC<Props> = ({ expiry, ...inventory }) => {
  const [tab, setTab] = useState<Tab>('productos');
  if (!expiry) return <InventarioPage {...inventory} />;

  const attention = expiry.lotsState.summary.expiredLots + expiry.lotsState.summary.soonLots;
  const tabs: { key: Tab; label: string }[] = [
    { key: 'productos', label: 'Productos' },
    { key: 'vencimientos', label: attention > 0 ? `Vencimientos (${attention})` : 'Vencimientos' },
  ];

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1.5 max-w-7xl mx-auto">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === t.key ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
            } ${t.key === 'vencimientos' && expiry.lotsState.summary.expiredLots > 0 && tab !== t.key ? 'text-danger' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'productos' ? (
        <InventarioPage {...inventory} />
      ) : (
        <div className="max-w-7xl mx-auto">
          <ExpiryPage companyId={inventory.company.id} lotsState={expiry.lotsState} canOperate={inventory.isMasterAdmin ?? false}
            isMasterAdmin={expiry.isMasterAdmin} onStockChanged={expiry.onStockChanged} />
        </div>
      )}
    </div>
  );
};
