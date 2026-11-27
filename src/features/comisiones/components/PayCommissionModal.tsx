import React, { useState } from 'react';
import { HandCoins, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { formatCurrency } from '@/lib/formatters';
import { formatLotDate } from '@/features/vencimientos/lotStatus';
import { EXPENSE_METHOD_LABELS, EXPENSE_PAYMENT_METHODS, type ExpensePaymentMethod } from '@/features/gastos/types';
import { payCommissionRpc } from '../api/commissionsApi';
import type { SellerSummary } from '../types';

interface Props {
  companyId: string;
  summary: SellerSummary;
  period: { from: string; to: string };
  onClose: () => void;
  onPaid: () => void;
}

/** Pagar la comisión de un vendedor por el período: queda como gasto "Comisiones". */
export const PayCommissionModal: React.FC<Props> = ({ companyId, summary, period, onClose, onPaid }) => {
  const [method, setMethod] = useState<ExpensePaymentMethod>('efectivo');
  const [fromCash, setFromCash] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsBusy(true);
    setError(null);
    const result = await payCommissionRpc(companyId, summary.employeeId, period.from, period.to, method, method === 'efectivo' && fromCash);
    setIsBusy(false);
    if (result.ok) onPaid();
    else setError(result.message);
  };

  return (
    <CashModalShell title={`Pagar comisión a ${summary.employeeName}`}
      subtitle={`Del ${formatLotDate(period.from)} al ${formatLotDate(period.to)}`} icon={<HandCoins size={18} />} isBusy={isBusy} onClose={onClose}>
      <form onSubmit={pay} className="p-6 space-y-3 text-xs">
        <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2 border border-border">
          <span className="text-text-secondary">Comisión del período</span>
          <span className="text-base font-bold text-text-primary tabular-nums">{formatCurrency(summary.commission)}</span>
        </div>
        <div className="space-y-1">
          <label htmlFor="pay-method" className="block font-semibold text-text-secondary">Medio de pago</label>
          <select id="pay-method" value={method} disabled={isBusy} className={CASH_FIELD_CLASS}
            onChange={(e) => setMethod(e.target.value as ExpensePaymentMethod)}>
            {EXPENSE_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{EXPENSE_METHOD_LABELS[m]}</option>)}
          </select>
        </div>
        {method === 'efectivo' && (
          <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
            <input type="checkbox" checked={fromCash} disabled={isBusy} onChange={(e) => setFromCash(e.target.checked)} />
            Sacar el efectivo de la caja abierta
          </label>
        )}
        <p className="text-text-muted">
          Se registra un gasto "Comisiones de vendedores" y el período queda pagado. Si anulás ese gasto en Gastos, el período se reabre.
        </p>
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" disabled={isBusy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isBusy} className="gap-1.5">
            {isBusy && <Loader2 size={14} className="animate-spin" />}<span>Registrar pago</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
