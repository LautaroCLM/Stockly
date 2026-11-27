import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, Droplets, Loader2, Plus, RotateCcw, ShieldAlert, Tractor } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths, toHundredths } from '@/lib/decimal';
import { localDateInputValue } from '@/lib/localDate';
import { PERIOD_LABELS, periodRange } from '@/features/finanzas/financeMath';
import type { PeriodKey } from '@/features/finanzas/types';
import type { Company } from '@/types';
import { useMachines } from './hooks/useMachines';
import { EMPTY_MACHINE, machineToInput } from './machineForm';
import type { Machine, MachineCost, MachineInput, MachineType } from './types';
import { MachineFormModal } from './components/MachineFormModal';
import { MachinesTable } from './components/MachinesTable';

interface MaquinasPageProps {
  company: Company;
  canView: boolean;
  canOperate: boolean;
  /** Muestra solo las máquinas de un tipo (módulo Atmosférico). */
  onlyType?: MachineType;
}

const TEXTS = {
  all: {
    title: 'Máquinas', icon: Tractor, newLabel: 'Nueva máquina', spent: 'Gastado en máquinas en el período',
    hint: 'Para asociar un gasto a una máquina, elegila al registrarlo en Gastos.',
    empty: 'Todavía no cargaste máquinas. Usá "Nueva máquina" para agregar la primera.',
  },
  atmosferico: {
    title: 'Atmosférico', icon: Droplets, newLabel: 'Nuevo atmosférico', spent: 'Gastado en atmosféricos en el período',
    hint: 'Los camiones atmosféricos (en Máquinas, tipo Atmosférico). Para cargarles un gasto, elegilos al registrarlo en Gastos.',
    empty: 'Todavía no hay camiones atmosféricos. Usá "Nuevo atmosférico" o cargá una máquina de tipo Atmosférico.',
  },
};

/** Máquinas y vehículos de la empresa, con lo gastado en cada una (combustible, repuestos, mantenimiento). */
export const MaquinasPage: React.FC<MaquinasPageProps> = ({ company, canView, canOperate, onlyType }) => {
  const texts = onlyType === 'atmosferico' ? TEXTS.atmosferico : TEXTS.all;
  const TitleIcon = texts.icon;
  const [period, setPeriod] = useState<PeriodKey>('month');
  const { from, to } = periodRange(period, localDateInputValue());
  const data = useMachines(company.id, canView, from, to);
  const [editing, setEditing] = useState<MachineInput | null | undefined>(undefined);
  const [showInactive, setShowInactive] = useState(false);

  const costById = useMemo(() => Object.fromEntries(data.costs.map((c): [string, MachineCost] => [c.machineId, c])), [data.costs]);
  const ofType = (data.machines ?? []).filter((m) => !onlyType || m.type === onlyType);
  const typeIds = new Set(ofType.map((m) => m.id));
  const visible = ofType.filter((m) => showInactive || m.status !== 'inactive');
  const totalCents = data.costs.filter((c) => typeIds.has(c.machineId)).reduce((sum, c) => sum + toHundredths(c.total), 0);
  const hiddenCount = ofType.length - visible.length;

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
            <TitleIcon size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">{texts.title}</h1>
            <p className="text-xs text-text-muted">{texts.hint}</p>
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
            <Button variant="primary" size="sm" onClick={() => setEditing(onlyType ? { ...EMPTY_MACHINE, type: onlyType } : null)} className="gap-1.5 h-9">
              <Plus size={14} />
              <span>{texts.newLabel}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-text-muted">
        <span>{texts.spent}: <strong className="text-text-primary">{formatCurrency(fromHundredths(totalCents))}</strong></span>
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
          {ofType.length === 0 ? texts.empty : 'No hay máquinas operativas. Activá "Mostrar inactivas" para ver el resto.'}
        </p>
      ) : (
        <MachinesTable machines={visible} costs={costById} onEdit={(m: Machine) => setEditing(machineToInput(m))} canEdit={canOperate} />
      )}

      <AnimatePresence>{editing !== undefined && <MachineFormModal initial={editing} onClose={() => setEditing(undefined)} onSubmit={data.saveMachine} />}</AnimatePresence>
    </div>
  );
};
