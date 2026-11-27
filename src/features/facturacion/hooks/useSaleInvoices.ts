import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentSettings } from '@/features/documentos/hooks/useDocumentSettings';
import { fetchSaleInvoices } from '../api/invoicesApi';
import type { SaleInvoicesState } from '../invoiceTypes';
import { invoiceLettersFor } from '../vat';

/** Facturas, notas de crédito y notas que faltan de las ventas en pantalla; y si el usuario puede facturar. */
export function useSaleInvoices(companyId: string, saleIds: string[], hasPermission: boolean, refreshKey: string) {
  const [bySale, setBySale] = useState<Map<string, SaleInvoicesState>>(new Map());
  const issuer = useDocumentSettings(companyId, true);
  const key = useMemo(() => saleIds.join(','), [saleIds]);

  const reload = useCallback(async () => {
    try {
      setBySale(await fetchSaleInvoices(companyId, key === '' ? [] : key.split(',')));
    } catch {
      // Sin facturas no se rompe el historial: los botones aparecen al recargar
      setBySale(new Map());
    }
  }, [companyId, key]);

  // También al anular o devolver: cambia lo que falta acreditar aunque las ventas sean las mismas
  useEffect(() => {
    void reload();
  }, [reload, refreshKey]);

  const emits = issuer.isLoaded && invoiceLettersFor(issuer.settings.taxCondition).length > 0;
  return { bySale, reload, canInvoice: hasPermission && emits };
}
