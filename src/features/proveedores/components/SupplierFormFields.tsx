import React from 'react';
import { Input } from '@/components/ui/Input';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import { cuitFieldError, emailFieldError, type SupplierFormValues } from '../supplierForm';

interface SupplierFormFieldsProps {
  values: SupplierFormValues;
  isEditing: boolean;
  disabled: boolean;
  onChange: <K extends keyof SupplierFormValues>(field: K, value: SupplierFormValues[K]) => void;
}

/** Datos comerciales y de contacto del proveedor; el estado solo al editar. */
export const SupplierFormFields: React.FC<SupplierFormFieldsProps> = ({ values, isEditing, disabled, onChange }) => (
  <>
    <Input label="Razón Social / Nombre" placeholder="Ej: Distribuidora Metalúrgica S.A." value={values.name}
      onChange={(e) => onChange('name', e.target.value)} disabled={disabled} required />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input label="CUIT (Opcional)" placeholder="30-XXXXXXXX-X" value={values.taxId}
        onChange={(e) => onChange('taxId', formatCuit(e.target.value))} disabled={disabled} error={cuitFieldError(values.taxId) || undefined} />
      <Input label="Persona de Contacto" placeholder="Ej: Juan Pérez" value={values.contactName}
        onChange={(e) => onChange('contactName', e.target.value)} disabled={disabled} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Input label="Correo Electrónico" type="email" placeholder="ventas@proveedor.com" value={values.email}
        onChange={(e) => onChange('email', e.target.value)} disabled={disabled} error={emailFieldError(values.email) || undefined} />
      <Input label="Teléfono" placeholder="Ej: +54 11 4321-0000" value={values.phone}
        onChange={(e) => onChange('phone', e.target.value)} disabled={disabled} />
    </div>
    <Input label="Dirección Comercial" placeholder="Ej: Av. Industrial 4500, Parque Industrial" value={values.address}
      onChange={(e) => onChange('address', e.target.value)} disabled={disabled} />

    {isEditing && (
      <div className="pt-1 flex items-center justify-between p-3 rounded-lg bg-surface-2/60 border border-border/60">
        <div>
          <span className="text-xs font-semibold text-text-primary block">Estado del Proveedor</span>
          <span className="text-[11px] text-text-muted block">
            {values.isActive ? 'Habilitado para órdenes de compra y stock' : 'Deshabilitado temporalmente'}
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" aria-label="Proveedor activo" checked={values.isActive} disabled={disabled}
            onChange={(e) => onChange('isActive', e.target.checked)} className="sr-only peer" />
          <div className="w-9 h-5 bg-surface-3 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    )}
  </>
);
