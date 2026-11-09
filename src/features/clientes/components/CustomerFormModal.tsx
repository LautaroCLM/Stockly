import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserCheck, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import type { Customer, UpsertCustomerInput, CustomerActionResult, CustomerIdentificationType } from '../types';
import { CustomerFormFields } from './CustomerFormFields';
import { AnimatePresence, m } from 'motion/react';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';

interface CustomerFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSave: (input: Omit<UpsertCustomerInput, 'companyId'>) => Promise<CustomerActionResult>;
}

const CustomerFormModalBody: React.FC<CustomerFormModalProps> = ({
  isOpen,
  onClose,
  customer,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [idType, setIdType] = useState<CustomerIdentificationType>('DNI');
  const [taxId, setTaxId] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [taxIdError, setTaxIdError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (customer) {
        setName(customer.name);
        setIdType(customer.identificationType || 'DNI');
        setTaxId(
          customer.identificationType === 'CUIT' || customer.identificationType === 'CUIL'
            ? customer.taxId ? formatCuit(customer.taxId) : ''
            : customer.taxId || ''
        );
        setEmail(customer.email || '');
        setPhone(customer.phone || '');
        setAddress(customer.address || '');
        setNotes(customer.notes || '');
        setIsActive(customer.isActive);
      } else {
        setName('');
        setIdType('DNI');
        setTaxId('');
        setEmail('');
        setPhone('');
        setAddress('');
        setNotes('');
        setIsActive(true);
      }
      setTaxIdError(null);
      setEmailError(null);
      setActionError(null);
    }
  }, [isOpen, customer]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (taxIdError || emailError) return;

    setIsSubmitting(true);
    setActionError(null);

    const result = await onSave({
      customerId: customer ? customer.id : undefined,
      name: name.trim(),
      identificationType: idType,
      taxId: taxId.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      notes: notes.trim() || null,
      isActive,
    });

    setIsSubmitting(false);

    if (result.success) {
      onClose();
    } else {
      setActionError(result.error || 'Error al guardar el cliente.');
    }
  };

  return createPortal(
    <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <m.div variants={modalPanelVariants} className="relative w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/80">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">
                {customer ? 'Editar cliente' : 'Nuevo cliente'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {customer ? 'Actualice los datos comerciales y de contacto.' : 'Registre un nuevo cliente comercial o consumidor final.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {actionError && (
            <div className="p-3 text-xs bg-destructive/10 border border-destructive/20 text-destructive rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          <CustomerFormFields
            name={name}
            setName={setName}
            idType={idType}
            setIdType={setIdType}
            taxId={taxId}
            setTaxId={setTaxId}
            taxIdError={taxIdError}
            setTaxIdError={setTaxIdError}
            email={email}
            setEmail={setEmail}
            emailError={emailError}
            setEmailError={setEmailError}
            phone={phone}
            setPhone={setPhone}
            address={address}
            setAddress={setAddress}
            notes={notes}
            setNotes={setNotes}
            isActive={isActive}
            setIsActive={setIsActive}
            isSubmitting={isSubmitting}
          />

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/80">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting || !name.trim() || Boolean(taxIdError) || Boolean(emailError)}
            >
              {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {customer ? 'Guardar cambios' : 'Registrar cliente'}
            </Button>
          </div>
        </form>
      </m.div>
    </m.div>,
    document.body
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const CustomerFormModal: React.FC<CustomerFormModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <CustomerFormModalBody {...props} />}</AnimatePresence>
);
