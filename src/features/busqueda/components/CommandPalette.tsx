import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, CornerDownLeft, Search, type LucideIcon } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { NAV_ICONS } from '@/components/layout/navIcons';
import { buildCommandGroups, type CommandItem, type CommandSources } from '../commandResults';

interface Props {
  sources: CommandSources;
  onSelect: (item: CommandItem, options: { addToCart: boolean }) => void;
  onClose: () => void;
}

const EXTRA_ICONS: Record<string, LucideIcon> = { Boxes };

/** Paleta Ctrl+K: buscar productos, clientes, ventas y pantallas, y acciones rápidas. Todo con el teclado. */
export const CommandPalette: React.FC<Props> = ({ sources, onSelect, onClose }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const groups = useMemo(() => buildCommandGroups(query, sources), [query, sources]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item: CommandItem | undefined, addToCart = false) => {
    if (item) onSelect(item, { addToCart });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[active], e.ctrlKey || e.metaKey); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let index = -1;
  return (
    <ModalFrame ariaLabel="Buscar en Stockly" onBackdropClick={onClose} panelClassName="max-w-xl self-start mt-[8vh]">
      <div className="flex items-center gap-2.5 px-4 border-b border-border">
        <Search size={16} className="text-text-muted shrink-0" />
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKeyDown}
          role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={flat[active] ? `cmd-${flat[active].id}` : undefined}
          placeholder="Buscar productos, clientes, ventas (número) o pantallas…"
          className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none" />
        <kbd className="hidden sm:inline text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">Esc</kbd>
      </div>
      <ul id="command-results" ref={listRef} role="listbox" className="min-h-0 flex-1 max-h-[55vh] overflow-y-auto py-2">
        {flat.length === 0 && <li className="px-4 py-8 text-center text-xs text-text-muted">No hay resultados para "{query}".</li>}
        {groups.map((group) => (
          <li key={group.title} role="presentation">
            <p className="px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase text-text-muted">{group.title}</p>
            <ul role="presentation">
              {group.items.map((item) => {
                index += 1;
                const i = index;
                const Icon = NAV_ICONS[item.icon] ?? EXTRA_ICONS[item.icon] ?? Search;
                const isActive = i === active;
                return (
                  <li key={item.id} id={`cmd-${item.id}`} role="option" aria-selected={isActive} data-index={i}
                    onMouseMove={() => setActive(i)} onClick={(e) => choose(item, e.ctrlKey || e.metaKey)}
                    className={`mx-2 px-3 py-2 rounded-lg flex items-center gap-3 cursor-pointer text-sm ${isActive ? 'bg-primary/10 text-text-primary' : 'text-text-secondary'}`}>
                    <Icon size={15} className={isActive ? 'text-primary' : 'text-text-muted'} />
                    <span className="flex-1 min-w-0 truncate">{item.label}</span>
                    {item.hint && <span className="text-[11px] text-text-muted font-mono truncate max-w-[40%]">{item.hint}</span>}
                    {isActive && <CornerDownLeft size={13} className="text-text-muted shrink-0" />}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
      <div className="px-4 py-2 border-t border-border flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-text-muted">
        <span>↑ ↓ moverse</span><span>Enter abrir</span><span>Ctrl+Enter en un producto: agregar al carrito</span>
      </div>
    </ModalFrame>
  );
};
