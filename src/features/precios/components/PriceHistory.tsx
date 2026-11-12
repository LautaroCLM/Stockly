import React, { useState } from 'react';
import { Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateTime, formatNumber } from '@/lib/formatters';
import type { PriceBatch, PriceResult, RevertedChange } from '../types';

interface PriceHistoryProps {
  batches: PriceBatch[];
  canOperate: boolean;
  scopeText: (batch: PriceBatch) => string;
  onRevert: (batchId: string) => Promise<PriceResult<RevertedChange>>;
  onResult: (message: string, kind: 'ok' | 'error') => void;
}

/** Cambios anteriores. Cada uno se puede revertir una sola vez. */
export const PriceHistory: React.FC<PriceHistoryProps> = ({ batches, canOperate, scopeText, onRevert, onResult }) => {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const revert = async (batch: PriceBatch) => {
    setBusyId(batch.id);
    const result = await onRevert(batch.id);
    setBusyId(null);
    setConfirmingId(null);
    if (!result.ok) return onResult(result.message, 'error');
    const { reverted, skipped } = result.value;
    onResult(
      skipped > 0
        ? `Se devolvió el precio anterior a ${formatNumber(reverted)} productos. ${formatNumber(skipped)} no se tocaron porque su precio ya se había cambiado después.`
        : `Se devolvió el precio anterior a ${formatNumber(reverted)} productos.`,
      'ok'
    );
  };

  return (
    <ul className="space-y-2" aria-label="Historial de cambios de precios">
      {batches.map((b) => {
        const up = b.percent > 0;
        return (
          <li key={b.id} className="p-3.5 rounded-xl bg-surface border border-border flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-bold text-text-primary">
                <span className={up ? 'text-success' : 'text-danger'}>{up ? '+' : '-'}{formatNumber(Math.abs(b.percent))} %</span>
                <span className="font-normal text-text-secondary"> · {formatNumber(b.itemsCount)} productos · {scopeText(b)}</span>
              </p>
              <p className="text-[11px] text-text-muted">
                {formatDateTime(b.createdAt)}
                {b.note ? ` · ${b.note}` : ''}
                {b.status === 'reverted' && b.revertedAt ? ` · Revertido el ${formatDateTime(b.revertedAt)} (${formatNumber(b.revertedItems ?? 0)} productos)` : ''}
              </p>
            </div>
            {b.status === 'reverted' ? (
              <span className="text-[11px] font-semibold px-2 py-1 rounded-md bg-surface-2 text-text-muted">Revertido</span>
            ) : canOperate && confirmingId === b.id ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-text-secondary">¿Devolver los precios anteriores?</span>
                <Button size="sm" variant="secondary" disabled={busyId === b.id} onClick={() => setConfirmingId(null)}>No</Button>
                <Button size="sm" variant="danger" disabled={busyId === b.id} onClick={() => void revert(b)} className="gap-1.5">
                  {busyId === b.id && <Loader2 size={13} className="animate-spin" />}Sí, revertir
                </Button>
              </div>
            ) : canOperate ? (
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setConfirmingId(b.id)}>
                <Undo2 size={13} />Revertir
              </Button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};
