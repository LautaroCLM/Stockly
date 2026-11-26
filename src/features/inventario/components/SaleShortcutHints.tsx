import React from 'react';
import { Keyboard } from 'lucide-react';

interface Hint {
  keys: string[];
  label: string;
}

/** Atajos de cada parte de la venta, para mostrarlos donde se usan. */
export const SALE_HINTS = {
  catalog: [
    { keys: ['F2'], label: 'Buscar' },
    { keys: ['↑', '↓'], label: 'Moverse' },
    { keys: ['Enter', '+'], label: 'Agregar' },
    { keys: ['−'], label: 'Quitar uno' },
    { keys: ['F4'], label: 'Carrito' },
  ],
  cart: [
    { keys: ['↑', '↓'], label: 'Elegir' },
    { keys: ['+', '−'], label: 'Cantidad' },
    { keys: ['Supr'], label: 'Quitar' },
    { keys: ['F4'], label: 'Cobrar' },
    { keys: ['Esc'], label: 'Cerrar' },
  ],
  checkout: [
    { keys: ['Enter', 'F4'], label: 'Confirmar venta' },
    { keys: ['Esc'], label: 'Cancelar' },
  ],
} satisfies Record<string, Hint[]>;

interface SaleShortcutHintsProps {
  hints?: Hint[];
  className?: string;
}

/** Fila discreta con los atajos de teclado disponibles. */
export const SaleShortcutHints: React.FC<SaleShortcutHintsProps> = ({ hints = SALE_HINTS.catalog, className = '' }) => (
  <div className={`hidden md:flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted ${className}`} aria-label="Atajos de teclado">
    <Keyboard size={13} className="shrink-0" aria-hidden />
    {hints.map((hint) => (
      <span key={hint.label} className="flex items-center gap-1">
        {hint.keys.map((key) => (
          <kbd key={key} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-3 border border-border text-text-secondary">
            {key}
          </kbd>
        ))}
        <span>{hint.label}</span>
      </span>
    ))}
  </div>
);
