import React from 'react';
import { formatCurrency, formatNumber } from '@/lib/formatters';
import { DENOMINATIONS, type Denomination } from '../../cashCount';
import { CASH_FIELD_CLASS } from '../CashModalShell';

export type CountMode = 'bills' | 'total';

interface CashCountStepProps {
  mode: CountMode;
  onModeChange: (mode: CountMode) => void;
  counts: Partial<Record<Denomination, string>>;
  onCountChange: (value: Denomination, text: string) => void;
  loose: string;
  onLooseChange: (text: string) => void;
  total: string;
  onTotalChange: (text: string) => void;
  invalid: readonly Denomination[];
  countedTotal: number | null;
}

const MODE_BUTTON = 'flex-1 py-1.5 rounded-lg text-[11px] font-semibold transition-colors';

/** Paso 2: contar el efectivo, billete por billete (suma sola) o escribiendo el total. */
export const CashCountStep: React.FC<CashCountStepProps> = (p) => (
  <div className="space-y-3">
    <div className="flex gap-1 p-1 rounded-xl bg-surface-2 border border-border" role="radiogroup" aria-label="Forma de contar">
      {(['bills', 'total'] as const).map((mode) => (
        <button key={mode} type="button" role="radio" aria-checked={p.mode === mode} onClick={() => p.onModeChange(mode)}
          className={`${MODE_BUTTON} ${p.mode === mode ? 'bg-primary text-white' : 'text-text-muted hover:text-text-primary'}`}>
          {mode === 'bills' ? 'Contar por billete' : 'Escribir el total'}
        </button>
      ))}
    </div>

    {p.mode === 'bills' ? (
      <>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
          {DENOMINATIONS.map((value) => {
            const qty = Number(p.counts[value] || 0);
            const isInvalid = p.invalid.includes(value);
            return (
              <label key={value} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-right font-semibold text-text-secondary tabular-nums">${formatNumber(value)}</span>
                <span className="text-text-muted">×</span>
                <input inputMode="numeric" autoComplete="off" value={p.counts[value] ?? ''} placeholder="0"
                  aria-label={`Cantidad de billetes de ${formatNumber(value)} pesos`} aria-invalid={isInvalid}
                  onChange={(e) => p.onCountChange(value, e.target.value)}
                  className={`${CASH_FIELD_CLASS} !h-8 !w-14 shrink-0 text-center ${isInvalid ? '!border-danger' : ''}`} />
                <span className="flex-1 min-w-0 truncate text-right text-[11px] text-text-muted tabular-nums">
                  {qty > 0 && !isInvalid ? `$ ${formatNumber(qty * value)}` : ''}
                </span>
              </label>
            );
          })}
        </div>
        <label className="flex items-center gap-2">
          <span className="text-text-secondary">Monedas y otros ($)</span>
          <input inputMode="decimal" autoComplete="off" value={p.loose} placeholder="0" onChange={(e) => p.onLooseChange(e.target.value)}
            className={`${CASH_FIELD_CLASS} !h-8 flex-1`} />
        </label>
      </>
    ) : (
      <label className="block space-y-1">
        <span className="font-semibold text-text-secondary">Efectivo contado en el cajón ($)</span>
        <input id="counted-amount" inputMode="decimal" autoComplete="off" autoFocus value={p.total}
          onChange={(e) => p.onTotalChange(e.target.value)} className={CASH_FIELD_CLASS} />
      </label>
    )}

    <div className="flex justify-between rounded-xl bg-surface-2/60 border border-border px-3.5 py-2.5" aria-live="polite">
      <span className="font-semibold text-text-secondary">Total contado</span>
      <span className="font-bold text-text-primary tabular-nums">{p.countedTotal === null ? '—' : formatCurrency(p.countedTotal)}</span>
    </div>
  </div>
);
