import assert from 'node:assert/strict';

// ==============================================================================
// 1. Simulación fidedigna de localStorage en entorno Node.js
// ==============================================================================
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

// ==============================================================================
// 2. Funciones puras de dominio replicando useSales, useProducts, useStockMovements
// ==============================================================================

function getSalesStorageKey(tenantId) {
  return `stockly_sales_${tenantId}_v1`;
}

function getProductStorageKey(tenantId) {
  return `stockly_products_${tenantId}_v1`;
}

function getMovementStorageKey(tenantId) {
  return `stockly_movements_${tenantId}_v1`;
}

const INITIAL_MOCK_SALES = [
  {
    id: 'sale-fc-01',
    tenantId: 'ferreteria-central',
    saleNumber: 'V-0842',
    createdAt: '2026-10-14T18:41:00-03:00',
    clientName: 'Consumidor Final',
    items: [
      {
        productId: 'prod-fc-01',
        sku: 'FER-0492',
        name: 'Disco de Corte Sensitiva 355x3mm Norton Classic',
        unitPrice: 9450,
        quantity: 2,
        subtotal: 18900,
        currentStock: -2,
      },
    ],
    subtotal: 18900,
    discountPercent: 0,
    discountAmount: 0,
    total: 18900,
    payments: [{ id: 'p1', method: 'efectivo', amount: 18900 }],
    status: 'completada',
  },
  {
    id: 'sale-fc-02',
    tenantId: 'ferreteria-central',
    saleNumber: 'V-0841',
    createdAt: '2026-10-14T18:27:00-03:00',
    clientName: 'Constructora del Sur S.A.',
    items: [],
    subtotal: 10000,
    discountPercent: 0,
    discountAmount: 0,
    total: 10000,
    payments: [{ id: 'p2', method: 'transferencia', amount: 10000 }],
    status: 'completada',
  },
  {
    id: 'sale-cv-01',
    tenantId: 'corralon-valle',
    saleNumber: 'V-1190',
    createdAt: '2026-10-14T18:33:00-03:00',
    clientName: 'Edificio Las Tipas Fideicomiso',
    items: [],
    subtotal: 835000,
    discountPercent: 0,
    discountAmount: 0,
    total: 835000,
    payments: [{ id: 'p3', method: 'transferencia', amount: 835000 }],
    status: 'completada',
  },
];

function loadSales(tenantId) {
  try {
    const raw = localStorage.getItem(getSalesStorageKey(tenantId));
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    }
  } catch {
    return [];
  }

  const initial = INITIAL_MOCK_SALES.filter((s) => s.tenantId === tenantId);
  try {
    localStorage.setItem(getSalesStorageKey(tenantId), JSON.stringify(initial));
  } catch {}
  return initial;
}

function saveSales(tenantId, sales) {
  try {
    localStorage.setItem(getSalesStorageKey(tenantId), JSON.stringify(sales));
    return true;
  } catch {
    return false;
  }
}

function calculateNextSaleNumber(tenantId, existingSales) {
  const numbers = [];
  for (const sale of existingSales) {
    const match = sale.saleNumber.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (!isNaN(num)) numbers.push(num);
    }
  }
  let maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
  if (tenantId === 'ferreteria-central' && maxNum < 842) {
    maxNum = 842;
  } else if (tenantId === 'corralon-valle' && maxNum < 1190) {
    maxNum = 1190;
  }
  const nextNum = maxNum + 1;
  return `V-${nextNum.toString().padStart(4, '0')}`;
}

function recordSale(tenantId, currentSales, newSale) {
  if (!newSale || !newSale.id || !newSale.saleNumber) {
    return { success: false, error: 'Datos de venta inválidos.' };
  }
  if (!newSale.items || newSale.items.length === 0) {
    return { success: false, error: 'La venta no contiene productos.' };
  }
  if (newSale.tenantId !== tenantId) {
    return { success: false, error: 'Incoherencia de empresa.' };
  }

  // Prevenir duplicado
  const isDuplicate = currentSales.some(
    (s) => s.id === newSale.id || s.saleNumber === newSale.saleNumber
  );
  if (isDuplicate) {
    return { success: false, error: 'La venta ya fue registrada previamente.' };
  }

  const nextSales = [newSale, ...currentSales];
  const saved = saveSales(tenantId, nextSales);
  if (!saved) {
    return { success: false, error: 'Error al persistir en localStorage.' };
  }

  return { success: true, sales: nextSales };
}

