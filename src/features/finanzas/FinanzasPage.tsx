import React, { useState } from 'react';
import { AlertTriangle, BarChart3, Info, Loader2, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateShort } from '@/lib/formatters';
import type { Company } from '@/types';
import { useFinancialSummary } from './hooks/useFinancialSummary';
import { PERIOD_LABELS } from './financeMath';
import type { PeriodKey } from './types';
import { FinanceKpiCards } from './components/FinanceKpiCards';
import { PaymentsBreakdown } from './components/PaymentsBreakdown';

interface FinanzasPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

/**
 * Resumen Financiero: lo vendido, su costo, las compras y lo cobrado en el período.
 * Todavía no incluye cuentas a cobrar y a pagar ni la acreditación de cheques.
 */
export const FinanzasPage: React.FC<FinanzasPageProps> = ({ company, isMasterAdmin }) => {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const { current, previous, range, isLoading, error, reload } = useFinancialSummary(company.id, isMasterAdmin, period);

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores ven el resumen financiero</p>
        <p className="text-xs">Incluye costos y márgenes de {company.name}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <BarChart3 size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Resumen Financiero</h1>
            <p className="text-xs text-text-muted">
              {range ? `${formatDateShort(range.from)} al ${formatDateShort(range.to)} · ` : ''}
              {company.name}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} aria-label="Período"
            className="h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
              <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
            ))}
          </select>
          <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={isLoading} className="gap-1.5 h-9">
            <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </Button>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-surface-2/60 border border-border text-xs text-text-secondary flex items-start gap-2">
        <Info size={15} className="text-primary shrink-0 mt-0.5" />
        <span>
          Este resumen todavía <strong>no incluye deudas a proveedores, sueldos liquidados ni la acreditación de cheques</strong>.
          El resultado es lo vendido menos el costo de la mercadería y menos los gastos registrados; las compras de mercadería no se restan porque ya entran por su costo al venderse.
        </span>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>Reintentar</Button>
        </div>
      )}

      {!current ? (
        !error && (
          <p className="py-12 text-center text-xs text-text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
            Calculando el resumen...
          </p>
        )
      ) : (
        <>
          <FinanceKpiCards current={current} previous={previous} />
          <PaymentsBreakdown paymentsByMethod={current.paymentsByMethod} />
        </>
      )}
    </div>
  );
};
