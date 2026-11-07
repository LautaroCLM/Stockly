import React from 'react';
import { Pencil } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/formatters';
import { MACHINE_STATUS_LABELS, MACHINE_TYPE_LABELS } from '../types';
import type { Machine, MachineCost, MachineStatus } from '../types';

const STATUS_STYLE: Record<MachineStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  in_repair: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  inactive: 'bg-surface-3 text-text-muted border-border',
};

interface MachinesTableProps {
  machines: Machine[];
  costs: Record<string, MachineCost>;
  onEdit: (machine: Machine) => void;
}

/** Máquinas con su estado y lo gastado en el período (combustible, mantenimiento y otros). */
export const MachinesTable: React.FC<MachinesTableProps> = ({ machines, costs, onEdit }) => (
  <Card className="border-border bg-surface overflow-x-auto">
    <table className="w-full text-xs min-w-[720px]">
      <thead>
        <tr className="text-left text-text-muted border-b border-border">
          <th className="p-3 font-semibold">Máquina</th>
          <th className="p-3 font-semibold">Estado</th>
          <th className="p-3 font-semibold text-right">Combustible</th>
          <th className="p-3 font-semibold text-right">Mantenimiento y repuestos</th>
          <th className="p-3 font-semibold text-right">Otros</th>
          <th className="p-3 font-semibold text-right">Total</th>
          <th className="p-3 w-10"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {machines.map((m) => {
          const c = costs[m.id];
          const detail = [MACHINE_TYPE_LABELS[m.type], m.brand, m.model, m.year, m.identifier].filter(Boolean).join(' · ');
          return (
            <tr key={m.id} className={`border-b border-border/60 last:border-0 ${m.status === 'inactive' ? 'opacity-60' : ''}`}>
              <td className="p-3">
                <p className="text-text-primary font-medium">{m.name}</p>
                <p className="text-[11px] text-text-muted">{detail}</p>
              </td>
              <td className="p-3">
                <span className={`px-2 py-0.5 rounded-full border text-[11px] ${STATUS_STYLE[m.status]}`}>{MACHINE_STATUS_LABELS[m.status]}</span>
              </td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(c?.fuelTotal ?? 0)}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(c?.maintenanceTotal ?? 0)}</td>
              <td className="p-3 text-right tabular-nums text-text-secondary">{formatCurrency(c?.otherTotal ?? 0)}</td>
              <td className="p-3 text-right tabular-nums font-bold text-text-primary">
                {formatCurrency(c?.total ?? 0)}
                <span className="block text-[10px] font-normal text-text-muted">{c?.expensesCount ?? 0} {c?.expensesCount === 1 ? 'gasto' : 'gastos'}</span>
              </td>
              <td className="p-3 text-right">
                <button onClick={() => onEdit(m)} aria-label={`Editar ${m.name}`} title="Editar"
                  className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><Pencil size={14} /></button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </Card>
);
