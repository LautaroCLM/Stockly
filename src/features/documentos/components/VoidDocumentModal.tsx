import React, { useState } from 'react';
import { Ban, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import { formatDocumentNumber } from '../documentMath';
import { DOC_TYPE_LABELS } from '../types';
import type { DocumentActionResult, DocumentRecord } from '../types';

interface VoidDocumentModalProps {
  doc: DocumentRecord;
  onClose: () => void;
  onVoid: (documentId: string, reason: string) => Promise<DocumentActionResult>;
  onVoided: () => void;
}

/** Anular un documento: queda en el historial con el motivo y no se puede reactivar. */
export const VoidDocumentModal: React.FC<VoidDocumentModalProps> = ({ doc, onClose, onVoid, onVoided }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 3) return setError('Indicá el motivo de la anulación (al menos 3 caracteres).');
    setIsSubmitting(true);
    setError(null);
    const result = await onVoid(doc.id, reason);
    setIsSubmitting(false);
    if (result.ok) onVoided();
    else setError(result.message);
  };

  return (
    <CashModalShell title="Anular documento" subtitle={`${DOC_TYPE_LABELS[doc.type]} ${formatDocumentNumber(doc.pointOfSale, doc.number)}`}
      icon={<Ban size={18} />} isBusy={isSubmitting} onClose={onClose}>
      <form onSubmit={submit} className="p-6 space-y-3 text-xs">
        <p className="text-text-secondary leading-relaxed">
          El documento queda en el historial marcado como anulado y no se puede volver a activar. Su número no se reutiliza.
        </p>
        <div className="space-y-1">
          <label htmlFor="void-reason" className="font-semibold text-text-secondary">Motivo <span className="text-danger">*</span></label>
          <input id="void-reason" value={reason} maxLength={300} disabled={isSubmitting} className={CASH_FIELD_CLASS}
            onChange={(e) => setReason(e.target.value)} autoFocus />
        </div>
        <CashFormError message={error} />
        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={onClose}>Volver</Button>
          <Button type="submit" variant="danger" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Anular documento</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
