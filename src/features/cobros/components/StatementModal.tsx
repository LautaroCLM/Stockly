import React, { useState } from 'react';
import { Ban, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { ACCOUNT_LABELS } from '../accountKinds';
import type { AccountKind } from '../accountKinds';
import { useAccountStatement } from '../hooks/useAccounts';
import { withRunningBalance } from '../collectionMath';
import type { AccountBalance, CollectionActionResult } from '../types';

interface StatementModalProps {
  kind: AccountKind;
  companyId: string;
  party: AccountBalance;
  /** Anular cobros o pagos requiere poder operar el módulo. */
  canVoid: boolean;
  onClose: () => void;
  onVoid: (paymentId: string, reason: string) => Promise<CollectionActionResult>;
}

/** Estado de cuenta: cargos a crédito y cobros o pagos, con saldo acumulado. El admin puede anular cobros o pagos. */
export const StatementModal: React.FC<StatementModalProps> = ({ kind, companyId, party, canVoid, onClose, onVoid }) => {
  const labels = ACCOUNT_LABELS[kind];
  const { entries, isLoading, error } = useAccountStatement(kind, companyId, party.partyId);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [voidError, setVoidError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const rows = withRunningBalance(entries);

  const confirmVoid = async () => {
    if (!voidingId) return;
    if (!reason.trim()) return setVoidError({ message: 'Indicá el motivo de la anulación.' });
    setIsVoiding(true);
    setVoidError(null);
    const result = await onVoid(voidingId, reason.trim());
    setIsVoiding(false);
    if (result.ok) {
      setVoidingId(null);
      setReason('');
    } else setVoidError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title="Estado de cuenta" subtitle={`${party.partyName} · saldo ${formatCurrency(party.balance)}`}
      icon={<FileText size={18} />} isBusy={isVoiding} onClose={onClose}>
      <div className="p-6 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
        {error && <CashFormError message={error} />}
        {isLoading ? (
          <p className="py-6 text-center text-text-muted"><Loader2 size={14} className="inline animate-spin mr-2 text-primary" />Cargando...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-text-muted">{labels.emptyStatement}</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-text-muted border-b border-border">
                <th className="py-2 font-semibold">Fecha</th>
                <th className="py-2 font-semibold">Detalle</th>
                <th className="py-2 font-semibold text-right">Importe</th>
                <th className="py-2 font-semibold text-right">Saldo</th>
                <th className="w-8"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ entry, balance }) => (
                <tr key={`${entry.kind}-${entry.referenceId}`} className="border-b border-border/60 last:border-0">
                  <td className="py-2 text-text-secondary whitespace-nowrap">{formatDateShort(entry.occurredAt)}</td>
                  <td className="py-2 text-text-primary">{entry.kind === 'charge' ? `${labels.chargeEntry} ${entry.document}` : labels.paymentEntry}</td>
                  <td className={`py-2 text-right tabular-nums ${entry.amount < 0 ? 'text-emerald-400' : 'text-text-primary'}`}>{formatCurrency(entry.amount)}</td>
                  <td className="py-2 text-right tabular-nums text-text-secondary">{formatCurrency(balance)}</td>
                  <td className="py-2 text-right">
                    {canVoid && entry.kind === 'payment' && (
                      <button onClick={() => { setVoidingId(entry.referenceId); setVoidError(null); }} aria-label={labels.voidButton} title={labels.voidButton}
                        className="p-1 rounded text-text-muted hover:text-danger hover:bg-surface-2"><Ban size={13} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {voidingId && (
          <div className="p-3 rounded-xl bg-surface-2 border border-border space-y-2">
            <p className="text-text-secondary">{labels.voidHelp}</p>
            <input aria-label="Motivo de la anulación" maxLength={500} placeholder="Motivo (obligatorio)" value={reason}
              onChange={(e) => setReason(e.target.value)} disabled={isVoiding} className={CASH_FIELD_CLASS} />
            <CashFormError message={voidError?.message ?? null} uncertain={voidError?.uncertain} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={isVoiding} onClick={() => setVoidingId(null)}>Cancelar</Button>
              <Button type="button" variant="primary" size="sm" disabled={isVoiding} onClick={() => void confirmVoid()} className="gap-1.5">
                {isVoiding && <Loader2 size={14} className="animate-spin" />}<span>{labels.voidButton}</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </CashModalShell>
  );
};
