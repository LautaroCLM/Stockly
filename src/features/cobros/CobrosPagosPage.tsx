import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, ArrowLeftRight, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { toHundredths, fromHundredths } from '@/lib/decimal';
import type { Company } from '@/types';
import { ACCOUNT_LABELS } from './accountKinds';
import type { AccountKind } from './accountKinds';
import { useAccounts } from './hooks/useAccounts';
import type { AccountBalance } from './types';
import { BalancesTable } from './components/BalancesTable';
import { CollectionModal } from './components/CollectionModal';
import { StatementModal } from './components/StatementModal';

interface CobrosPagosPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

const KINDS: AccountKind[] = ['customer', 'supplier'];

/** Cobros y Pagos: cuenta corriente de clientes (lo que nos deben) y de proveedores (lo que debemos). */
export const CobrosPagosPage: React.FC<CobrosPagosPageProps> = ({ company, isMasterAdmin }) => {
  const [kind, setKind] = useState<AccountKind>('customer');
  const labels = ACCOUNT_LABELS[kind];
  const accounts = useAccounts(kind, company.id);
  const [settling, setSettling] = useState<AccountBalance | null>(null);
  const [statementOf, setStatementOf] = useState<AccountBalance | null>(null);

  const changeKind = (next: AccountKind) => {
    setKind(next);
    setSettling(null);
    setStatementOf(null);
  };

  const totalCents = accounts.balances.reduce((sum, b) => (b.balance > 0 ? sum + toHundredths(b.balance) : sum), 0);
  const debtors = accounts.balances.filter((b) => b.balance > 0).length;
  // El modal usa el saldo más reciente, no el de cuando se abrió
  const live = (p: AccountBalance | null) => (p ? accounts.balances.find((b) => b.partyId === p.partyId) ?? p : null);
  const settlingLive = live(settling);
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
            <p className="text-xs text-text-muted">{labels.intro} de {company.name}.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void accounts.reload()} disabled={accounts.isLoading} className="gap-1.5 h-9">
          <RotateCcw size={14} className={accounts.isLoading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </Button>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1.5">
        {KINDS.map((k) => (
          <button key={k} role="tab" aria-selected={kind === k} onClick={() => changeKind(k)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              kind === k ? 'bg-primary/10 border-primary text-text-primary' : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
            }`}>{ACCOUNT_LABELS[k].tabLabel}</button>
        ))}
      </div>

      <div data-stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-[11px] text-text-muted">{labels.totalCard}</p>
          <p className="text-xl font-bold tabular-nums text-text-primary">{formatCurrency(fromHundredths(totalCents))}</p>
        </div>
        <div className="p-4 rounded-xl bg-surface border border-border">
          <p className="text-[11px] text-text-muted">{labels.debtorsCard}</p>
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
        !accounts.error && <p className="py-12 text-center text-xs text-text-muted leading-relaxed">{labels.emptyList}</p>
      ) : (
        <BalancesTable kind={kind} balances={accounts.balances} onSettle={setSettling} onOpenStatement={setStatementOf} />
      )}

      <AnimatePresence>
        {settlingLive && <CollectionModal kind={kind} party={settlingLive} onClose={() => setSettling(null)} onSubmit={accounts.register} />}
      </AnimatePresence>
      <AnimatePresence>
        {statementLive && (
          <StatementModal kind={kind} companyId={company.id} party={statementLive} isMasterAdmin={isMasterAdmin}
            onClose={() => setStatementOf(null)} onVoid={accounts.voidPayment} />
        )}
      </AnimatePresence>
    </div>
  );
};
