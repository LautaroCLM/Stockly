import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { authorizeInvoice, fetchInvoiceDetail } from '../api/invoicesApi';
import type { InvoiceDetail, InvoiceValueResult } from '../invoiceTypes';

export type InvoiceStep = 'loading' | 'ready' | 'sending' | 'failed';

/**
 * Factura o nota de crédito: la prepara (o abre la existente), pide el CAE y vuelve a leerla.
 * `existingId` abre un comprobante ya creado; si es null se llama a `prepare`.
 */
export function useInvoiceDialog(
  companyId: string, existingId: string | null, prepare: () => Promise<InvoiceValueResult<string>>, onChanged: () => void
) {
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [step, setStep] = useState<InvoiceStep>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (invoiceId: string) => {
    try {
      setInvoice(await fetchInvoiceDetail(companyId, invoiceId));
      setStep('ready');
    } catch (err) {
      setMessage(toUserMessage(err, 'No se pudo cargar la factura.'));
      setStep('failed');
    }
  }, [companyId]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      if (existingId) return load(existingId);
      const prepared = await prepare();
      if (!alive) return;
      if (!prepared.ok) {
        setMessage(prepared.message);
        setStep('failed');
        return;
      }
      onChanged();
      await load(prepared.value);
    })();
    return () => { alive = false; };
    // Solo al abrir: prepare y onChanged cambian en cada render del padre y no deben volver a preparar
  }, [companyId, existingId, load]);

  const emit = useCallback(async () => {
    if (!invoice) return;
    setStep('sending');
    setMessage(null);
    const result = await authorizeInvoice(companyId, invoice.id);
    if (!result.ok) setMessage(result.message);
    await load(invoice.id);
    onChanged();
  }, [companyId, invoice, load, onChanged]);

  return { invoice, step, message, emit };
}
