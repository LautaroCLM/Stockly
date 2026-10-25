import { useState, useEffect, useCallback, useRef } from 'react';
import { TenantId } from '@/types';
import { Sale, CartItem, PaymentEntry } from '../types';
import { fetchSales, SaleRow } from '../api/salesApi';

function mapRowToSale(row: SaleRow, tenantId: TenantId): Sale {
  const items: CartItem[] = (row.sale_items || []).map((si) => ({
    productId: si.product_id,
    sku: si.product?.sku || '',
    name: si.product?.name || 'Producto',
    unitPrice: Number(si.unit_price),
    quantity: Number(si.quantity),
    subtotal: Number(si.subtotal),
    currentStock: 0,
  }));

  const payments: PaymentEntry[] = (row.payments || []).map((p, idx) => ({
    id: `payment-${idx}`,
    method: p.method as PaymentEntry['method'],
    amount: Number(p.amount),
  }));

  let clientName = 'Consumidor Final';
  let customerDoc: string | null = null;
  if (row.customer && row.customer.name) {
    clientName = row.customer.name;
    if (row.customer.tax_id) {
      customerDoc = `${row.customer.identification_type} ${row.customer.tax_id}`;
    }
  } else if (row.notes && row.notes.startsWith('Cliente: ')) {
    clientName = row.notes.replace('Cliente: ', '');
  }

  return {
    id: row.id,
    tenantId,
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
    payments,
    status: 'completada',
  };
}

export function useSales(tenantId: TenantId) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const currentCompanyIdRef = useRef<string>(tenantId);
  currentCompanyIdRef.current = tenantId;

  const loadSales = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) {
        setSales([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const rows = await fetchSales(targetCompanyId);
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setSales(rows.map((r) => mapRowToSale(r, targetCompanyId)));
          setError(null);
        }
      } catch (err) {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          const message =
            err instanceof Error ? err.message : 'Error al cargar ventas desde el servidor.';
          setError(message);
          console.warn(`Error al cargar ventas para ${targetCompanyId}:`, err);
        }
      } finally {
        if (isMountedRef.current && currentCompanyIdRef.current === targetCompanyId) {
          setIsLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    loadSales(tenantId);
    return () => {
      isMountedRef.current = false;
    };
  }, [tenantId, loadSales]);

  const reloadSales = useCallback(async () => {
    await loadSales(tenantId);
  }, [tenantId, loadSales]);

  const getNextSaleNumber = useCallback((): string => {
    return 'Correlativo asignado por el servidor';
  }, []);

  const syncSaleFromTransaction = useCallback((newSale: Sale) => {
    setSales((prev) => [newSale, ...prev.filter((s) => s.id !== newSale.id)]);
  }, []);

  return {
    sales,
    isLoading,
    error,
    reloadSales,
    getNextSaleNumber,
    syncSaleFromTransaction,
  };
}
