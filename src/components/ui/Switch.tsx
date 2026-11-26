import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Texto para lectores de pantalla (el interruptor no tiene texto propio). */
  label: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Interruptor de encendido/apagado. Es un botón con role="switch": se usa con clic,
 * Espacio o Enter, y el lector de pantalla anuncia si está activado.
 */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label, disabled = false, id }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-out
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface
      disabled:cursor-not-allowed disabled:opacity-50
      ${checked ? 'bg-primary border-primary' : 'bg-surface-3 border-border'}`}
  >
    <span
      aria-hidden
      className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow-md shadow-black/30 transition-transform duration-200 ease-out
        motion-reduce:transition-none ${checked ? 'translate-x-[22px]' : 'translate-x-[2px]'}`}
    />
  </button>
);
