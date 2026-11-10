import React from 'react';
import { CASH_FIELD_CLASS } from '@/features/caja/components/CashModalShell';
import type { Customer } from '@/features/clientes/types';
import type { DocumentFormValues } from '../types';

interface DocumentCustomerFieldsProps {
  values: DocumentFormValues;
  customers: Customer[];
  disabled: boolean;
  onChange: (patch: Partial<DocumentFormValues>) => void;
}

const Field: React.FC<{ id: string; label: string; required?: boolean; className?: string; children: React.ReactNode }> = ({ id, label, required, className, children }) => (
  <div className={`space-y-1 ${className ?? ''}`}>
    <label htmlFor={id} className="block font-semibold text-text-secondary">{label} {required && <span className="text-danger">*</span>}</label>
    {children}
  </div>
);

/** Cliente del documento: se elige uno cargado (copia sus datos) o se escribe a mano. */
export const DocumentCustomerFields: React.FC<DocumentCustomerFieldsProps> = ({ values, customers, disabled, onChange }) => {
  const required = values.type !== 'ticket';
  const pick = (id: string) => {
    const customer = customers.find((c) => c.id === id);
    onChange(customer
      ? { customerId: id, customerName: customer.name, customerTaxId: customer.taxId ?? '', customerAddress: customer.address ?? '', customerPhone: customer.phone ?? '' }
      : { customerId: '' });
  };
  const text = (id: string, key: 'customerName' | 'customerTaxId' | 'customerAddress' | 'customerPhone', max: number, placeholder?: string) => (
    <input id={id} value={values[key]} maxLength={max} placeholder={placeholder} disabled={disabled} className={CASH_FIELD_CLASS}
      onChange={(e) => onChange({ [key]: e.target.value, customerId: '' })} />
  );

  return (
    <div className="space-y-3">
      <Field id="doc-customer" label="Cliente cargado">
        <select id="doc-customer" value={values.customerId} disabled={disabled} className={CASH_FIELD_CLASS} onChange={(e) => pick(e.target.value)}>
          <option value="">{required ? 'Escribir los datos a mano' : 'Consumidor final / escribir a mano'}</option>
          {customers.filter((c) => c.isActive).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field id="doc-customer-name" label="Nombre o razón social" required={required}>{text('doc-customer-name', 'customerName', 150, required ? '' : 'Consumidor final')}</Field>
        <Field id="doc-customer-tax" label="CUIT / DNI">{text('doc-customer-tax', 'customerTaxId', 30)}</Field>
        <Field id="doc-customer-address" label="Domicilio">{text('doc-customer-address', 'customerAddress', 200)}</Field>
        <Field id="doc-customer-phone" label="Teléfono">{text('doc-customer-phone', 'customerPhone', 50)}</Field>
      </div>
    </div>
  );
};
