import React, { useState } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { Sale } from '@/features/inventario/types';
import { setSaleSellerRpc } from '../api/commissionsApi';
import type { Seller } from '../types';

interface Props {
  companyId: string;
  sale: Sale;
  sellers: Seller[];
  onClose: () => void;
  onSaved: () => void;
}

/** Corregir el vendedor de una venta (si su comisión todavía no se pagó). */
export const SaleSellerModal: React.FC<Props> = ({ companyId, sale, sellers, onClose, onSaved }) => {
  const [sellerId, setSellerId] = useState(sale.sellerId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setError(null);
    const result = await setSaleSellerRpc(companyId, sale.id, sellerId || null);
    setIsBusy(false);
    if (result.ok) onSaved();
    else setError(result.message);
  };

  return (
    <CashModalShell title="Vendedor de la venta" subtitle={sale.saleNumber} icon={<UserCheck size={18} />} isBusy={isBusy} onClose={onClose}>
      <form onSubmit={save} className="p-6 space-y-3 text-xs">
        <div className="space-y-1">
          <label htmlFor="sale-seller" className="block font-semibold text-text-secondary">Vendedor</label>
          <select id="sale-seller" value={sellerId} disabled={isBusy} className={CASH_FIELD_CLASS} onChange={(e) => setSellerId(e.target.value)}>
            <option value="">Sin vendedor</option>
            {sellers.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.percent} %)</option>)}
          </select>
        </div>
        <p className="text-text-muted">Se usa el porcentaje actual del vendedor elegido. Queda registrado en la auditoría.</p>
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" disabled={isBusy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isBusy} className="gap-1.5">
            {isBusy && <Loader2 size={14} className="animate-spin" />}<span>Guardar</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
