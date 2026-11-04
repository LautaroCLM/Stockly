import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Truck, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Supplier, UpsertSupplierInput, SupplierActionResult } from '../types';
import {
  cuitFieldError,
  emailFieldError,
  initialSupplierValues,
  toSupplierInput,
  validateSupplierForm,
  type SupplierFormValues,
} from '../supplierForm';
import { SupplierFormFields } from './SupplierFormFields';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  onSave: (input: Omit<UpsertSupplierInput, 'companyId'>) => Promise<SupplierActionResult>;
}

/** Alta y edición de un proveedor. */
export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({ isOpen, onClose, supplier, onSave }) => {
  const [values, setValues] = useState<SupplierFormValues>(() => initialSupplierValues(null));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Se reinicia al abrir o al cambiar de proveedor, no con cada recarga en vivo de la lista
  const supplierRef = useRef(supplier);
  supplierRef.current = supplier;
  useEffect(() => {
    if (!isOpen) return;
    setValues(initialSupplierValues(supplierRef.current));
    setActionError(null);
  }, [isOpen, supplier?.id]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const change = <K extends keyof SupplierFormValues>(field: K, value: SupplierFormValues[K]) =>
    setValues((prev) => ({ ...prev, [field]: value }));
  const hasFieldErrors = Boolean(cuitFieldError(values.taxId) || emailFieldError(values.email));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    const invalid = validateSupplierForm(values);
    if (invalid) return setActionError(invalid);

    setIsSubmitting(true);
    try {
      const result = await onSave(toSupplierInput(values, supplier?.id));
      if (result.success) onClose();
      else setActionError(result.error || 'No se pudo guardar el proveedor.');
    } catch {
      setActionError('Error de comunicación con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="fixed inset-0 -z-10" onClick={() => !isSubmitting && onClose()} aria-hidden="true" />
      <div className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Truck size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">{supplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}</h2>
              <p className="text-[11px] text-text-muted">{supplier ? 'Actualizar ficha comercial' : 'Registrar proveedor en la empresa'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        {actionError && (
          <div role="alert" className="shrink-0 mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          <SupplierFormFields values={values} isEditing={Boolean(supplier)} disabled={isSubmitting} onChange={change} />
          <div className="pt-2 flex gap-2">
            <Button type="button" variant="outline" className="flex-1 text-xs h-9" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" variant="primary" className="flex-1 text-xs h-9 justify-center"
              disabled={isSubmitting || !values.name.trim() || hasFieldErrors}>
              {isSubmitting ? (
                <><Loader2 size={13} className="mr-1.5 animate-spin" /><span>Guardando...</span></>
              ) : (
                <span>{supplier ? 'Guardar Cambios' : 'Crear Proveedor'}</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