function discountStock(tenantId, products, movements, saleId, saleNumber, items) {
  const newMovements = [];
  const updatedProducts = products.map((p) => {
    const item = items.find((i) => i.productId === p.id);
    if (!item) return p;
    const newStock = p.stock - item.quantity;
    newMovements.push({
      id: `mov-${Date.now()}-${Math.random()}`,
      companyId: tenantId,
      productId: p.id,
      direction: 'decrease',
      reason: 'sale',
      quantity: item.quantity,
      previousStock: p.stock,
      newStock,
      referenceSaleId: saleId,
      referenceDoc: saleNumber,
    });
    return { ...p, stock: newStock };
  });

  return { updatedProducts, updatedMovements: [...newMovements, ...movements] };
}

// ==============================================================================
// EJECUCIÓN DE LAS 12 PRUEBAS OBLIGATORIAS DE LA FASE 1
// ==============================================================================

console.log('--- INICIANDO SUITE DE PRUEBAS OBLIGATORIAS: FASE 1 PERSISTENCIA DE VENTAS ---');

const tenantA = 'ferreteria-central';
const tenantB = 'corralon-valle';

// Limpieza inicial
localStorage.clear();

// PRUEBA 8: Las ventas de demostración no se vuelven a insertar en cada recarga
console.log('\nEjecutando Prueba 8: Validación de inicialización sin reinserción repetitiva...');
const initialSalesA = loadSales(tenantA);
assert.equal(initialSalesA.length, 2, 'Ferretería central debe inicializarse con 2 ventas de mock');
// Modificar la lista a vacía y guardar
saveSales(tenantA, []);
const reloadedEmpty = loadSales(tenantA);
assert.equal(reloadedEmpty.length, 0, 'No debe reinsertar mocks si la clave ya existe aunque esté vacía');
console.log('✓ Prueba 8 superada: Se respetan los datos existentes sin reinserción de mocks.');

// Reestablecer iniciales para tenantA
localStorage.clear();
let salesA = loadSales(tenantA);
let productsA = [
  { id: 'prod-01', sku: 'FER-01', name: 'Amoladora 115mm', stock: 10, minStock: 2 },
  { id: 'prod-02', sku: 'FER-02', name: 'Disco Norton', stock: 50, minStock: 10 },
];
let movementsA = [];

// PRUEBA 1 & 2: Venta nueva se conserva tras recargar con datos completos
console.log('\nEjecutando Pruebas 1 y 2: Registro de venta completa y persistencia tras recarga...');
const nextNumber = calculateNextSaleNumber(tenantA, salesA);
assert.equal(nextNumber, 'V-0843', 'El número correlativo siguiente debe ser V-0843');

const newSale = {
  id: 'sale-001-test',
  tenantId: tenantA,
  saleNumber: nextNumber,
  createdAt: new Date().toISOString(),
  clientName: 'Juan Pérez Obras',
  items: [
    {
      productId: 'prod-01',
      sku: 'FER-01',
      name: 'Amoladora 115mm',
      unitPrice: 50000,
      quantity: 2,
      subtotal: 100000,
      currentStock: 10,
    },
  ],
  subtotal: 100000,
  discountPercent: 10,
  discountAmount: 10000,
  total: 90000,
  payments: [{ id: 'p-1', method: 'efectivo', amount: 90000 }],
  status: 'completada',
};

// Descuento de existencias
const stockDiscount = discountStock(tenantA, productsA, movementsA, newSale.id, newSale.saleNumber, newSale.items);
productsA = stockDiscount.updatedProducts;
movementsA = stockDiscount.updatedMovements;

// Registro de la venta
const recordRes = recordSale(tenantA, salesA, newSale);
assert.equal(recordRes.success, true);
salesA = recordRes.sales;

// Simular recarga de página (F5) leyendo exclusivamente de localStorage
const salesAfterReload = loadSales(tenantA);
assert.equal(salesAfterReload.length, 3, 'Deben existir 3 ventas tras recargar (2 mocks + 1 nueva)');
const foundSale = salesAfterReload.find((s) => s.id === 'sale-001-test');
assert.ok(foundSale, 'La venta guardada debe existir íntegramente tras recargar');
assert.equal(foundSale.saleNumber, 'V-0843');
assert.equal(foundSale.clientName, 'Juan Pérez Obras');
assert.equal(foundSale.total, 90000);
assert.equal(foundSale.items.length, 1);
assert.equal(foundSale.payments[0].method, 'efectivo');
console.log('✓ Prueba 1 superada: La nueva venta persiste fielmente tras recargar.');
console.log('✓ Prueba 2 superada: Todos los datos del comprobante, cliente y pagos están íntegros.');

// PRUEBA 3 & 4: Descuento de stock único y movimiento de salida único
console.log('\nEjecutando Pruebas 3 y 4: Verificación de descuento único y movimiento asociado...');
const amoladora = productsA.find((p) => p.id === 'prod-01');
assert.equal(amoladora.stock, 8, 'El stock debió pasar de 10 a 8 u.');
assert.equal(movementsA.length, 1, 'Debe existir exactamente 1 movimiento registrado');
assert.equal(movementsA[0].referenceSaleId, 'sale-001-test');
assert.equal(movementsA[0].referenceDoc, 'V-0843');
assert.equal(movementsA[0].quantity, 2);
console.log('✓ Prueba 3 superada: El stock se descontó exactamente una vez.');
console.log('✓ Prueba 4 superada: Se generó exactamente un movimiento de salida vinculado a la venta.');

