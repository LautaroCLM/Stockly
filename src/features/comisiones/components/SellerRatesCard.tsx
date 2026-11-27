import React, { useState } from 'react';
import { Loader2, Percent } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { setEmployeeCommissionRpc } from '../api/commissionsApi';
import { parsePercent } from '../commissionSummary';

interface EmployeeRate {
  id: string;
  fullName: string;
  percent: number | null;
}

interface Props {
  companyId: string;
  employees: EmployeeRate[];
  canOperate: boolean;
  onSaved: () => void;
}

const formatPct = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));

/** Porcentaje de comisión de cada empleado activo; vacío = no vende a comisión. */
export const SellerRatesCard: React.FC<Props> = ({ companyId, employees, canOperate, onSaved }) => {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: EmployeeRate) => {
    const parsed = parsePercent(drafts[e.id] ?? formatPct(e.percent));
    if (!parsed.ok) return setMessage({ ok: false, text: `${e.fullName}: ${parsed.message}` });
    setBusy(e.id);
    const result = await setEmployeeCommissionRpc(companyId, e.id, parsed.value);
    setBusy(null);
    if (!result.ok) return setMessage({ ok: false, text: result.message });
    setDrafts(({ [e.id]: _done, ...rest }) => rest);
    setMessage({ ok: true, text: `Guardado: ${e.fullName}` });
    onSaved();
  };

  return (
    <div className="p-4 rounded-2xl border border-border bg-surface space-y-3">
      <div className="flex items-center gap-2">
        <Percent size={15} className="text-primary" />
        <h2 className="text-sm font-bold text-text-primary">Porcentaje de cada vendedor</h2>
      </div>
      <p className="text-[11px] text-text-muted">Sobre el total cobrado de sus ventas. Dejalo vacío si no vende a comisión (no aparece para elegir al cobrar).</p>
      {employees.length === 0 && <p className="text-xs text-text-muted">No hay empleados activos.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {employees.map((e) => {
          const value = drafts[e.id] ?? formatPct(e.percent);
          const changed = value !== formatPct(e.percent);
          return (
            <div key={e.id} className="flex items-center gap-2 p-2 rounded-lg bg-surface-2/60 border border-border">
              <span className="flex-1 text-xs text-text-primary truncate">{e.fullName}</span>
              <input aria-label={`Comisión de ${e.fullName}`} inputMode="decimal" value={value} disabled={!canOperate || busy === e.id}
                placeholder="—" onChange={(ev) => { setDrafts((d) => ({ ...d, [e.id]: ev.target.value })); setMessage(null); }}
                className="w-14 h-7 px-2 text-right text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
              <span className="text-xs text-text-muted">%</span>
              {canOperate && changed && (
                <Button size="sm" variant="primary" className="h-7 px-2 text-xs" disabled={busy === e.id} onClick={() => void save(e)}>
                  {busy === e.id ? <Loader2 size={12} className="animate-spin" /> : 'Guardar'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      {message && <p role="status" className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-danger'}`}>{message.text}</p>}
    </div>
  );
};
