import React from 'react';
import { AlertTriangle, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CategoryCreateFormProps {
  value: string;
  error: string | null;
  isBusy: boolean;
  onChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

/** Formulario para crear una categoría nueva. */
export const CategoryCreateForm: React.FC<CategoryCreateFormProps> = ({ value, error, isBusy, onChange, onSubmit }) => (
  <form onSubmit={onSubmit} className="bg-surface-2/60 border border-border/80 rounded-xl p-3.5 space-y-2.5">
    <label htmlFor="new-category" className="text-xs font-semibold text-text-primary block">
      Crear nueva categoría
    </label>
    <div className="flex items-center gap-2">
      <input
        id="new-category"
        type="text"
        disabled={isBusy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nombre de la categoría (ej. Pinturas, Abrasivos)..."
        className="flex-1 h-9 px-3 text-xs bg-surface-3 border border-border/80 focus:border-primary rounded-lg text-text-primary focus:outline-none disabled:opacity-50"
      />
      <Button type="submit" variant="primary" size="sm" disabled={isBusy} className="h-9 px-3 gap-1.5 font-medium shrink-0">
        {isBusy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
        <span>Crear</span>
      </Button>
    </div>
    {error && (
      <div className="flex items-center gap-1.5 text-[11px] text-danger font-medium">
        <AlertTriangle size={13} />
        <span>{error}</span>
      </div>
    )}
  </form>
);
