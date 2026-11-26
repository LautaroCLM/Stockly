import React, { useState } from 'react';
import { Sparkles, Volume2 } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { readCartEffect, writeCartEffect, type CartEffect } from '@/lib/cartEffects';

const OPTIONS: { effect: CartEffect; label: string; help: string; Icon: typeof Sparkles }[] = [
  { effect: 'fly', label: 'Animación al agregar al carrito', help: 'Una chispa viaja hasta el carrito cuando sumás un producto.', Icon: Sparkles },
  { effect: 'sound', label: 'Sonido al agregar al carrito', help: 'Un toque suave y corto. Se puede apagar si trabajás con mucho volumen de ventas.', Icon: Volume2 },
];

/** Efectos de la venta de este equipo (se guardan en el navegador, no en la cuenta). */
export const CartEffectsCard: React.FC = () => {
  const [values, setValues] = useState<Record<CartEffect, boolean>>(() => ({ fly: readCartEffect('fly'), sound: readCartEffect('sound') }));
  const change = (effect: CartEffect, enabled: boolean) => {
    writeCartEffect(effect, enabled);
    setValues((v) => ({ ...v, [effect]: enabled }));
  };

  return (
    <section className="space-y-1.5" aria-label="Efectos de la venta">
      <h2 className="px-1 text-[10px] font-semibold tracking-wider uppercase text-text-muted">Efectos de la venta · solo en este equipo</h2>
      <ul className="rounded-xl border border-border bg-surface divide-y divide-border/60 overflow-hidden">
        {OPTIONS.map(({ effect, label, help, Icon }) => (
          <li key={effect} className="flex items-center gap-3 px-4 py-3">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border bg-primary/10 border-primary/25 text-primary"><Icon size={16} /></span>
            <label htmlFor={`effect-${effect}`} className="flex-1 min-w-0 cursor-pointer">
              <span className="block text-sm text-text-primary">{label}</span>
              <span className="block text-[11px] text-text-muted">{help}</span>
            </label>
            <Switch id={`effect-${effect}`} checked={values[effect]} onChange={(next) => change(effect, next)} label={label} />
          </li>
        ))}
      </ul>
    </section>
  );
};
