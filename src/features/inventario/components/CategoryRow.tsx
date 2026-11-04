import React, { useState } from 'react';
import { Check, Layers, Lock, Pencil, Trash2, X } from 'lucide-react';
import type { Category } from '../types';

interface CategoryRowProps {
  category: Category;
  productCount: number;
  isEditing: boolean;
  editError: string | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (newName: string) => void;
  onDelete: () => void;
}

const ICON_BUTTON = 'p-1.5 rounded-lg transition-colors';

/** Una categoría del listado: nombre y cantidad de productos, renombrar o eliminar. */
export const CategoryRow: React.FC<CategoryRowProps> = ({
  category,
  productCount,
  isEditing,
  editError,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}) => {
  const [draft, setDraft] = useState(category.name);
  const startEdit = () => {
    setDraft(category.name);
    onStartEdit();
  };

  return (
    <div className="p-2.5 px-3 flex items-center justify-between gap-3 hover:bg-surface-2/70 transition-colors">
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <input type="text" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSaveEdit(draft);
                  if (e.key === 'Escape') onCancelEdit();
                }}
                aria-label={`Nuevo nombre para ${category.name}`}
                className="h-7 px-2 text-xs bg-surface-3 border border-primary rounded text-text-primary focus:outline-none flex-1" />
              <button type="button" onClick={() => onSaveEdit(draft)} title="Guardar cambios"
                className="p-1 rounded bg-primary text-white hover:bg-primary-hover transition-colors">
                <Check size={13} />
              </button>
              <button type="button" onClick={onCancelEdit} title="Cancelar edición"
                className="p-1 rounded bg-surface-3 text-text-muted hover:text-text-primary transition-colors">
                <X size={13} />
              </button>
            </div>
            {editError && <span className="text-[10px] text-danger block font-medium">{editError}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-text-primary truncate">{category.name}</span>
            <span title={`${productCount} productos asignados a esta categoría`}
              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                productCount > 0
                  ? 'bg-surface-3 text-text-secondary border border-border/70'
                  : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
              }`}>
              <Layers size={10} />
              <span>{productCount} {productCount === 1 ? 'prod.' : 'prods.'}</span>
            </span>
          </div>
        )}
      </div>

      {!isEditing && (
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={startEdit} title={`Renombrar "${category.name}"`}
            className={`${ICON_BUTTON} text-text-muted hover:text-text-primary hover:bg-surface-3`}>
            <Pencil size={13} />
          </button>
          {productCount > 0 ? (
            <button type="button" onClick={onDelete} title={`Bloqueado: tiene ${productCount} productos asociados`}
              className={`${ICON_BUTTON} text-text-muted/40 hover:text-danger hover:bg-danger/10`}>
              <Lock size={13} />
            </button>
          ) : (
            <button type="button" onClick={onDelete} title={`Eliminar categoría vacía "${category.name}"`}
              className={`${ICON_BUTTON} text-text-muted hover:text-danger hover:bg-danger/10`}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/** Cantidad de productos por categoría (por id o, en datos viejos, por nombre). */
export function countProductsByCategory(
  categories: Category[],
  products: { categoryId?: string; category: string }[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const cat of categories) {
    const name = cat.name.trim().toLowerCase();
    map.set(cat.id, products.filter((p) => p.categoryId === cat.id || p.category.trim().toLowerCase() === name).length);
  }
  return map;
}
