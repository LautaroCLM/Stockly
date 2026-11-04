import React, { useState } from 'react';
import { Loader2, LockOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { parseMoneyInput } from '../cashMath';
import type { CashActionResult } from '../types';
import { CASH_FIELD_CLASS, CashFormError } from './CashModalShell';

interface OpenCashPanelProps {
  companyName: string;
  onOpen: (openingAmount: number, notes: string) => Promise<CashActionResult>;
}

/** Caja cerrada: formulario para abrir el turno con el fondo de cambio. */
export const OpenCashPanel: React.FC<OpenCashPanelProps> = ({ companyName, onOpen }) => {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingAmount = parseMoneyInput(amount);
    if (openingAmount === null) {
      setError({ message: 'Ingresá el fondo inicial: un importe de 0 o más, con hasta dos decimales.' });
      return;
    }
    setIsSubmitting(true);
    setError(null);
    const result = await onOpen(openingAmount, notes.trim());
    setIsSubmitting(false);
    if (!result.ok) setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <Card className="max-w-lg">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center text-text-muted">
            <LockOpen size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text-primary">La caja está cerrada</h2>
            <p className="text-xs text-text-muted">
              Abrí la caja de {companyName} indicando el efectivo con el que empieza el turno (fondo de cambio).
              Las ventas en efectivo se suman solas mientras la caja esté abierta.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <div className="space-y-1">
            <label htmlFor="opening-amount" className="font-semibold text-text-secondary">
              Fondo inicial ($) <span className="text-danger">*</span>
            </label>
            <input
              id="opening-amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="Ej. 5000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isSubmitting}
              className={CASH_FIELD_CLASS}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="opening-notes" className="font-semibold text-text-secondary">Observación (opcional)</label>
            <input
              id="opening-notes"
              maxLength={500}
              placeholder="Ej. Turno mañana"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              className={CASH_FIELD_CLASS}
            />
          </div>
          <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />
          <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full gap-2">
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <LockOpen size={15} />}
            <span>Abrir caja</span>
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
