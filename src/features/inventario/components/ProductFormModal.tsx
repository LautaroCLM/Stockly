import React, { useState, useEffect } from 'react';
import { Product, ProductFormData } from '../types';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { X, PlusCircle, Save, AlertTriangle, Info, Check, Loader2 } from 'lucide-react';

interface ProductFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialProduct?: Product | null;
  existingCategories: string[];
  canManageCosts?: boolean;
  onClose: () => void;
  onSubmit: (data: ProductFormData) => Promise<{ success: boolean; error?: string }> | { success: boolean; error?: string };
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  isOpen,
  mode,
  initialProduct,
  existingCategories,
  canManageCosts = true,
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [costPrice, setCostPrice] = useState('0');
  const [salePrice, setSalePrice] = useState('0');
  const [minStock, setMinStock] = useState('5');
  const [unit, setUnit] = useState('unidad');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Populate form fields on open or product change
  useEffect(() => {
    if (isOpen) {
      setFormError(null);
      setIsSubmitting(false);
      if (mode === 'edit' && initialProduct) {
        setName(initialProduct.name);
        setSku(initialProduct.sku);
        setBarcode(initialProduct.barcode || '');
        setCategory(initialProduct.category);
        setCostPrice(
          initialProduct.costPrice !== null && initialProduct.costPrice !== undefined
            ? initialProduct.costPrice.toString()
            : ''
        );
        setSalePrice(initialProduct.salePrice.toString());
        setMinStock(initialProduct.minStock.toString());
        setUnit(initialProduct.unit || 'unidad');
        setDescription(initialProduct.description || '');
      } else {
        setName('');
        setSku('');
        setBarcode('');
        setCategory(existingCategories[0] || '');
        setCostPrice('');
        setSalePrice('0');
        setMinStock('5');
        setUnit('unidad');
        setDescription('');
      }
    }
  }, [isOpen, mode, initialProduct, existingCategories]);

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

  if (!isOpen) return null;

  // Real-time commercial metrics (evita presentar un costo ausente como $0)
  const hasCost = costPrice.trim() !== '' && !isNaN(Number(costPrice));
  const parsedCost = hasCost ? parseFloat(costPrice) : null;
  const parsedSale = parseFloat(salePrice) || 0;
  const grossProfit = parsedCost !== null ? parsedSale - parsedCost : null;
  const margin = parsedCost !== null && parsedSale > 0 ? ((parsedSale - parsedCost) / parsedSale) * 100 : null;
  const isNegativeMargin = parsedCost !== null && parsedSale > 0 && parsedCost > parsedSale;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const finalCategory = category.trim();

    if (!name.trim()) {
      setFormError('El nombre del producto es obligatorio.');
      return;
    }
    if (!sku.trim()) {
      setFormError('El código SKU es obligatorio.');
      return;
    }
    if (existingCategories.length === 0) {
      setFormError('No hay categorías registradas en la empresa. Debe crear una categoría desde la sección "Categorías" antes de continuar.');
      return;
    }
    if (!finalCategory) {
      setFormError('Debe seleccionar una categoría para el producto.');
      return;
    }
    if (canManageCosts && parsedCost !== null && parsedCost < 0) {
      setFormError('El costo no puede ser negativo.');
      return;
    }
    if (parsedSale < 0) {
      setFormError('El precio de venta no puede ser negativo.');
      return;
    }
    if (parseFloat(minStock) < 0) {
      setFormError('El stock mínimo no puede ser negativo.');
      return;
    }

    const payload: ProductFormData = {
      name: name.trim(),
      sku: sku.trim().toUpperCase(),
      barcode: barcode.trim(),
      category: finalCategory,
      costPrice: canManageCosts ? parsedCost : undefined,
      salePrice: parsedSale,
      minStock: Math.max(0, parseInt(minStock, 10) || 0),
      unit: unit.trim().toLowerCase() || 'unidad',
      description: description.trim() || undefined,
    };

    setIsSubmitting(true);
    try {
      const res = await onSubmit(payload);
      if (!res.success) {
        setFormError(res.error || 'Ocurrió un error al guardar el producto.');
      } else {
        onClose();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el producto.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              {mode === 'create' ? <PlusCircle size={18} /> : <Save size={18} />}
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                {mode === 'create' ? 'Nuevo Producto en Catálogo' : 'Editar Datos del Producto'}
              </h2>
              <span className="text-xs text-text-muted">
                {mode === 'create'
                  ? 'Completa los datos comerciales y de identificación.'
                  : `Modificando SKU: ${initialProduct?.sku}`}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {formError && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Nombre */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Nombre del Producto <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Taladro Percutor Bosch 650W"
              className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none"
            />
          </div>

          {/* Row 2: SKU, Barcode, Categoría */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Código SKU <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="Ej. FER-1108"
                className="w-full h-9 px-3 text-xs font-mono bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary uppercase focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Código de Barras <span className="text-text-muted text-[11px]">(Opcional)</span>
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Ej. 7791234567890"
                className="w-full h-9 px-3 text-xs font-mono bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Categoría <span className="text-danger">*</span>
              </label>

              {existingCategories.length > 0 ? (
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none cursor-pointer"
                >
                  <option value="" disabled>
                    Seleccione una categoría...
                  </option>
                  {existingCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="p-2 bg-warning/10 border border-warning/30 rounded-lg text-[11px] text-warning leading-snug">
                  No hay categorías registradas. Debe crear una desde el botón &quot;Categorías&quot;.
                </div>
              )}
              <p className="text-[10px] text-text-muted">
                Para crear o editar categorías, use el módulo &quot;Categorías&quot; del inventario.
              </p>
            </div>
          </div>

          {/* Row 3: Precios, Costo, Stock Mínimo y Unidad */}
          <div className={`grid grid-cols-1 ${canManageCosts ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
            {canManageCosts && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-text-secondary">
                  Costo Compra ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costPrice}
                  placeholder={
                    mode === 'edit' && (initialProduct?.costPrice === null || initialProduct?.costPrice === undefined)
                      ? 'Sin costo asignado'
                      : '0.00'
                  }
                  onChange={(e) => setCostPrice(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-semibold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Precio Venta ($) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                className="w-full h-9 px-3 text-xs font-bold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Stock Mínimo
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full h-9 px-3 text-xs font-semibold text-right bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-text-secondary">
                Unidad
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none"
              >
                <option value="unidad">Unidad (unidad)</option>
                <option value="bulto">Bulto / Caja (bulto)</option>
                <option value="par">Par (par)</option>
                <option value="kg">Kilogramo (kg)</option>
                <option value="litro">Litro (litro)</option>
                <option value="metro">Metro (metro)</option>
              </select>
            </div>
          </div>

          {/* Real-time Margin & Profit Box (Solo para roles autorizados) */}
          {canManageCosts && (
            <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Ganancia bruta estimada:</span>
                <span
                  className={`font-bold tabular-nums ${
                    grossProfit === null
                      ? 'text-text-muted font-normal'
                      : grossProfit >= 0
                      ? 'text-emerald-400'
                      : 'text-danger'
                  }`}
                >
                  {grossProfit !== null
                    ? `${grossProfit >= 0 ? '+' : ''}${formatCurrency(grossProfit)}`
                    : 'No disponible (sin costo asignado)'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-text-muted">Margen sobre precio de venta:</span>
                <span
                  className={`font-bold tabular-nums ${
                    margin === null
                      ? 'text-text-muted font-normal'
                      : margin >= 20
                      ? 'text-emerald-400'
                      : margin >= 0
                      ? 'text-amber-400'
                      : 'text-danger'
                  }`}
                >
                  {margin !== null
                    ? `${margin.toFixed(1)}%`
                    : grossProfit === null
                    ? 'No disponible (sin costo asignado)'
                    : 'No calculable (Precio $0)'}
                </span>
              </div>

              {isNegativeMargin && (
                <div className="pt-2 border-t border-border/50 text-[11px] text-amber-400 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="shrink-0" />
                  <span>
                    Atención: El costo de compra supera el precio de venta (Margen negativo).
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Description (Optional) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-text-secondary">
              Descripción o Especificaciones Técnicas <span className="text-text-muted text-[11px]">(Opcional)</span>
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalles sobre marca, compatibilidad, garantía o ubicación física en depósito..."
              className="w-full p-2.5 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none"
            />
          </div>

          {/* Notice on Stock Immutability */}
          <div className="p-2.5 rounded-lg bg-surface-2/40 border border-border/50 text-[11px] text-text-muted flex items-start gap-2">
            <Info size={13} className="shrink-0 mt-0.5 text-primary" />
            <span>
              <strong>Existencias físicas:</strong> El stock actual no se modifica desde este formulario.
              Las altas iniciales y correcciones se canalizan mediante el módulo de ajustes de inventario.
            </span>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button variant="primary" size="md" type="submit" className="gap-1.5 shadow-md" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              <span>{mode === 'create' ? 'Crear Producto' : 'Guardar Cambios'}</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
