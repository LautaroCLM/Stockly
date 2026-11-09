import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, Check, Info, Loader2, PlusCircle, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toUserMessage } from '@/lib/errorMessages';
import type { Product, ProductFormData } from '../types';
import { initialProductFormValues, toProductFormData, validateProductForm, type ProductFormValues } from '../productForm';
import { MarginBox, ProductIdentityFields, ProductPricingFields } from './ProductFormFields';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { AnimatePresence } from 'motion/react';

type Result = { success: boolean; error?: string };

interface ProductFormModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialProduct?: Product | null;
  existingCategories: string[];
  canManageCosts?: boolean;
  onClose: () => void;
  onSubmit: (data: ProductFormData) => Promise<Result> | Result;
}

/** Alta y edición de un producto del catálogo (el stock se cambia solo con ajustes). */
const ProductFormModalBody: React.FC<ProductFormModalProps> = ({
  isOpen,
  mode,
  initialProduct,
  existingCategories,
  canManageCosts = true,
  onClose,
  onSubmit,
}) => {
  const [values, setValues] = useState<ProductFormValues>(() => initialProductFormValues(null, existingCategories));
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Se reinicia solo al abrir o al cambiar de producto: una recarga en vivo del catálogo
  // o de las categorías no debe borrar lo que el usuario está escribiendo.
  const categoriesRef = useRef(existingCategories);
  categoriesRef.current = existingCategories;
  const editedProductId = mode === 'edit' ? initialProduct?.id : undefined;
  const initialProductRef = useRef(initialProduct);
  initialProductRef.current = initialProduct;

  useEffect(() => {
    if (!isOpen) return;
    setFormError(null);
    setIsSubmitting(false);
    setValues(initialProductFormValues(mode === 'edit' ? initialProductRef.current : null, categoriesRef.current));
  }, [isOpen, mode, editedProductId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const change = <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const invalid = validateProductForm(values, existingCategories, canManageCosts);
    if (invalid) return setFormError(invalid);

    setIsSubmitting(true);
    try {
      const res = await onSubmit(toProductFormData(values, canManageCosts));
      if (res.success) onClose();
      else setFormError(res.error || 'Ocurrió un error al guardar el producto.');
    } catch (err) {
      setFormError(toUserMessage(err, 'Error al guardar el producto.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const costMissing = mode === 'edit' && (initialProduct?.costPrice === null || initialProduct?.costPrice === undefined);

  return (
    <ModalFrame ariaLabel="Producto" onBackdropClick={onClose} panelClassName="max-w-2xl">
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
              {mode === 'create' ? 'Completa los datos comerciales y de identificación.' : `Modificando SKU: ${initialProduct?.sku}`}
            </span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        {formError && (
          <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
            <AlertTriangle size={15} className="shrink-0" />
            <span>{formError}</span>
          </div>
        )}

        <ProductIdentityFields values={values} categories={existingCategories} onChange={change} />
        <ProductPricingFields values={values} canManageCosts={canManageCosts}
          costPlaceholder={costMissing ? 'Sin costo asignado' : '0.00'} onChange={change} />
        {canManageCosts && <MarginBox costPrice={values.costPrice} salePrice={values.salePrice} />}

        <div className="space-y-1">
          <label htmlFor="product-description" className="text-xs font-semibold text-text-secondary">
            Descripción o Especificaciones Técnicas <span className="text-text-muted text-[11px]">(Opcional)</span>
          </label>
          <textarea id="product-description" rows={2} value={values.description} onChange={(e) => change('description', e.target.value)}
            placeholder="Detalles sobre marca, compatibilidad, garantía o ubicación física en depósito..."
            className="w-full p-2.5 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none resize-none" />
        </div>

        <div className="p-2.5 rounded-lg bg-surface-2/40 border border-border/50 text-[11px] text-text-muted flex items-start gap-2">
          <Info size={13} className="shrink-0 mt-0.5 text-primary" />
          <span>
            <strong>Existencias físicas:</strong> El stock actual no se modifica desde este formulario.
            Las altas iniciales y correcciones se canalizan mediante el módulo de ajustes de inventario.
          </span>
        </div>

        <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
          <Button variant="secondary" size="md" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button variant="primary" size="md" type="submit" className="gap-1.5 shadow-md" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
            <span>{mode === 'create' ? 'Crear Producto' : 'Guardar Cambios'}</span>
          </Button>
        </div>
      </form>
    </ModalFrame>
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const ProductFormModal: React.FC<ProductFormModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <ProductFormModalBody {...props} />}</AnimatePresence>
);
