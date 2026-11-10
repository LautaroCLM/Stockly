import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FilePlus2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS, CashFormError, CashModalShell } from '@/features/caja/components/CashModalShell';
import type { Customer } from '@/features/clientes/types';
import type { Product } from '@/features/inventario/types';
import { formatCurrency } from '@/lib/formatters';
import { fromHundredths } from '@/lib/decimal';
import { buildPayload, emptyForm, validateDocument } from '../documentForm';
import { computeTotals, priceMode } from '../documentMath';
import { DOC_TYPE_LABELS, DOC_TYPE_NEW_TITLES } from '../types';
import type { CreatedDocument, DocType, DocumentActionResult, DocumentFormValues, DocumentPayload } from '../types';
import { DocumentCustomerFields } from './DocumentCustomerFields';
import { DocumentItemsEditor } from './DocumentItemsEditor';

interface DocumentFormModalProps {
  type: DocType;
  today: string;
  /** Valores de partida (por ejemplo, al duplicar un documento). */
  initial?: DocumentFormValues;
  products: Product[];
  customers: Customer[];
  onClose: () => void;
  onSubmit: (payload: DocumentPayload, idempotencyKey: string) => Promise<DocumentActionResult<CreatedDocument>>;
  onCreated: (created: CreatedDocument) => void;
}

const LABEL = 'block font-semibold text-text-secondary';

/** Alta de un documento: ticket, presupuesto, remito X o garantía. No toca stock ni caja. */
export const DocumentFormModal: React.FC<DocumentFormModalProps> = ({ type, today, initial, products, customers, onClose, onSubmit, onCreated }) => {
  const [values, setValues] = useState<DocumentFormValues>(() => initial ?? emptyForm(type, today));
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Misma clave mientras no cambie nada: reintentar tras un corte no emite el documento dos veces
  const keyRef = useRef<string>(crypto.randomUUID());
  const payload = useMemo(() => buildPayload(values), [values]);
  useEffect(() => {
    keyRef.current = crypto.randomUUID();
  }, [payload]);

  const patch = (changes: Partial<DocumentFormValues>) => setValues((v) => ({ ...v, ...changes }));
  const mode = priceMode(type);
  const totals = computeTotals(values.items, values.discount, values.showPrices);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = validateDocument(values);
    if (problem) return setError({ message: problem });
    setIsSubmitting(true);
    setError(null);
    const result = await onSubmit(payload, keyRef.current);
    setIsSubmitting(false);
    if (result.ok) onCreated(result.value);
    else setError({ message: result.message, uncertain: result.uncertain });
  };

  return (
    <CashModalShell title={DOC_TYPE_NEW_TITLES[type]} subtitle="No cuenta como venta ni modifica el stock"
      icon={<FilePlus2 size={18} />} isBusy={isSubmitting} onClose={onClose} panelClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
        <DocumentCustomerFields values={values} customers={customers} disabled={isSubmitting} onChange={patch} />

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="doc-date" className={LABEL}>Fecha <span className="text-danger">*</span></label>
            <input id="doc-date" type="date" value={values.issueDate} disabled={isSubmitting} className={CASH_FIELD_CLASS}
              onChange={(e) => patch({ issueDate: e.target.value })} />
          </div>
          {type === 'presupuesto' && (
            <div className="space-y-1">
              <label htmlFor="doc-valid" className={LABEL}>Válido hasta</label>
              <input id="doc-valid" type="date" value={values.validUntil} min={values.issueDate} disabled={isSubmitting}
                className={CASH_FIELD_CLASS} onChange={(e) => patch({ validUntil: e.target.value })} />
            </div>
          )}
          {type === 'garantia' && (
            <div className="space-y-1">
              <label htmlFor="doc-warranty" className={LABEL}>Plazo (meses) <span className="text-danger">*</span></label>
              <input id="doc-warranty" inputMode="numeric" value={values.warrantyMonths} disabled={isSubmitting}
                className={CASH_FIELD_CLASS} onChange={(e) => patch({ warrantyMonths: e.target.value })} />
            </div>
          )}
          {mode === 'optional' && (
            <label className="flex items-center gap-2 text-text-secondary cursor-pointer self-end pb-2.5">
              <input type="checkbox" checked={values.showPrices} disabled={isSubmitting} onChange={(e) => patch({ showPrices: e.target.checked })} />
              Mostrar precios en el remito
            </label>
          )}
        </div>

        <DocumentItemsEditor type={type} items={values.items} products={products} showPrices={values.showPrices}
          disabled={isSubmitting} onChange={(items) => patch({ items })} />

        {values.showPrices && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-surface-2/50 border border-border">
            <div className="flex items-center gap-2">
              <label htmlFor="doc-discount" className={LABEL}>Descuento ($)</label>
              <input id="doc-discount" inputMode="decimal" value={values.discount} disabled={isSubmitting} placeholder="0,00"
                className={`${CASH_FIELD_CLASS} !w-28`} onChange={(e) => patch({ discount: e.target.value })} />
            </div>
            <div className="text-right text-text-muted">
              Subtotal {formatCurrency(fromHundredths(totals.subtotalCents))}
              <div className="text-sm font-bold text-text-primary">Total {formatCurrency(fromHundredths(totals.totalCents))}</div>
            </div>
          </div>
        )}

        <div className="space-y-1">
          <label htmlFor="doc-notes" className={LABEL}>
            {type === 'garantia' ? 'Condiciones de la garantía' : type === 'presupuesto' ? 'Condiciones y observaciones' : 'Observaciones'}
          </label>
          <textarea id="doc-notes" rows={3} maxLength={1000} value={values.notes} disabled={isSubmitting}
            className={CASH_FIELD_CLASS} onChange={(e) => patch({ notes: e.target.value })} />
        </div>

        <CashFormError message={error?.message ?? null} uncertain={error?.uncertain} />

        <div className="flex justify-end gap-2.5 pt-1">
          <Button type="button" variant="secondary" size="sm" disabled={isSubmitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="primary" size="sm" disabled={isSubmitting} className="gap-1.5">
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            <span>Emitir {type === 'remito' ? 'remito' : DOC_TYPE_LABELS[type].toLowerCase()}</span>
          </Button>
        </div>
      </form>
    </CashModalShell>
  );
};
