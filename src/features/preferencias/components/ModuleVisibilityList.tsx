import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Boxes, Check, Loader2, Lock } from 'lucide-react';
import type { NavSection, RouteId } from '@/types';
import { NAV_ICONS } from '@/components/layout/navIcons';
import { Switch } from '@/components/ui/Switch';
import { OPT_IN_ROUTES, canHideRoute } from '../hiddenRoutes';

interface ModuleVisibilityListProps {
  /** Módulos que la persona tiene permitidos (los demás no se listan). */
  sections: readonly NavSection[];
  hidden: ReadonlySet<RouteId>;
  disabled: boolean;
  /** Módulo que se está guardando y el que se acaba de guardar (para mostrar el estado en su fila). */
  savingRoute: RouteId | null;
  savedRoute: RouteId | null;
  onToggle: (route: RouteId, visible: boolean) => void;
}

/** Estado de guardado de una fila: "Guardando…" y después un "Guardado" que se desvanece. */
const RowStatus: React.FC<{ saving: boolean; saved: boolean }> = ({ saving, saved }) => (
  <AnimatePresence mode="wait" initial={false}>
    {saving ? (
      <m.span key="saving" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="flex items-center gap-1 text-[11px] text-text-muted">
        <Loader2 size={12} className="animate-spin" /> Guardando…
      </m.span>
    ) : saved ? (
      <m.span key="saved" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
        className="flex items-center gap-1 text-[11px] font-medium text-success">
        <Check size={12} /> Guardado
      </m.span>
    ) : null}
  </AnimatePresence>
);

/** Lista de módulos agrupada como el menú, con un interruptor para mostrar u ocultar cada uno. */
export const ModuleVisibilityList: React.FC<ModuleVisibilityListProps> = ({ sections, hidden, disabled, savingRoute, savedRoute, onToggle }) => (
  <div className="space-y-5">
    {sections.map((section) => (
      <section key={section.title} className="space-y-1.5">
        <h2 className="px-1 text-[10px] font-semibold tracking-wider uppercase text-text-muted">{section.title}</h2>
        <ul className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden">
          {section.items.map((item) => {
            const Icon = NAV_ICONS[item.iconName] || Boxes;
            const locked = !canHideRoute(item.id);
            const visible = locked || !hidden.has(item.id);
            const switchId = `module-visible-${item.id}`;
            return (
              <li key={item.id}
                className={`flex items-center gap-3 px-4 py-3 transition-colors duration-200 ${visible ? '' : 'bg-surface-2/40'}`}>
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border transition-colors duration-200 ${
                  visible ? 'bg-primary/10 border-primary/25 text-primary' : 'bg-surface-3 border-border text-text-dim'}`}>
                  <Icon size={16} />
                </span>
                <label htmlFor={switchId} className={`flex-1 min-w-0 ${locked || disabled ? 'cursor-default' : 'cursor-pointer'}`}>
                  <span className={`block text-sm transition-colors duration-200 ${visible ? 'text-text-primary' : 'text-text-muted'}`}>{item.label}</span>
                  <span className="block text-[11px] text-text-muted">
                    {locked ? 'Siempre visible' : visible ? 'Se ve en tu menú' : OPT_IN_ROUTES.includes(item.id) ? 'Viene oculto: activalo si lo usás' : 'Oculto en tu menú'}
                  </span>
                </label>
                <RowStatus saving={savingRoute === item.id} saved={savedRoute === item.id} />
                {locked ? (
                  <Lock size={14} className="text-text-muted shrink-0" aria-label="Siempre visible" />
                ) : (
                  <Switch id={switchId} checked={visible} disabled={disabled}
                    label={`Mostrar ${item.label} en el menú`} onChange={(next) => onToggle(item.id, next)} />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);
