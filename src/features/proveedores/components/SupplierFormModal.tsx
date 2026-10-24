import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Truck, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { validateCuit, formatCuit } from '@/features/companies/utils/cuitValidator';
import type { Supplier, UpsertSupplierInput, SupplierActionResult } from '../types';

interface SupplierFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
  onSave: (input: Omit<UpsertSupplierInput, 'companyId'>) => Promise<SupplierActionResult>;
}

export const SupplierFormModal: React.FC<SupplierFormModalProps> = ({
  isOpen,
  onClose,
  supplier,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [cuitError, setCuitError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (supplier) {
        setName(supplier.name);
        setTaxId(supplier.taxId ? formatCuit(supplier.taxId) : '');
        setContactName(supplier.contactName || '');
        setEmail(supplier.email || '');
        setPhone(supplier.phone || '');
        setAddress(supplier.address || '');
        setIsActive(supplier.isActive);
      } else {
        setName('');
        setTaxId('');
        setContactName('');
        setEmail('');
        setPhone('');
        setAddress('');
        setIsActive(true);
      }
      setCuitError(null);
      setEmailError(null);
      setActionError(null);
    }
  }, [isOpen, supplier]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleCuitChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const formatted = formatCuit(raw);
    setTaxId(formatted);

    if (formatted.trim() === '') {
      setCuitError(null);
    } else if (!validateCuit(formatted)) {
      setCuitError('El CUIT ingresado no es válido (algoritmo Módulo 11).');
    } else {
      setCuitError(null);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setEmail(val);
    const clean = val.trim();
    if (!clean) {
      setEmailError(null);
    } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(clean)) {
      setEmailError('Formato de correo electrónico inválido.');
    } else {
      setEmailError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 150) {
      setActionError('El nombre o razón social es obligatorio (máximo 150 caracteres).');
      return;
    }

    if (taxId && !validateCuit(taxId)) {
      setActionError('El CUIT no cumple con la validación de integridad numérica.');
      return;
    }

    if (email && emailError) {
      setActionError('El formato de correo electrónico no es válido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onSave({
        supplierId: supplier?.id,
        name: cleanName,
        taxId: taxId ? taxId.replace(/-/g, '').trim() : undefined,
        contactName: contactName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        isActive,
      });

      if (result.success) {
        onClose();
      } else {
        setActionError(result.error || 'No se pudo guardar el proveedor.');
      }
    } catch {
      setActionError('Error de comunicación con el servidor.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div
        className="fixed inset-0 -z-10"
        onClick={() => !isSubmitting && onClose()}
        aria-hidden="true"
      />

      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Truck size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">
                {supplier ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h2>
              <p className="text-[11px] text-text-muted">
                {supplier ? 'Actualizar ficha comercial' : 'Registrar proveedor en la empresa'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action Error Alert */}
        {actionError && (
          <div className="shrink-0 mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
          <Input
            label="Razón Social / Nombre"
            placeholder="Ej: Distribuidora Metalúrgica S.A."
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="CUIT (Opcional)"
              placeholder="30-XXXXXXXX-X"
              value={taxId}
              onChange={handleCuitChange}
              disabled={isSubmitting}
              error={cuitError || undefined}
            />
            <Input
              label="Persona de Contacto"
              placeholder="Ej: Juan Pérez"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Correo Electrónico"
              type="email"
              placeholder="ventas@proveedor.com"
              value={email}
              onChange={handleEmailChange}
              disabled={isSubmitting}
              error={emailError || undefined}
            />
            <Input
              label="Teléfono"
              placeholder="Ej: +54 11 4321-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <Input
            label="Dirección Comercial"
            placeholder="Ej: Av. Industrial 4500, Parque Industrial"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={isSubmitting}
          />

          {supplier && (
            <div className="pt-1 flex items-center justify-between p-3 rounded-lg bg-surface-2/60 border border-border/60">
              <div>
                <span className="text-xs font-semibold text-text-primary block">
                  Estado del Proveedor
                </span>
                <span className="text-[11px] text-text-muted block">
                  {isActive ? 'Habilitado para órdenes de compra y stock' : 'Deshabilitado temporalmente'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={isSubmitting}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 text-xs h-9"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              className="flex-1 text-xs h-9 justify-center"
              disabled={isSubmitting || !name.trim() || !!cuitError || !!emailError}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={13} className="mr-1.5 animate-spin" />
                  <span>Guardando...</span>
                </>
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
