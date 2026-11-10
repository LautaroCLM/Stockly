import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import { useModulePermissions } from './hooks/useModulePermissions';
import { PermissionsEditor } from './components/PermissionsEditor';
import { MODULE_KEYS } from './types';
import type { ModuleLevels } from './types';

interface PermisosPageProps {
  company: Company;
  isMasterAdmin: boolean;
}

const same = (a: ModuleLevels, b: ModuleLevels) => MODULE_KEYS.every((k) => a[k] === b[k]);

/** Qué módulos puede usar el rol empleado y con qué alcance. Se puede cambiar en cualquier momento. */
export const PermisosPage: React.FC<PermisosPageProps> = ({ company, isMasterAdmin }) => {
  const permissions = useModulePermissions(company.id);
  const [draft, setDraft] = useState<ModuleLevels | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  // Parte de lo guardado; si cambia desde otro dispositivo y no hay cambios sin guardar, se actualiza
  useEffect(() => {
    if (permissions.levels) setDraft((current) => (current === null ? permissions.levels : current));
  }, [permissions.levels]);

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores configuran los permisos</p>
      </div>
    );
  }

  const dirty = Boolean(draft && permissions.levels && !same(draft, permissions.levels));

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    setFeedback(null);
    const result = await permissions.save(draft);
    setIsSaving(false);
    setFeedback(result.ok ? { ok: true, message: 'Permisos guardados. Los empleados conectados ven el cambio al instante.' } : { ok: false, message: result.message });
  };

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-12">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
          <KeyRound size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Permisos</h1>
          <p className="text-xs text-text-muted leading-relaxed">
            Elegí qué módulos puede usar el rol empleado en {company.name}. Los administradores siempre ven todo. Podés cambiarlo cuando quieras.
          </p>
        </div>
      </div>

      {permissions.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{permissions.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void permissions.reload()}>Reintentar</Button>
        </div>
      )}

      {!draft ? (
        !permissions.error && (
          <p className="py-12 text-center text-xs text-text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
            Cargando permisos...
          </p>
        )
      ) : (
        <>
          <PermissionsEditor levels={draft} onChange={(next) => { setDraft(next); setFeedback(null); }} disabled={isSaving} />

          <p className="text-[11px] text-text-muted leading-relaxed">
            Vender, el catálogo de productos, el stock y los movimientos de stock están siempre disponibles para el equipo. Auditoría, Datos de Empresa y Miembros y Roles son siempre solo para administradores.
          </p>

          {feedback && (
            <div role={feedback.ok ? 'status' : 'alert'}
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${feedback.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-danger/10 border-danger/30 text-danger'}`}>
              {feedback.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{feedback.message}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={!dirty || isSaving}
              onClick={() => { setDraft(permissions.levels); setFeedback(null); }}>Descartar cambios</Button>
            <Button variant="primary" size="sm" disabled={!dirty || isSaving} onClick={() => void handleSave()} className="gap-1.5">
              {isSaving && <Loader2 size={14} className="animate-spin" />}
              <span>Guardar cambios</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
