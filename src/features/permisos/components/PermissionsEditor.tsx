import React from 'react';
import { LEVEL_LABELS, MODULE_INFO, MODULE_KEYS, PERMISSION_TEMPLATES } from '../types';
import type { ModuleKey, ModuleLevel, ModuleLevels } from '../types';

const SELECT_CLASS =
  'h-9 px-2.5 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary disabled:opacity-50 cursor-pointer';

const LEVELS: ModuleLevel[] = ['none', 'view', 'operate'];

/** Los módulos de solo lectura no tienen "ver y operar": no hay nada que modificar en ellos. */
const READ_ONLY_MODULES = new Set<ModuleKey>(['finanzas', 'informes']);

const sameLevels = (a: ModuleLevels, b: ModuleLevels) => MODULE_KEYS.every((k) => a[k] === b[k]);

interface PermissionsEditorProps {
  levels: ModuleLevels;
  onChange: (levels: ModuleLevels) => void;
  disabled?: boolean;
}

/** Elegir una plantilla y ajustar, módulo por módulo, qué puede hacer el rol empleado. */
export const PermissionsEditor: React.FC<PermissionsEditorProps> = ({ levels, onChange, disabled }) => {
  const matching = PERMISSION_TEMPLATES.find((t) => sameLevels(t.levels, levels));

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="permission-template" className="block text-xs font-semibold text-text-secondary mb-1">Plantilla</label>
        <select id="permission-template" value={matching?.id ?? 'custom'} disabled={disabled} className={`${SELECT_CLASS} w-full`}
          onChange={(e) => {
            const template = PERMISSION_TEMPLATES.find((t) => t.id === e.target.value);
            if (template) onChange({ ...template.levels });
          }}>
          {PERMISSION_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          {!matching && <option value="custom">Personalizada</option>}
        </select>
        <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
          {matching?.description ?? 'Combinación personalizada: ajustala módulo por módulo.'}
        </p>
      </div>

      <div className="rounded-xl border border-border divide-y divide-border/60 overflow-hidden">
        {MODULE_KEYS.map((key) => {
          const info = MODULE_INFO[key];
          const options = READ_ONLY_MODULES.has(key) ? LEVELS.filter((l) => l !== 'operate') : LEVELS;
          return (
            <div key={key} className="p-3 flex flex-wrap items-center gap-3 bg-surface">
              <div className="flex-1 min-w-[200px]">
                <p className="text-xs font-semibold text-text-primary">{info.label}</p>
                <p className="text-[11px] text-text-muted leading-relaxed">{info.description}</p>
              </div>
              <select aria-label={`Acceso de los empleados a ${info.label}`} value={levels[key]} disabled={disabled} className={SELECT_CLASS}
                onChange={(e) => onChange({ ...levels, [key]: e.target.value as ModuleLevel })}>
                {options.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l]}</option>)}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
};