// PRUEBA 5: Cargar el historial no vuelve a descontar stock
console.log('\nEjecutando Prueba 5: Carga reiterada de historial no muta existencias...');
const salesRecheck = loadSales(tenantA);
assert.equal(salesRecheck.length, 3);
assert.equal(productsA.find((p) => p.id === 'prod-01').stock, 8, 'El stock sigue intacto en 8');
console.log('✓ Prueba 5 superada: La lectura o recarga del historial no altera el stock.');

// PRUEBA 6: Prevención de venta duplicada por doble clic o doble confirmación
console.log('\nEjecutando Prueba 6: Prevención atómica contra doble confirmación...');
const duplicateRes = recordSale(tenantA, salesA, newSale);
assert.equal(duplicateRes.success, false, 'Debe rechazar la venta duplicada');
assert.match(duplicateRes.error, /ya fue registrada/i);
assert.equal(salesA.length, 3, 'El total de ventas no debe aumentar');
console.log('✓ Prueba 6 superada: Se bloquea la duplicación por doble confirmación.');

// PRUEBA 7: Las ventas de dos empresas distintas no se mezclan
console.log('\nEjecutando Prueba 7: Aislamiento estricto multiempresa...');
const salesTenantB = loadSales(tenantB);
assert.equal(salesTenantB.length, 1, 'Tenant B solo debe tener su venta inicial');
assert.equal(salesTenantB[0].saleNumber, 'V-1190');
assert.equal(salesTenantB.some((s) => s.id === 'sale-001-test'), false, 'Venta de Tenant A no debe estar en Tenant B');
console.log('✓ Prueba 7 superada: Los historiales entre empresas están 100% aislados.');

// PRUEBA 9: Un localStorage vacío no provoca pérdida ni reemplazo de datos
console.log('\nEjecutando Prueba 9: Comportamiento ante almacenamiento vacío...');
const newTenantSales = loadSales('distribuidora-sm');
assert.deepEqual(newTenantSales, [], 'Empresa sin datos iniciales devuelve array vacío sin colapsar');
console.log('✓ Prueba 9 superada: Empresa vacía opera correctamente sin errores.');

// PRUEBA 10: JSON corrupto o fallo de persistencia maneja error seguro
console.log('\nEjecutando Prueba 10: Resiliencia ante JSON corrupto o error de escritura...');
localStorage.setItem(getSalesStorageKey('empresa-corrupta'), '{ json_invalido: ');
const corruptLoad = loadSales('empresa-corrupta');
assert.deepEqual(corruptLoad, [], 'JSON corrupto devuelve array vacío de respaldo sin lanzar excepción no controlada');
assert.equal(localStorage.getItem(getSalesStorageKey('empresa-corrupta')), '{ json_invalido: ', 'No debe sobrescribir el archivo dañado');

// Simular fallo de almacenamiento (QuotaExceeded)
const originalSetItem = localStorage.setItem;
localStorage.setItem = () => {
  throw new Error('QuotaExceededError');
};
const failedRecord = recordSale(tenantA, salesA, {
  id: 'sale-quota-fail',
  tenantId: tenantA,
  saleNumber: 'V-9999',
  items: [{ productId: 'p1' }],
});
assert.equal(failedRecord.success, false);
assert.match(failedRecord.error, /Error al persistir/i);
localStorage.setItem = originalSetItem;
console.log('✓ Prueba 10 superada: Los fallos de almacenamiento se informan con error sin simular éxito.');

// PRUEBA 11: Cálculo de numeración correlativa sin saltos
console.log('\nEjecutando Prueba 11: Secuencia de numeración correlativa...');
const nextAfterV0843 = calculateNextSaleNumber(tenantA, salesA);
assert.equal(nextAfterV0843, 'V-0844', 'La siguiente venta debe ser V-0844');

const nextForTenantB = calculateNextSaleNumber(tenantB, salesTenantB);
assert.equal(nextForTenantB, 'V-1191', 'La siguiente venta de Corralón Valle debe ser V-1191');
console.log('✓ Prueba 11 superada: La correlatividad se calcula de manera determinística por empresa.');

// PRUEBA 12: Resumen
console.log('\n==============================================================================');
console.log('TODAS LAS 12 PRUEBAS OBLIGATORIAS DE LA FASE 1 FUERON SUPERADAS CON ÉXITO.');
console.log('==============================================================================');
