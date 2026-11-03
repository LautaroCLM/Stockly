import { supabase } from '@/lib/supabase';
import type { Json } from '@/types/database';
import type { CartItem, PaymentEntry, Sale } from '@/features/inventario/types';
import { buildSearchOrFilter } from '@/lib/postgrestSearch';

export const SALES_PAGE_SIZE = 50;

export interface SalesFilters {
  /** Número de venta o nota (se busca en el servidor). */
  search: string;
  /** Clientes cuyo nombre o documento coinciden con la búsqueda (resueltos contra el catálogo). */
  matchingCustomerIds: string[];
}

export interface SalesPage {
  rows: Sale[];
  total: number;
}

const SALE_COLUMNS = `
  id, company_id, sale_number, customer_id, status, subtotal, discount, total_amount,
  payments, notes, created_at, cancelled_at, cancel_reason,
  customer:customers ( name, identification_type, tax_id ),
  sale_items ( product_id, quantity, unit_price, subtotal, product:products ( name, sku ) )
`;

function parsePayments(payments: Json): PaymentEntry[] {
  if (!Array.isArray(payments)) return [];
  return payments.flatMap((payment, index) => {
    if (!payment || typeof payment !== 'object' || Array.isArray(payment)) return [];
    return [
      {
        id: `payment-${index}`,
        method: String(payment.method ?? '') as PaymentEntry['method'],
        amount: Number(payment.amount ?? 0),
      },
    ];
  });
}

/**
 * Página de ventas de la empresa, de la más reciente a la más antigua, con el total que
 * coincide con la búsqueda. La búsqueda se aplica en el servidor.
 */
export async function fetchSalesPage(
  companyId: string,
  filters: SalesFilters,
  offset: number,
  limit: number = SALES_PAGE_SIZE
): Promise<SalesPage> {
  let query = supabase
    .from('sales')
    .select(SALE_COLUMNS, { count: 'exact' })
    .eq('company_id', companyId);

  const search = buildSearchOrFilter(filters.search, ['sale_number', 'notes'], {
    column: 'customer_id',
    ids: filters.matchingCustomerIds,
  });
  if (search) query = query.or(search);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(error.message || 'Error al cargar ventas desde el servidor.');
  }

  const rows = data ?? [];
  return {
    total: count ?? rows.length,
    rows: rows.map((row) => {
      const items: CartItem[] = row.sale_items.map((item) => ({
        productId: item.product_id,
        sku: item.product?.sku ?? '',
        name: item.product?.name ?? 'Producto',
        unitPrice: Number(item.unit_price),
        quantity: Number(item.quantity),
        subtotal: Number(item.subtotal),
        currentStock: 0,
      }));

      // Ventas sin cliente asociado guardan el nombre ingresado en la nota "Cliente: ..."
      let clientName = 'Consumidor Final';
      let customerDoc: string | null = null;
      if (row.customer?.name) {
        clientName = row.customer.name;
        if (row.customer.tax_id) {
          customerDoc = `${row.customer.identification_type} ${row.customer.tax_id}`;
        }
      } else if (row.notes?.startsWith('Cliente: ')) {
        clientName = row.notes.replace('Cliente: ', '');
      }

      return {
        id: row.id,
        tenantId: row.company_id,
        saleNumber: row.sale_number,
        createdAt: row.created_at,
        clientName,
        customerId: row.customer_id,
        customerDoc,
        items,
        subtotal: Number(row.subtotal),
        discountPercent: 0,
        discountAmount: Number(row.discount),
        total: Number(row.total_amount),
        payments: parsePayments(row.payments),
        status: row.status === 'cancelled' ? ('anulada' as const) : ('completada' as const),
        cancelledAt: row.cancelled_at,
        cancelReason: row.cancel_reason,
      };
    }),
  };
}
