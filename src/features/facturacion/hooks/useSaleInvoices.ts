import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentSettings } from '@/features/documentos/hooks/useDocumentSettings';
import { fetchInvoicesForSales } from '../api/invoicesApi';
import type { InvoiceSummary } from '../invoiceTypes';
import { invoiceLettersFor } from '../vat';

/** Facturas de las ventas en pantalla y si el usuario puede facturar. */
export function useSaleInvoices(companyId: string, saleIds: string[], hasPermission: boolean) {
  const [bySale, setBySale] = useState<Map<string, InvoiceSummary>>(new Map());
  const issuer = useDocumentSettings(companyId, true);
  const key = useMemo(() => saleIds.join(','), [saleIds]);

  const reload = useCallback(async () => {
    try {
      setBySale(await fetchInvoicesForSales(companyId, key === '' ? [] : key.split(',')));
    } catch {
      // Sin facturas no se rompe el historial: los botones aparecen al recargar
      setBySale(new Map());
    }
  }, [companyId, key]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const emits = issuer.isLoaded && invoiceLettersFor(issuer.settings.taxCondition).length > 0;
  return { bySale, reload, canInvoice: hasPermission && emits };
}
