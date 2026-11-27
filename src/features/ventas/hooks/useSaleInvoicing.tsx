import { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { Company } from '@/types';
import type { Sale } from '@/features/inventario/types';
import { useSaleInvoices } from '@/features/facturacion/hooks/useSaleInvoices';
import { SaleInvoiceAction } from '@/features/facturacion/components/SaleInvoiceAction';
import { InvoiceDialog } from '@/features/facturacion/components/InvoiceDialog';
import { prepareCreditNoteRpc, prepareInvoiceRpc } from '@/features/facturacion/api/invoicesApi';
import type { CreditNoteNeed } from '@/features/facturacion/invoiceTypes';

/** Qué comprobante está abierto: el existente (invoiceId) o el que hay que preparar. */
type OpenDocument =
  | { kind: 'invoice'; sale: Sale; invoiceId: string | null }
  | { kind: 'credit_note'; sale: Sale; invoiceId: string | null; need: CreditNoteNeed | null }
  | null;

/** Factura electrónica en el historial de ventas: botones por venta y diálogo para emitir o ver comprobantes. */
export function useSaleInvoicing(company: Company, sales: Sale[], canInvoice: boolean) {
  const saleIds = useMemo(() => sales.map((s) => s.id), [sales]);
  const refreshKey = useMemo(() => sales.map((s) => `${s.status}:${s.returnedAmount ?? 0}`).join(','), [sales]);
  const invoices = useSaleInvoices(company.id, saleIds, canInvoice, refreshKey);
  const [open, setOpen] = useState<OpenDocument>(null);

  const actionFor = (sale: Sale) => (
    <SaleInvoiceAction
      state={invoices.bySale.get(sale.id)}
      canInvoiceSale={sale.status === 'completada' && !(sale.returnedAmount ?? 0) && sale.total > 0}
      canInvoice={invoices.canInvoice}
      onOpenInvoice={(invoiceId) => setOpen({ kind: 'invoice', sale, invoiceId })}
      onOpenCreditNote={(invoiceId, need) => setOpen({ kind: 'credit_note', sale, invoiceId, need })}
    />
  );

  const prepare = () => {
    if (!open) return Promise.resolve({ ok: false as const, message: 'Nada para preparar.' });
    return open.kind === 'invoice'
      ? prepareInvoiceRpc(company.id, open.sale.id)
      : prepareCreditNoteRpc(company.id, open.sale.id, open.need?.saleReturnId ?? null);
  };
  const key = open ? `${open.kind}-${open.sale.id}-${open.invoiceId ?? (open.kind === 'credit_note' ? open.need?.saleReturnId : null) ?? 'nuevo'}` : '';

  const dialog = (
    <AnimatePresence>
      {open && (
        <InvoiceDialog key={key} company={company} saleNumber={open.sale.saleNumber} invoiceId={open.invoiceId}
          prepare={prepare} onClose={() => setOpen(null)} onChanged={() => void invoices.reload()} />
      )}
    </AnimatePresence>
  );

  return { actionFor, dialog };
}
