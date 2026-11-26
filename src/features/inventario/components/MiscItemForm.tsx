import React, { useState } from 'react';
import { PencilLine, Plus } from 'lucide-react';
import type { CartItem } from '../types';
import { buildMiscItem, MISC_DESCRIPTION_MAX } from '../miscItem';

const FIELD = 'h-8 px-2.5 text-xs bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none';

/** "Artículo varios": vender algo que no está en el catálogo, con descripción y precio escritos en el momento. */
export const MiscItemForm: React.FC<{ onAdd: (item: CartItem) => void }> = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const item = buildMiscItem(description, price, quantity, crypto.randomUUID());
    if (typeof item === 'string') return setError(item);
    onAdd(item);
    setDescription('');
    setPrice('');
    setQuantity('1');
    setError(null);
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button type="button" onClick={() => setIsOpen(true)}
        className="w-full h-9 rounded-xl border border-dashed border-border text-[11px] font-semibold text-text-muted hover:text-primary hover:border-primary/50 flex items-center justify-center gap-1.5 transition-colors">
        <PencilLine size={13} />Agregar artículo varios (sin código)
      </button>
    );
  }

  return (
    <form onSubmit={add} className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2" aria-label="Artículo varios">
      <p className="text-[11px] font-semibold text-text-secondary">Artículo varios · no descuenta stock</p>
      <input autoFocus value={description} maxLength={MISC_DESCRIPTION_MAX} onChange={(e) => setDescription(e.target.value)}
        placeholder="Qué vendés (ej. Corte de caño a medida)" aria-label="Descripción" className={`${FIELD} w-full`} />
      <div className="flex items-center gap-2">
        <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Precio $" aria-label="Precio" className={`${FIELD} flex-1`} />
        <input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} aria-label="Cantidad" className={`${FIELD} w-16 text-center`} />
        <button type="submit" className="h-8 px-3 rounded-lg bg-primary text-white text-[11px] font-semibold flex items-center gap-1"><Plus size={13} />Agregar</button>
      </div>
      {error && <p role="alert" className="text-[11px] text-danger">{error}</p>}
      <button type="button" onClick={() => { setIsOpen(false); setError(null); }} className="text-[10px] text-text-muted hover:underline">Cancelar</button>
    </form>
  );
};
