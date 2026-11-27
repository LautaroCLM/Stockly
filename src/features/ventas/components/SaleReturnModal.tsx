import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Loader2, Undo2, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import type { Sale } from '@/features/inventario/types';
import { fetchReturnedQuantities, processSaleReturnRpc } from '../api/saleReturnApi';
import { lineRefund, parseReturnQty } from '../returnMath';

interface SaleReturnModalProps {
  sale: Sale | null;
  companyId: string;
  onClose: () => void;
  onReturned: (returnNumber: string, refundAmount: number) => void;
}

const FIELD = 'w-16 h-8 px-2 text-xs text-center bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums';

/** Devolución parcial: qué líneas y cuántas unidades vuelven, el motivo y el efectivo a devolver desde la caja. */
const SaleReturnBody: React.FC<SaleReturnModalProps & { sale: Sale }> = ({ sale, companyId, onClose, onReturned }) => {
  const [returned, setReturned] = useState<Map<string, number> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const keyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    fetchReturnedQuantities(companyId, sale.id).then(setReturned).catch((e: Error) => setLoadError(e.message));
  }, [companyId, sale.id]);

  const lines = sale.items.filter((i) => i.saleItemId).map((item) => {
    const remaining = Math.max(0, item.quantity - (returned?.get(item.saleItemId ?? '') ?? 0));
    const value = parseReturnQty(qty[item.saleItemId ?? ''] ?? '', remaining);
    return { item, remaining, value, refund: value ? lineRefund(item.subtotal, item.quantity, value, sale.subtotal, sale.total) : 0 };
  });
  const chosen = lines.filter((l) => l.value && l.value > 0);
  const invalid = lines.some((l) => l.value === null);
  const total = fromHundredths(chosen.reduce((sum, l) => sum + toHundredths(l.refund), 0));

  const submit = async () => {
    if (invalid) return setError('Revisá las cantidades: no pueden superar lo que queda por devolver.');
    if (chosen.length === 0) return setError('Elegí al menos una cantidad para devolver.');
    if (!reason.trim()) return setError('Indicá el motivo de la devolución.');
    setIsSubmitting(true);
    setError(null);
    const result = await processSaleReturnRpc(companyId, sale.id,
      chosen.map((l) => ({ saleItemId: l.item.saleItemId as string, quantity: l.value as number })), reason.trim(), keyRef.current);
    setIsSubmitting(false);
    if (!result.ok) return setError(result.message);
    onReturned(result.returnNumber, result.refundAmount);
  };

  return (
    <ModalFrame ariaLabel={`Devolver productos de ${sale.saleNumber}`} onBackdropClick={() => !isSubmitting && onClose()} panelClassName="max-w-xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
        <div>
          <h2 className="text-base font-bold text-text-primary">Devolver productos · {sale.saleNumber}</h2>
          <p className="text-xs text-text-muted">El stock vuelve y el efectivo sale de la caja abierta.</p>
        </div>
        <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
      </div>
      <div className="p-6 space-y-4 min-h-0 flex-1 overflow-y-auto text-xs">
        {loadError ? <p role="alert" className="text-danger">{loadError}</p> : !returned ? (
          <p className="flex items-center gap-2 text-text-muted"><Loader2 size={14} className="animate-spin" />Cargando lo ya devuelto…</p>
        ) : (
          <ul className="rounded-xl border border-border divide-y divide-border/50">
            {lines.map(({ item, remaining, value, refund }) => (
              <li key={item.saleItemId} className={`flex items-center gap-3 px-3 py-2 ${remaining === 0 ? 'opacity-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary truncate">{item.name}</p>
                  <p className="text-[10px] text-text-muted">Vendidas {formatNumber(item.quantity)} · quedan {formatNumber(remaining)} · {formatCurrency(item.unitPrice)} c/u</p>
                </div>
                <input inputMode="decimal" placeholder="0" disabled={remaining === 0} value={qty[item.saleItemId ?? ''] ?? ''}
                  aria-label={`Cantidad a devolver de ${item.name}`} aria-invalid={value === null}
                  onChange={(e) => setQty((q) => ({ ...q, [item.saleItemId ?? '']: e.target.value }))}
                  className={`${FIELD} ${value === null ? '!border-danger' : ''}`} />
                <span className="w-24 text-right tabular-nums text-text-secondary">{refund > 0 ? formatCurrency(refund) : ''}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="block space-y-1">
          <span className="font-semibold text-text-secondary">Motivo <span className="text-danger">*</span></span>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="Ej. Producto fallado / no era la medida"
            className="w-full h-9 px-3 bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none" />
        </label>
        {sale.total < sale.subtotal && <p className="text-[11px] text-text-muted">La venta tuvo descuento: se devuelve la parte proporcional.</p>}
        {error && <p role="alert" className="p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger">{error}</p>}
      </div>
      <div className="p-4 px-6 border-t border-border bg-surface-2/40 flex items-center justify-between gap-3">
        <span className="text-xs text-text-secondary">Efectivo a devolver: <strong className="text-base text-text-primary tabular-nums">{formatCurrency(total)}</strong></span>
        <Button variant="primary" size="md" onClick={() => void submit()} disabled={isSubmitting || !returned} className="gap-1.5">
          {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}<span>Registrar devolución</span>
        </Button>
      </div>
    </ModalFrame>
  );
};

export const SaleReturnModal: React.FC<SaleReturnModalProps> = (props) => (
  <AnimatePresence>{props.sale && <SaleReturnBody {...props} sale={props.sale} />}</AnimatePresence>
);
