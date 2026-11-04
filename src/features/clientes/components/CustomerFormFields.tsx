import React from 'react';
import { Input } from '@/components/ui/Input';
import { emailError, formatTaxIdInput, taxIdError, usesCuitFormat } from '../customerFieldRules';
import type { CustomerIdentificationType } from '../types';

export const ID_TYPES: { value: CustomerIdentificationType; label: string }[] = [
  { value: 'DNI', label: 'DNI (Documento Nacional de Identidad)' },
  { value: 'CUIT', label: 'CUIT (Clave Única de Identificación Tributaria)' },
  { value: 'CUIL', label: 'CUIL (Código Único de Identificación Laboral)' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'EXTRANJERO', label: 'Identificación Extranjera' },
  { value: 'OTRO', label: 'Otro tipo' },
];

interface CustomerFormFieldsProps {
  name: string;
  setName: (v: string) => void;
  idType: CustomerIdentificationType;
  setIdType: (v: CustomerIdentificationType) => void;
  taxId: string;
  setTaxId: (v: string) => void;
  taxIdError: string | null;
  setTaxIdError: (v: string | null) => void;
  email: string;
  setEmail: (v: string) => void;
  emailError: string | null;
  setEmailError: (v: string | null) => void;
  phone: string;
  setPhone: (v: string) => void;
  address: string;
  setAddress: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  isActive: boolean;
  setIsActive: (v: boolean) => void;
  isSubmitting: boolean;
}

export const CustomerFormFields: React.FC<CustomerFormFieldsProps> = ({
  name,
  setName,
  idType,
  setIdType,
  taxId,
  setTaxId,
  taxIdError: taxIdErrorMessage,
  setTaxIdError,
  email,
  setEmail,
  emailError: emailErrorMessage,
  setEmailError,
  phone,
  setPhone,
  address,
  setAddress,
  notes,
  setNotes,
  isActive,
  setIsActive,
  isSubmitting,
}) => {
  const handleIdTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newType = e.target.value as CustomerIdentificationType;
    setIdType(newType);
    setTaxIdError(taxIdError(newType, taxId));
  };

  const handleTaxIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = formatTaxIdInput(idType, e.target.value);
    setTaxId(value);
    setTaxIdError(taxIdError(idType, value));
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setEmailError(emailError(e.target.value));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Nombre o Razón Social <span className="text-destructive">*</span>
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Juan Pérez o Distribuidora Norte S.A."
          required
          maxLength={200}
          disabled={isSubmitting}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Tipo de documento
          </label>
          <select
            value={idType}
            onChange={handleIdTypeChange}
            disabled={isSubmitting}
            aria-label="Tipo de documento"
            className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {ID_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Nº de identificación <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            value={taxId}
            onChange={handleTaxIdChange}
            placeholder={usesCuitFormat(idType) ? '20-12345678-9' : 'Ej. 35123456'}
            disabled={isSubmitting}
            maxLength={30}
          />
          {taxIdErrorMessage && <p className="text-[11px] text-destructive mt-1">{taxIdErrorMessage}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Correo electrónico <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            type="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="cliente@ejemplo.com"
            disabled={isSubmitting}
          />
          {emailErrorMessage && <p className="text-[11px] text-destructive mt-1">{emailErrorMessage}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">
            Teléfono <span className="text-muted-foreground font-normal">(opcional)</span>
          </label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+54 11 4321-0000"
            disabled={isSubmitting}
            maxLength={50}
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Dirección <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <Input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Av. Corrientes 1234, CABA"
          disabled={isSubmitting}
          maxLength={300}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-foreground mb-1">
          Notas adicionales <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Preferencias de entrega, cuenta corriente, etc."
          rows={2}
          maxLength={1000}
          disabled={isSubmitting}
          className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="pt-2">
        <label className="flex items-center gap-2 cursor-pointer text-xs">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={isSubmitting}
            className="rounded border-input text-primary focus:ring-primary h-4 w-4"
          />
          <span className="font-medium text-foreground">Cliente activo</span>
        </label>
        <p className="text-[11px] text-muted-foreground mt-0.5 ml-6">
          Los clientes inactivos no pueden seleccionarse para nuevas ventas comerciales.
        </p>
      </div>
    </div>
  );
};
