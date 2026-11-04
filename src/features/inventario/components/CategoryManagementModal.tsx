import React, { useState, useEffect, useMemo } from 'react';
import { FolderTree, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Category, Product } from '../types';
import { CategoryRow, countProductsByCategory } from './CategoryRow';
import { CategoryCreateForm } from './CategoryCreateForm';
import { CategoryFeedback, type CategoryAlert } from './CategoryFeedback';

type Result = { success: boolean; error?: string; category?: Category };

interface CategoryManagementModalProps {
  isOpen: boolean;
  companyName: string;
  categories: Category[];
  products: Product[];
  isLoading?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreateCategory: (name: string, description?: string) => Promise<Result> | Result;
  onRenameCategory: (id: string, newName: string) => Promise<Result> | Result;
  onDeleteCategory: (id: string, productCount: number) => Promise<Result> | Result;
}


/** Alta, renombre y baja de las categorías de la empresa. */
export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  companyName,
  categories,
  products,
  isLoading = false,
  error = null,
  onClose,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOperating, setIsOperating] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionAlert, setActionAlert] = useState<CategoryAlert>(null);

  const productCountMap = useMemo(() => countProductsByCategory(categories, products), [categories, products]);
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, searchQuery]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    setNewCategoryName('');
    setCreationError(null);
    setEditingCategoryId(null);
    setEditError(null);
    setActionAlert(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const run = async (action: () => Promise<void>) => {
    setIsOperating(true);
    try {
      await action();
    } finally {
      setIsOperating(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreationError(null);
    setActionAlert(null);
    const clean = newCategoryName.trim();
    if (!clean) return setCreationError('El nombre no puede estar vacío.');
    await run(async () => {
      const res = await onCreateCategory(clean);
      if (!res.success) return setCreationError(res.error || 'Error al crear la categoría.');
      setNewCategoryName('');
      setActionAlert({ type: 'success', message: `Categoría "${clean}" creada correctamente.` });
    });
  };

  const handleSaveEdit = async (id: string, newName: string) => {
    setEditError(null);
    setActionAlert(null);
    const clean = newName.trim();
    if (!clean) return setEditError('El nombre no puede estar vacío.');
    await run(async () => {
      const res = await onRenameCategory(id, clean);
      if (!res.success) return setEditError(res.error || 'Error al renombrar la categoría.');
      setEditingCategoryId(null);
      setActionAlert({ type: 'success', message: `Categoría renombrada a "${clean}" correctamente.` });
    });
  };

  const handleDelete = async (cat: Category) => {
    setActionAlert(null);
    const count = productCountMap.get(cat.id) || 0;
    if (count > 0) {
      return setActionAlert({
        type: 'error',
        message: `No se puede eliminar "${cat.name}" porque tiene ${count} producto(s) asignado(s). Reasigna sus productos primero.`,
      });
    }
    await run(async () => {
      const res = await onDeleteCategory(cat.id, 0);
      setActionAlert(
        res.success
          ? { type: 'success', message: `Categoría "${cat.name}" eliminada correctamente.` }
          : { type: 'error', message: res.error || 'Error al eliminar la categoría.' }
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-150" onClick={onClose} />
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          <div className="p-4 px-5 border-b border-border flex items-center justify-between bg-surface-2/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <FolderTree size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">Gestión de Categorías</h2>
                <span className="text-[11px] text-text-muted">Catálogo formal de {companyName} • {categories.length} categorías</span>
              </div>
            </div>
            <button onClick={onClose} title="Cerrar (Escape)" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors">
              <X size={17} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <CategoryFeedback loadError={error} alert={actionAlert} />

            <CategoryCreateForm
              value={newCategoryName}
              error={creationError}
              isBusy={isOperating}
              onChange={(value) => {
                setNewCategoryName(value);
                if (creationError) setCreationError(null);
              }}
              onSubmit={handleCreate}
            />

            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs font-semibold text-text-secondary flex items-center gap-2">
                <span>Listado de Categorías ({filteredCategories.length})</span>
                {isLoading && <Loader2 size={13} className="animate-spin text-primary" />}
              </span>
              <div className="relative w-48">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Filtrar categorías..."
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-surface-2 border border-border/70 focus:border-primary rounded-md text-text-primary focus:outline-none" />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto border border-border/70 rounded-xl divide-y divide-border/50 bg-surface-2/30">
              {isLoading && categories.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs flex items-center justify-center gap-2">
                  <Loader2 size={15} className="animate-spin text-primary" />
                  <span>Cargando categorías...</span>
                </div>
              ) : filteredCategories.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">No se encontraron categorías para mostrar.</div>
              ) : (
                filteredCategories.map((cat) => (
                  <CategoryRow key={cat.id} category={cat} productCount={productCountMap.get(cat.id) || 0}
                    isEditing={editingCategoryId === cat.id} editError={editingCategoryId === cat.id ? editError : null}
                    onStartEdit={() => {
                      setEditingCategoryId(cat.id);
                      setEditError(null);
                      setActionAlert(null);
                    }}
                    onCancelEdit={() => setEditingCategoryId(null)}
                    onSaveEdit={(name) => void handleSaveEdit(cat.id, name)}
                    onDelete={() => void handleDelete(cat)} />
                ))
              )}
            </div>
          </div>

          <div className="p-3.5 px-5 border-t border-border bg-surface-2/40 flex items-center justify-between text-xs text-text-muted">
            <span>Las categorías eliminadas no deben contener productos asociados.</span>
            <Button variant="secondary" size="sm" onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
