import { TenantId } from '@/types';
import { Product, StockMovement, Sale, CartItem, PaymentEntry, StockStatus } from '../types';
import { getProductStorageKey, loadProductsFromStorage, computeStatus } from '../hooks/useProducts';
import { getMovementStorageKey, loadMovementsFromStorage } from '../hooks/useStockMovements';
import { getSalesStorageKey, loadSalesFromStorage, calculateNextSaleNumber } from '../hooks/useSales';

export interface ExecuteSaleParams {
  tenantId: TenantId;
  clientName: string;
  payments: PaymentEntry[];
  cartItems: CartItem[];
  cartSubtotal: number;
  discountPercent: number;
  discountAmount: number;
  cartTotal: number;
}

export interface CheckoutTransactionResult {
  success: boolean;
  error?: string;
  isRollbackFailed?: boolean;
  sale?: Sale;
  movements?: StockMovement[];
  updatedProducts?: Product[];
}

/**
 * Ejecuta la transacción local coordinada de venta, descuento de existencias y registro de movimientos.
 * Aplica exclusión mutua inter-pestañas mediante Web Locks API (navigator.locks) por tenantId,
 * y snapshot con rollback compensatorio inmediato ante cualquier excepción de almacenamiento.
 */
export async function executeSaleTransaction(
  params: ExecuteSaleParams
): Promise<CheckoutTransactionResult> {
  const { tenantId } = params;
  const lockName = `stockly_sale_tx_${tenantId}`;

  // Si el entorno soporta Web Locks API (navegadores modernos), garantizamos exclusión mutua inter-pestañas
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    return await navigator.locks.request(lockName, async () => {
      return runTransactionInternal(params);
    });
  }

  // Fallback seguro si Web Locks no está disponible (ej. entornos sin API o HTTP inseguro)
  return runTransactionInternal(params);
}

