import React, { useState, useEffect, useMemo } from 'react';
import { Category, Product } from '../types';
import { Button } from '@/components/ui/Button';
import {
  FolderTree,
  X,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Check,
  Search,
  Layers,
  Lock,
} from 'lucide-react';

interface CategoryManagementModalProps {
  isOpen: boolean;
  companyName: string;
  categories: Category[];
  products: Product[];
  onClose: () => void;
  onCreateCategory: (name: string, description?: string) => { success: boolean; error?: string };
  onRenameCategory: (id: string, newName: string) => { success: boolean; error?: string };
  onDeleteCategory: (id: string, productCount: number) => { success: boolean; error?: string };
}

export const CategoryManagementModal: React.FC<CategoryManagementModalProps> = ({
  isOpen,
  companyName,
  categories,
  products,
  onClose,
  onCreateCategory,
  onRenameCategory,
  onDeleteCategory,
}) => {
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creationError, setCreationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Deletion feedback state
  const [actionAlert, setActionAlert] = useState<{ type: 'error' | 'success'; message: string } | null>(
    null
  );

  // Compute product count per category
  const productCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const cat of categories) {
      const count = products.filter(
        (p) =>
          p.categoryId === cat.id ||
          p.category.trim().toLowerCase() === cat.name.trim().toLowerCase()
      ).length;
      map.set(cat.id, count);
    }
    return map;
  }, [categories, products]);

  // Filtered categories in list
  const filteredCategories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, searchQuery]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Reset errors when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewCategoryName('');
      setCreationError(null);
      setEditingCategoryId(null);
      setEditError(null);
      setActionAlert(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreationError(null);
    setActionAlert(null);

    const clean = newCategoryName.trim();
    if (!clean) {
      setCreationError('El nombre no puede estar vacío.');
      return;
    }

    const res = onCreateCategory(clean);
    if (!res.success) {
      setCreationError(res.error || 'Error al crear la categoría.');
    } else {
      setNewCategoryName('');
      setActionAlert({ type: 'success', message: `Categoría "${clean}" creada correctamente.` });
    }
  }

  function handleStartEdit(cat: Category) {
    setEditingCategoryId(cat.id);
    setEditingName(cat.name);
    setEditError(null);
    setActionAlert(null);
  }

  function handleSaveEdit(id: string) {
    setEditError(null);
    setActionAlert(null);

    const clean = editingName.trim();
    if (!clean) {
      setEditError('El nombre no puede estar vacío.');
      return;
    }

    const res = onRenameCategory(id, clean);
    if (!res.success) {
      setEditError(res.error || 'Error al renombrar la categoría.');
    } else {
      setEditingCategoryId(null);
      setActionAlert({
        type: 'success',
        message: `Categoría renombrada a "${clean}" y productos actualizados.`,
      });
    }
  }

  function handleDelete(cat: Category) {
    setActionAlert(null);
    const count = productCountMap.get(cat.id) || 0;

    if (count > 0) {
      setActionAlert({
        type: 'error',
        message: `No se puede eliminar "${cat.name}" porque tiene ${count} producto(s) asignado(s). Reasigna sus productos primero.`,
      });
      return;
    }

    const res = onDeleteCategory(cat.id, 0);
    if (!res.success) {
      setActionAlert({ type: 'error', message: res.error || 'Error al eliminar la categoría.' });
    } else {
      setActionAlert({
        type: 'success',
        message: `Categoría "${cat.name}" eliminada correctamente.`,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      <div className="min-h-full flex items-center justify-center p-4">
        <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="p-4 px-5 border-b border-border flex items-center justify-between bg-surface-2/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
                <FolderTree size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-text-primary">
                  Gestión de Categorías
                </h2>
                <span className="text-[11px] text-text-muted">
                  Catálogo formal de {companyName} • {categories.length} categorías
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              title="Cerrar (Escape)"
            >
              <X size={17} />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Feedback Alert */}
            {actionAlert && (
              <div
                className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
                  actionAlert.type === 'error'
                    ? 'bg-danger/10 border-danger/30 text-danger'
                    : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
                }`}
              >
                {actionAlert.type === 'error' ? (
                  <AlertTriangle size={15} className="shrink-0" />
                ) : (
                  <Check size={15} className="shrink-0" />
                )}
                <span>{actionAlert.message}</span>
              </div>
            )}

            {/* Creation Card */}
            <form onSubmit={handleCreate} className="bg-surface-2/60 border border-border/80 rounded-xl p-3.5 space-y-2.5">
              <label className="text-xs font-semibold text-text-primary block">
                Crear nueva categoría
              </label>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => {
                    setNewCategoryName(e.target.value);
                    if (creationError) setCreationError(null);
                  }}
                  placeholder="Nombre de la categoría (ej. Pinturas, Abrasivos)..."
                  className="flex-1 h-9 px-3 text-xs bg-surface-3 border border-border/80 focus:border-primary rounded-lg text-text-primary focus:outline-none"
                />

                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="h-9 px-3 gap-1.5 font-medium shrink-0"
                >
                  <Plus size={15} />
                  <span>Crear</span>
                </Button>
              </div>

              {creationError && (
                <div className="flex items-center gap-1.5 text-[11px] text-danger font-medium">
                  <AlertTriangle size={13} />
                  <span>{creationError}</span>
                </div>
              )}
            </form>

            {/* List Header & Search */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-xs font-semibold text-text-secondary">
                Listado de Categorías ({filteredCategories.length})
              </span>

              <div className="relative w-48">
                <Search
                  size={13}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar categorías..."
                  className="w-full h-7 pl-7 pr-2 text-[11px] bg-surface-2 border border-border/70 focus:border-primary rounded-md text-text-primary focus:outline-none"
                />
              </div>
            </div>

            {/* Categories List */}
            <div className="max-h-64 overflow-y-auto border border-border/70 rounded-xl divide-y divide-border/50 bg-surface-2/30">
              {filteredCategories.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-xs">
                  No se encontraron categorías para mostrar.
                </div>
              ) : (
                filteredCategories.map((cat) => {
                  const count = productCountMap.get(cat.id) || 0;
                  const isEditing = editingCategoryId === cat.id;

                  return (
                    <div
                      key={cat.id}
                      className="p-2.5 px-3 flex items-center justify-between gap-3 hover:bg-surface-2/70 transition-colors"
                    >
                      {/* Name or Rename Input */}
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                autoFocus
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveEdit(cat.id);
                                  if (e.key === 'Escape') setEditingCategoryId(null);
                                }}
                                className="h-7 px-2 text-xs bg-surface-3 border border-primary rounded text-text-primary focus:outline-none flex-1"
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(cat.id)}
                                className="p-1 rounded bg-primary text-white hover:bg-primary-hover transition-colors"
                                title="Guardar cambios"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingCategoryId(null)}
                                className="p-1 rounded bg-surface-3 text-text-muted hover:text-text-primary transition-colors"
                                title="Cancelar edición"
                              >
                                <X size={13} />
                              </button>
                            </div>
                            {editError && (
                              <span className="text-[10px] text-danger block font-medium">
                                {editError}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-text-primary truncate">
                              {cat.name}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium ${
                                count > 0
                                  ? 'bg-surface-3 text-text-secondary border border-border/70'
                                  : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
                              }`}
                              title={`${count} productos asignados a esta categoría`}
                            >
                              <Layers size={10} />
                              <span>{count} {count === 1 ? 'prod.' : 'prods.'}</span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(cat)}
                            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors"
                            title={`Renombrar "${cat.name}"`}
                          >
                            <Pencil size={13} />
                          </button>

                          {count > 0 ? (
                            <button
                              type="button"
                              onClick={() => handleDelete(cat)}
                              className="p-1.5 rounded-lg text-text-muted/40 hover:text-danger hover:bg-danger/10 transition-colors"
                              title={`Bloqueado: tiene ${count} productos asociados`}
                            >
                              <Lock size={13} />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleDelete(cat)}
                              className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                              title={`Eliminar categoría vacía "${cat.name}"`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="p-3.5 px-5 border-t border-border bg-surface-2/40 flex items-center justify-between text-xs text-text-muted">
            <span>
              Las categorías eliminadas no deben contener productos asociados.
            </span>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
