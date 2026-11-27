import React, { useState } from 'react';
import { PriceListsPage } from '@/features/listas/components/PriceListsPage';
import { PreciosPage } from './PreciosPage';

type Tab = 'masivo' | 'listas';
const TABS: { key: Tab; label: string }[] = [
  { key: 'masivo', label: 'Cambio masivo' },
  { key: 'listas', label: 'Listas de precios' },
];

/** Cambio de Precios: cambio masivo por porcentaje y listas de precios (mayorista, etc.). */
export const PreciosScreen: React.FC<React.ComponentProps<typeof PreciosPage>> = (props) => {
  const [tab, setTab] = useState<Tab>('masivo');
  return (
    <div className="space-y-4">
      <div role="tablist" className="flex flex-wrap gap-1.5 max-w-6xl mx-auto">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              tab === t.key ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'masivo' ? (
        <PreciosPage {...props} />
      ) : (
        <div className="max-w-6xl mx-auto">
          <PriceListsPage company={props.company} canOperate={props.canOperate} products={props.products} />
        </div>
      )}
    </div>
  );
};
