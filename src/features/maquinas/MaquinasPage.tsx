import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, Loader2, Plus, RotateCcw, ShieldAlert, Tractor } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { localDateInputValue } from '@/lib/localDate';
import { PERIOD_LABELS, periodRange } from '@/features/finanzas/financeMath';
import type { PeriodKey } from '@/features/finanzas/types';
import type { Company } from '@/types';
import { useMachines } from './hooks/useMachines';
import { machineToInput } from './machineForm';
import type { Machine, MachineCost, MachineInput } from './types';
import { MachineFormModal } from './components/MachineFormModal';
import { MachinesTable } from './components/MachinesTable';

interface MaquinasPageProps {
  company: Company;
  canView: boolean;
  canOperate: boolean;
}

/** Máquinas y vehículos de la empresa, con lo gastado en cada una (combustible, repuestos, mantenimiento). */
export const MaquinasPage: React.FC<MaquinasPageProps> = ({ company, canView, canOperate }) => {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const { from, to } = periodRange(period, localDateInputValue());
  const data = useMachines(company.id, canView, from, to);
  const [editing, setEditing] = useState<MachineInput | null | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);

  const costById = useMemo(() => Object.fromEntries(data.costs.map((c): [string, MachineCost] => [c.machineId, c])), [data.costs]);
  const visible = (data.machines ?? []).filter((m) => showInactive || m.status !== 'inactive');
  const totalCents = data.costs.reduce((sum, c) => sum + toHundredths(c.total), 0);
  const hiddenCount = (data.machines ?? []).length - visible.length;

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">No tenés acceso a este módulo. Pedile acceso al administrador.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <Tractor size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Máquinas</h1>
            <p className="text-xs text-text-muted">Para asociar un gasto a una máquina, elegila al registrarlo en Gastos.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)} aria-label="Período"
            className="h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => <option key={key} value={key}>{PERIOD_LABELS[key]}</option>)}
          </select>
          <Button variant="secondary" size="sm" onClick={() => void data.reload()} disabled={data.isLoading} className="gap-1.5 h-9">
            <RotateCcw size={14} className={data.isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </Button>
          {canOperate && (
            <Button variant="primary" size="sm" onClick={() => setEditing(null)} className="gap-1.5 h-9">
              <Plus size={14} />
              <span>Nueva máquina</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span>Gastado en máquinas en el período: <strong className="text-text-primary">{formatCurrency(fromHundredths(totalCents))}</strong></span>
        <label className="flex items-center gap-2 text-text-secondary cursor-pointer ml-auto">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Mostrar inactivas{hiddenCount > 0 && ` (${hiddenCount})`}
        </label>
      </div>

      {data.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{data.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void data.reload()}>Reintentar</Button>
        </div>
      )}

      {data.machines === null ? (
        !data.error && (
          <p className="py-12 text-center text-xs text-text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
            Cargando máquinas...
          </p>
        )
      ) : visible.length === 0 ? (
        <p className="py-12 text-center text-xs text-text-muted">
          {data.machines.length === 0 ? 'Todavía no cargaste máquinas. Usá "Nueva máquina" para agregar la primera.' : 'No hay máquinas operativas. Activá "Mostrar inactivas" para ver el resto.'}
        </p>
      ) : (
        <MachinesTable machines={visible} costs={costById} onEdit={(m: Machine) => setEditing(machineToInput(m))} canEdit={canOperate} />
      )}

      <AnimatePresence>{editing !== undefined && <MachineFormModal initial={editing} onClose={() => setEditing(undefined)} onSubmit={data.saveMachine} />}</AnimatePresence>
    </div>
  );
};
