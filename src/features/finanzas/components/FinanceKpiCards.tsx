import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency, formatPercent } from '@/lib/formatters';
import { averageTicket, deltaPercent, grossMarginPercent, grossProfit } from '../financeMath';
import type { FinancialSummary } from '../types';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface KpiProps {
  label: string;
  value: string;
  detail?: React.ReactNode;
  tone?: string;
}

const Kpi: React.FC<KpiProps> = ({ label, value, detail, tone = 'text-text-primary' }) => (
  <Card className="border-border bg-surface">
    <CardContent className="p-4 space-y-1">
      <p className="text-[11px] text-text-muted">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${tone}`}>{value}</p>
      {detail && <p className="text-[11px] text-text-muted">{detail}</p>}
    </CardContent>
  </Card>
);

/** Variación contra el período anterior, en verde si mejora y en rojo si empeora. */
const Delta: React.FC<{ current: number; previous: number; goodWhenUp?: boolean }> = ({ current, previous, goodWhenUp = true }) => {
  const delta = deltaPercent(current, previous);
  if (delta === null) return <span>Sin datos del período anterior</span>;
  const isGood = delta === 0 || delta > 0 === goodWhenUp;
  return (
    <span>
      <span className={isGood ? 'text-emerald-400' : 'text-danger'}>{formatPercent(delta)}</span> vs. período anterior
    </span>
  );
};

interface FinanceKpiCardsProps {
  current: FinancialSummary;
  previous: FinancialSummary | null;
}

/** Vendido, costo, ganancia bruta, compras, anuladas e inventario del período. */
export const FinanceKpiCards: React.FC<FinanceKpiCardsProps> = ({ current, previous }) => {
  const profit = grossProfit(current);
  const margin = grossMarginPercent(current);
  const ticket = averageTicket(current);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      <Kpi label="Vendido" value={formatCurrency(current.salesTotal)}
        detail={<>{plural(current.salesCount, 'venta', 'ventas')}{ticket !== null && ` · ticket promedio ${formatCurrency(ticket)}`}{previous && <><br /><Delta current={current.salesTotal} previous={previous.salesTotal} /></>}</>} />
      <Kpi label="Costo de la mercadería vendida" value={formatCurrency(current.cogsTotal)}
        detail="Costo que tenía cada producto al momento de venderse" />
      <Kpi label="Ganancia bruta" value={formatCurrency(profit)} tone={profit >= 0 ? 'text-emerald-400' : 'text-danger'}
        detail={<>{margin !== null ? `Margen ${margin.toFixed(1)}% sobre lo vendido` : 'Sin ventas en el período'}{previous && <><br /><Delta current={profit} previous={grossProfit(previous)} /></>}</>} />
      <Kpi label="Compras a proveedores" value={formatCurrency(current.purchasesTotal)}
        detail={<>{plural(current.purchasesCount, 'compra', 'compras')}{previous && <><br /><Delta current={current.purchasesTotal} previous={previous.purchasesTotal} goodWhenUp={false} /></>}</>} />
      <Kpi label="Ventas anuladas" value={formatCurrency(current.cancelledTotal)}
        detail={`${plural(current.cancelledCount, 'venta anulada', 'ventas anuladas')} (no suman a lo vendido)`} tone={current.cancelledCount > 0 ? 'text-amber-400' : undefined} />
      <Kpi label="Valor del inventario" value={formatCurrency(current.inventoryValue)}
        detail="Existencias actuales valuadas al costo (no depende del período)" />
    </div>
  );
};
