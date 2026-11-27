import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Company } from '@/types';
import type { Sale } from '@/features/inventario/types';
import { useSaleInvoices } from '@/features/facturacion/hooks/useSaleInvoices';
import { SaleInvoiceAction } from '@/features/facturacion/components/SaleInvoiceAction';
import { InvoiceDialog } from '@/features/facturacion/components/InvoiceDialog';

type OpenInvoice = { sale: Sale; invoiceId: string | null } | null;

/** Factura electrónica en el historial de ventas: botón por venta y diálogo para emitirla o verla. */
export function useSaleInvoicing(company: Company, sales: Sale[], canInvoice: boolean) {
  const saleIds = useMemo(() => sales.map((s) => s.id), [sales]);
  const invoices = useSaleInvoices(company.id, saleIds, canInvoice);
  const [open, setOpen] = useState<OpenInvoice>(null);

  const actionFor = (sale: Sale) => (
    <SaleInvoiceAction
      invoice={invoices.bySale.get(sale.id)}
      canInvoiceSale={sale.status === 'completada' && !(sale.returnedAmount ?? 0) && sale.total > 0}
      canInvoice={invoices.canInvoice}
      onOpen={(invoiceId) => setOpen({ sale, invoiceId })}
    />
  );

  const dialog = (
    <AnimatePresence>
      {open && (
        <InvoiceDialog key={`${open.sale.id}-${open.invoiceId ?? 'nueva'}`} company={company} saleId={open.sale.id}
          saleNumber={open.sale.saleNumber} invoiceId={open.invoiceId} onClose={() => setOpen(null)}
          onChanged={() => void invoices.reload()} />
      )}
    </AnimatePresence>
  );

  return { actionFor, dialog };
}
