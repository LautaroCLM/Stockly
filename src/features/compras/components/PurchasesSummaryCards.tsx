import React from 'react';
import { DollarSign, Package, Truck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';

interface PurchasesSummaryCardsProps {
  summary: { count: number; total: number } | null;
  activeSuppliers: number;
}

const SummaryCard: React.FC<{ icon: React.ReactNode; tone: string; label: string; value: string; className?: string }> = ({
  icon,
  tone,
  label,
  value,
  className = '',
}) => (
  <Card className={`border-border bg-surface ${className}`}>
    <CardContent className="p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${tone}`}>{icon}</div>
      <div>
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className="text-lg font-bold text-text-primary">{value}</p>
      </div>
    </CardContent>
  </Card>
);

/** Compras completadas, total invertido y proveedores activos. */
export const PurchasesSummaryCards: React.FC<PurchasesSummaryCardsProps> = ({ summary, activeSuppliers }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
    <SummaryCard icon={<Package size={20} />} tone="bg-primary/10 border-primary/20 text-primary"
      label="Compras Realizadas" value={summary ? String(summary.count) : '...'} />
    <SummaryCard icon={<DollarSign size={20} />} tone="bg-success/10 border-success/20 text-success"
      label="Total Invertido en Stock" value={summary ? formatCurrency(summary.total) : '...'} />
    <SummaryCard icon={<Truck size={20} />} tone="bg-accent/10 border-accent/20 text-accent"
      label="Proveedores Activos" value={String(activeSuppliers)} className="sm:col-span-2 lg:col-span-1" />
  </div>
);
