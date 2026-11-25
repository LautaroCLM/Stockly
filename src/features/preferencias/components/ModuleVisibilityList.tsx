import React from 'react';
import { Boxes } from 'lucide-react';
import type { NavSection, RouteId } from '@/types';
import { NAV_ICONS } from '@/components/layout/navIcons';
import { canHideRoute } from '../hiddenRoutes';

interface ModuleVisibilityListProps {
  /** Módulos que la persona tiene permitidos (los demás no se listan). */
  sections: readonly NavSection[];
  hidden: ReadonlySet<RouteId>;
  disabled: boolean;
  onToggle: (route: RouteId, visible: boolean) => void;
}

/** Lista de módulos agrupada como el menú, con un check para mostrar u ocultar cada uno. */
export const ModuleVisibilityList: React.FC<ModuleVisibilityListProps> = ({ sections, hidden, disabled, onToggle }) => (
  <div className="space-y-5">
    {sections.map((section) => (
      <section key={section.title} className="space-y-1.5">
        <h2 className="px-1 text-[10px] font-semibold tracking-wider uppercase text-text-muted">{section.title}</h2>
        <ul className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden">
          {section.items.map((item) => {
            const Icon = NAV_ICONS[item.iconName] || Boxes;
            const locked = !canHideRoute(item.id);
            const visible = locked || !hidden.has(item.id);
            const inputId = `module-visible-${item.id}`;
            return (
              <li key={item.id}>
                <label
                  htmlFor={inputId}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                    locked || disabled ? 'cursor-default' : 'cursor-pointer hover:bg-surface-2'
                  }`}
                >
                  <input
                    id={inputId}
                    type="checkbox"
                    className="w-4 h-4 accent-primary shrink-0"
                    checked={visible}
                    disabled={locked || disabled}
                    onChange={(e) => onToggle(item.id, e.target.checked)}
                  />
                  <Icon size={16} className={visible ? 'text-text-secondary' : 'text-text-dim'} />
                  <span className={`flex-1 text-sm ${visible ? 'text-text-primary' : 'text-text-muted line-through decoration-text-dim'}`}>
                    {item.label}
                  </span>
                  {locked && <span className="text-[11px] text-text-muted">Siempre visible</span>}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    ))}
  </div>
);
