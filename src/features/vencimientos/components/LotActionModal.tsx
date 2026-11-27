import React, { useState } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { fromHundredths, parseHundredths } from '@/lib/decimal';
import { formatLotDate } from '../lotStatus';
import type { LotActionResult, StockLot } from '../types';

export type LotAction = 'edit' | 'split' | 'writeOff';

interface Props {
  lot: StockLot;
  action: LotAction;
  onClose: () => void;
  onEdit: (lot: StockLot, lotCode: string, expiresOn: string) => Promise<LotActionResult>;
  onSplit: (lot: StockLot, quantity: number, lotCode: string, expiresOn: string) => Promise<LotActionResult>;
  onWriteOff: (lot: StockLot) => Promise<LotActionResult>;
}

const TITLES: Record<LotAction, string> = {
  edit: 'Fecha y número de lote',
  split: 'Separar unidades con otra fecha',
  writeOff: 'Dar de baja el lote',
};

/** Editar un lote, separar parte de sus unidades en otro con su fecha, o darlo de baja. */
export const LotActionModal: React.FC<Props> = ({ lot, action, onClose, onEdit, onSplit, onWriteOff }) => {
  const [expiresOn, setExpiresOn] = useState(action === 'edit' ? lot.expiresOn ?? '' : '');
  const [lotCode, setLotCode] = useState(action === 'edit' ? lot.lotCode ?? '' : '');
  const [quantityText, setQuantityText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const lotLabel = `${lot.productName}${lot.lotCode ? ` · lote ${lot.lotCode}` : ''} · ${formatLotDate(lot.expiresOn)}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    let run: () => Promise<LotActionResult>;
    if (action === 'writeOff') {
      run = () => onWriteOff(lot);
    } else {
      if (!expiresOn) return setError('Indicá la fecha de vencimiento.');
      if (action === 'edit') {
        run = () => onEdit(lot, lotCode, expiresOn);
      } else {
        const cents = parseHundredths(quantityText);
        if (cents === null || cents <= 0) return setError('Escribí cuántas unidades separar (ej. 12 o 2,5).');
        run = () => onSplit(lot, fromHundredths(cents), lotCode, expiresOn);
      }
    }
    setIsBusy(true);
    const result = await run();
    setIsBusy(false);
    if (result.ok) onClose();
    else setError(result.message);
  };

  return (
    <CashModalShell title={TITLES[action]} subtitle={lotLabel} icon={<CalendarClock size={18} />} isBusy={isBusy} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-3 text-xs">
        {action === 'writeOff' ? (
          <p className="text-text-secondary">
            Se registra una salida por <strong className="text-text-primary">{lot.remaining} {lot.unit}</strong> como pérdida en el Historial
            y el stock baja en esa cantidad. No se puede deshacer, pero se puede corregir con un ajuste de stock.
          </p>
        ) : (
          <>
            {action === 'split' && (
              <div className="space-y-1">
                <label htmlFor="lot-qty" className="block font-semibold text-text-secondary">Unidades a separar (hay {lot.remaining})</label>
                <input id="lot-qty" inputMode="decimal" value={quantityText} disabled={isBusy} autoFocus
                  className={CASH_FIELD_CLASS} onChange={(e) => setQuantityText(e.target.value)} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="lot-date" className="block font-semibold text-text-secondary">Vence</label>
                <input id="lot-date" type="date" value={expiresOn} disabled={isBusy} className={CASH_FIELD_CLASS} onChange={(e) => setExpiresOn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <label htmlFor="lot-code" className="block font-semibold text-text-secondary">Número de lote</label>
                <input id="lot-code" value={lotCode} maxLength={50} disabled={isBusy} placeholder="Opcional"
                  className={CASH_FIELD_CLASS} onChange={(e) => setLotCode(e.target.value)} />
              </div>
            </div>
            {action === 'split' && <p className="text-text-muted">El stock no cambia: solo se reparten las unidades entre dos fechas.</p>}
          </>
        )}
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5">
          <Button type="button" variant="secondary" size="sm" disabled={isBusy} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant={action === 'writeOff' ? 'danger' : 'primary'} size="sm" disabled={isBusy} className="gap-1.5">
            {isBusy && <Loader2 size={14} className="animate-spin" />}
            <span>{action === 'writeOff' ? 'Dar de baja' : action === 'split' ? 'Separar' : 'Guardar'}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
