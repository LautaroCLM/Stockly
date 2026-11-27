import React, { useState } from 'react';
import { Loader2, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { saveWarehouseRpc, setDefaultWarehouseRpc } from '../api/warehousesApi';
import type { WarehousesState } from '../hooks/useWarehouses';
import type { Warehouse, WarehouseActionResult } from '../types';

interface Props {
  companyId: string;
  warehouses: WarehousesState;
}

const FIELD = 'h-8 px-2 text-xs bg-surface border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary';

/** Alta, nombre, principal y activo de cada depósito (solo el Master Admin). */
export const WarehouseManager: React.FC<Props> = ({ companyId, warehouses }) => {
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async (key: string, action: () => Promise<WarehouseActionResult<unknown>>, done: string) => {
    setBusy(key);
    setMessage(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) return setMessage({ ok: false, text: result.message });
    setMessage({ ok: true, text: done });
    await warehouses.reload();
  };

  const rename = (w: Warehouse) =>
    run(w.id, () => saveWarehouseRpc(companyId, w.id, names[w.id] ?? w.name, w.isActive), 'Depósito guardado.').then(() =>
      setNames(({ [w.id]: _done, ...rest }) => rest));

  return (
    <div className="p-4 rounded-2xl border border-border bg-surface space-y-3">
      <h2 className="text-sm font-bold text-text-primary">Depósitos de la empresa</h2>
      <div className="space-y-2">
        {warehouses.warehouses.map((w) => {
          const value = names[w.id] ?? w.name;
          return (
            <div key={w.id} className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border border-border ${w.isActive ? 'bg-surface-2/60' : 'opacity-60'}`}>
              <input aria-label={`Nombre de ${w.name}`} value={value} maxLength={40} className={`${FIELD} w-40`}
                onChange={(e) => setNames((n) => ({ ...n, [w.id]: e.target.value }))} />
              {value !== w.name && (
                <Button size="sm" variant="primary" className="h-8 text-xs" disabled={busy === w.id} onClick={() => void rename(w)}>Guardar</Button>
              )}
              {w.isDefault ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-warning"><Star size={12} />Principal</span>
              ) : w.isActive ? (
                <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={busy === w.id}
                  onClick={() => void run(w.id, () => setDefaultWarehouseRpc(companyId, w.id), `${w.name} es el principal.`)}>Hacer principal</Button>
              ) : null}
              {!w.isDefault && (
                <Button size="sm" variant="secondary" className="h-8 text-xs ml-auto" disabled={busy === w.id}
                  onClick={() => void run(w.id, () => saveWarehouseRpc(companyId, w.id, w.name, !w.isActive), w.isActive ? `${w.name} desactivado.` : `${w.name} activado.`)}>
                  {busy === w.id ? <Loader2 size={12} className="animate-spin" /> : w.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <form className="flex items-center gap-2" onSubmit={(e) => {
        e.preventDefault();
        if (!newName.trim()) return;
        void run('new', () => saveWarehouseRpc(companyId, null, newName, true), `Depósito "${newName.trim()}" creado.`).then(() => setNewName(''));
      }}>
        <input aria-label="Nombre del nuevo depósito" value={newName} maxLength={40} placeholder="Ej. Depósito del fondo" className={`${FIELD} w-56`}
          onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" size="sm" variant="secondary" className="h-8 gap-1 text-xs" disabled={busy === 'new' || !newName.trim()}>
          <Plus size={13} /><span>Agregar</span>
        </Button>
      </form>
      {message && <p role="status" className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-danger'}`}>{message.text}</p>}
    </div>
  );
};
