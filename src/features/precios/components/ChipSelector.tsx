import React from 'react';
import { cn } from '@/lib/utils';

interface ChipSelectorProps {
  label: string;
  items: { id: string; name: string }[];
  selectedIds: string[];
  /** Texto que se muestra cuando no hay nada elegido (significa "todos"). */
  allLabel: string;
  onToggle: (id: string) => void;
  onClear: () => void;
  disabled?: boolean;
}

/** Lista de opciones tildables. Sin ninguna elegida, el filtro no se aplica (vale "todas"). */
export const ChipSelector: React.FC<ChipSelectorProps> = ({ label, items, selectedIds, allLabel, onToggle, onClear, disabled }) => {
  const chip = 'px-2.5 h-7 rounded-full border text-[11px] font-medium transition-colors focus:outline-none focus-visible:border-primary disabled:opacity-50';
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto" role="group" aria-label={label}>
        <button type="button" disabled={disabled} aria-pressed={selectedIds.length === 0} onClick={onClear}
          className={cn(chip, selectedIds.length === 0 ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-2 border-border text-text-secondary hover:border-primary/50')}>
          {allLabel}
        </button>
        {items.map((item) => {
          const active = selectedIds.includes(item.id);
          return (
            <button key={item.id} type="button" disabled={disabled} aria-pressed={active} onClick={() => onToggle(item.id)}
              className={cn(chip, active ? 'bg-primary/15 border-primary text-primary' : 'bg-surface-2 border-border text-text-secondary hover:border-primary/50')}>
              {item.name}
            </button>
          );
        })}
      </div>
    </div>
  );
};
