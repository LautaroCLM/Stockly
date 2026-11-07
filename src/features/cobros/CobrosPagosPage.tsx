import React, { useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { toHundredths, fromHundredths } from '@/lib/decimal';
import type { Company } from '@/types';
import { useCustomerAccounts } from './hooks/useCustomerAccounts';
import type { CustomerBalance } from './types';
import { BalancesTable } from './components/BalancesTable';
import { CollectionModal } from './components/CollectionModal';
import { StatementModal } from './components/StatementModal';

interface CobrosPagosPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

/** Cobros y Pagos. Hoy: cuenta corriente de clientes. Las deudas a proveedores llegan en la siguiente etapa. */
export const CobrosPagosPage: React.FC<CobrosPagosPageProps> = ({ company, isMasterAdmin }) => {
  const accounts = useCustomerAccounts(company.id);
  const [collecting, setCollecting] = useState<CustomerBalance | null>(null);
  const [statementOf, setStatementOf] = useState<CustomerBalance | null>(null);

  const receivableCents = accounts.balances.reduce((sum, b) => (b.balance > 0 ? sum + toHundredths(b.balance) : sum), 0);
  const debtors = accounts.balances.filter((b) => b.balance > 0).length;
  // El modal usa el saldo más reciente del cliente, no el de cuando se abrió
  const live = (c: CustomerBalance | null) => (c ? accounts.balances.find((b) => b.customerId === c.customerId) ?? c : null);
  const collectingLive = live(collecting);
  const statementLive = live(statementOf);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <ArrowLeftRight size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Cobros y Pagos</h1>
            <p className="text-xs text-text-muted">Cuenta corriente de clientes de {company.name}. Las deudas a proveedores llegan próximamente.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void accounts.reload()} disabled={accounts.isLoading} className="gap-1.5 h-9">
          <RotateCcw size={14} className={accounts.isLoading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-[11px] text-text-muted">Total a cobrar</p>
          <p className="text-xl font-bold tabular-nums text-text-primary">{formatCurrency(fromHundredths(receivableCents))}</p>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-[11px] text-text-muted">Clientes con deuda</p>
          <p className="text-xl font-bold tabular-nums text-text-primary">{debtors}</p>
        </div>
      </div>

      {accounts.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{accounts.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void accounts.reload()}>Reintentar</Button>
        </div>
      )}

      {accounts.isLoading && accounts.balances.length === 0 ? (
        <p className="py-12 text-center text-xs text-text-muted">
          <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
          Cargando cuentas corrientes...
        </p>
      ) : accounts.balances.length === 0 ? (
        !accounts.error && (
          <p className="py-12 text-center text-xs text-text-muted leading-relaxed">
            Todavía no hay ventas en cuenta corriente.<br />
            Al vender, elegí un cliente y usá el medio de pago "Cuenta corriente": la deuda aparece acá.
          </p>
        )
      ) : (
        <BalancesTable balances={accounts.balances} onCollect={setCollecting} onOpenStatement={setStatementOf} />
      )}

      {collectingLive && (
        <CollectionModal customer={collectingLive} onClose={() => setCollecting(null)} onSubmit={accounts.registerCollection} />
      )}
      {statementLive && (
        <StatementModal companyId={company.id} customer={statementLive} isMasterAdmin={isMasterAdmin}
          onClose={() => setStatementOf(null)} onVoid={accounts.voidCollection} />
      )}
    </div>
  );
};