function runTransactionInternal(params: ExecuteSaleParams): CheckoutTransactionResult {
  const {
    tenantId,
    clientName,
    payments,
    cartItems,
    cartSubtotal,
    discountPercent,
    discountAmount,
    cartTotal,
  } = params;

  if (!cartItems || cartItems.length === 0) {
    return { success: false, error: 'El carrito no contiene productos.' };
  }

  // 1. Claves de almacenamiento
  const prodKey = getProductStorageKey(tenantId);
  const movKey = getMovementStorageKey(tenantId);
  const salesKey = getSalesStorageKey(tenantId);

  // 2. Snapshot preventivo de los valores RAW en localStorage antes de tocar nada
  const rawPrevProd = localStorage.getItem(prodKey);
  const rawPrevMov = localStorage.getItem(movKey);
  const rawPrevSales = localStorage.getItem(salesKey);

  // 3. Lectura del estado MÁS RECIENTE desde el disco (evita desincronización entre pestañas)
  const freshProducts = loadProductsFromStorage(tenantId);
  const freshMovements = loadMovementsFromStorage(tenantId);
  const freshSales = loadSalesFromStorage(tenantId);

  // 4. Validación de negocio contra el estado fresco de productos
  for (const item of cartItems) {
    const prod = freshProducts.find((p) => p.id === item.productId);
    if (!prod) {
      return { success: false, error: `El producto con SKU ${item.sku} ya no existe en el catálogo.` };
    }
    if (prod.isActive === false) {
      return {
        success: false,
        error: `El producto "${prod.name}" (${prod.sku}) se encuentra desactivado y no puede ser vendido.`,
      };
    }
    if (item.quantity <= 0) {
      return { success: false, error: `Cantidad no válida para el producto ${item.sku}.` };
    }
  }

  // 5. Cálculo determinístico del próximo comprobante e identificador de venta
  const saleNumber = calculateNextSaleNumber(tenantId, freshSales);
  const saleId = `sale-${tenantId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  // Verificar que no colisione con ventas existentes
  if (freshSales.some((s) => s.id === saleId || s.saleNumber === saleNumber)) {
    return {
      success: false,
      error: `Conflicto de numeración: el comprobante ${saleNumber} ya fue emitido. Por favor reintente.`,
    };
  }

  // 6. Preparación de nuevos movimientos y existencias descontadas
  const timestamp = new Date().toISOString();
  const newMovements: StockMovement[] = [];
  const productUpdatesMap = new Map<string, { newStock: number; status: StockStatus }>();

  for (const item of cartItems) {
    const prod = freshProducts.find((p) => p.id === item.productId)!;
    const previousStock = productUpdatesMap.has(prod.id)
      ? productUpdatesMap.get(prod.id)!.newStock
      : prod.stock;
    const newStock = previousStock - item.quantity;
    const status = computeStatus(newStock, prod.minStock);

    productUpdatesMap.set(prod.id, { newStock, status });

    newMovements.push({
      id: `mov-${tenantId.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      companyId: tenantId,
      productId: prod.id,
      productName: prod.name,
      productSku: prod.sku,
      direction: 'decrease',
      reason: 'sale',
      quantity: item.quantity,
      previousStock,
      newStock,
      referenceSaleId: saleId,
      referenceDoc: saleNumber,
      notes: `Descuento automático por venta en mostrador #${saleNumber}`,
      createdBy: 'Lautaro C. (Master Admin)',
      createdAt: timestamp,
    });
  }

  const updatedProducts = freshProducts.map((p) => {
    const update = productUpdatesMap.get(p.id);
    if (update) {
      return { ...p, stock: update.newStock, status: update.status };
    }
    return p;
  });

  const updatedMovements = [...newMovements, ...freshMovements];

  const newSale: Sale = {
    id: saleId,
    tenantId,
    saleNumber,
    createdAt: timestamp,
    clientName: clientName.trim() || 'Consumidor Final',
    items: [...cartItems],
    subtotal: cartSubtotal,
    discountPercent,
    discountAmount,
    total: cartTotal,
    payments,
    status: 'completada',
  };

  const updatedSales = [newSale, ...freshSales];

  // 7. Preparación de payloads serializados
  const jsonProd = JSON.stringify(updatedProducts);
  const jsonMov = JSON.stringify(updatedMovements);
  const jsonSales = JSON.stringify(updatedSales);

  // 8. Ejecución coordinada con Rollback defensivo ante excepciones
  let step = 0;
  try {
    localStorage.setItem(prodKey, jsonProd);
    step = 1;
    localStorage.setItem(movKey, jsonMov);
    step = 2;
    localStorage.setItem(salesKey, jsonSales);
    step = 3;
  } catch (storageError) {
    // ROLLBACK COMPENSATORIO INMEDIATO
    let rollbackFailed = false;
    try {
      if (step >= 1) {
        if (rawPrevProd !== null) localStorage.setItem(prodKey, rawPrevProd);
        else localStorage.removeItem(prodKey);
      }
      if (step >= 2) {
        if (rawPrevMov !== null) localStorage.setItem(movKey, rawPrevMov);
        else localStorage.removeItem(movKey);
      }
      if (step >= 3) {
        if (rawPrevSales !== null) localStorage.setItem(salesKey, rawPrevSales);
        else localStorage.removeItem(salesKey);
      }
    } catch (rollbackErr) {
      rollbackFailed = true;
      console.error('Error crítico durante el rollback de almacenamiento:', rollbackErr);
    }

    if (rollbackFailed) {
      return {
        success: false,
        isRollbackFailed: true,
        error:
          'FALLO CRÍTICO DE ALMACENAMIENTO: Ocurrió un error al guardar la venta y la reversión automática de datos no pudo completarse. El inventario local puede haber quedado en un estado inconsistente. NO reintente la operación a ciegas; revise las existencias y movimientos antes de continuar.',
      };
    }

    return {
      success: false,
      isRollbackFailed: false,
      error:
        'Error de almacenamiento al procesar la venta. Todos los cambios de stock y movimientos fueron revertidos automáticamente para proteger sus existencias.',
    };
  }

  return {
    success: true,
    sale: newSale,
    movements: newMovements,
    updatedProducts,
  };
}
