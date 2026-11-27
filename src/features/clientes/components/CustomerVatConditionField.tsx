import React from 'react';
import {
  CUSTOMER_VAT_CONDITIONS,
  CUSTOMER_VAT_CONDITION_LABELS,
  type CustomerVatCondition,
} from '@/features/facturacion/vat';

interface CustomerVatConditionFieldProps {
  value: CustomerVatCondition;
  error: string | null;
  disabled: boolean;
  onChange: (value: CustomerVatCondition) => void;
}

/** Condición frente al IVA: define si al cliente se le hace Factura A o B. */
export const CustomerVatConditionField: React.FC<CustomerVatConditionFieldProps> = ({ value, error, disabled, onChange }) => (
  <div className="space-y-1.5">
    <label htmlFor="customer-vat-condition" className="text-xs font-medium text-foreground">
      Condición frente al IVA
    </label>
    <select
      id="customer-vat-condition"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as CustomerVatCondition)}
      className="w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none cursor-pointer"
    >
      {CUSTOMER_VAT_CONDITIONS.map((c) => (
        <option key={c} value={c}>{CUSTOMER_VAT_CONDITION_LABELS[c]}</option>
      ))}
    </select>
    {error ? (
      <p className="text-[11px] text-destructive">{error}</p>
    ) : (
      <p className="text-[11px] text-muted-foreground">
        A un Responsable Inscripto se le hace Factura A; al resto, Factura B.
      </p>
    )}
  </div>
);
