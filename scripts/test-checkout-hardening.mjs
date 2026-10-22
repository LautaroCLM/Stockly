import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';

// ==============================================================================
// 1. Simulación fidedigna de almacenamiento (localStorage) y Web Locks en Node.js
// ==============================================================================
const memoryStore = new Map();
let failureTargetKey = null; // Key en la que simularemos error de cuota/escritura
let failRollbackTargetKey = null; // Key en la que simularemos error durante el rollback
let hasFailedNormalWrite = false;

function resetFailureFlags() {
  failureTargetKey = null;
  failRollbackTargetKey = null;
  hasFailedNormalWrite = false;
}

const mockLocalStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => {
    if (!hasFailedNormalWrite && failureTargetKey && key === failureTargetKey) {
      hasFailedNormalWrite = true;
      throw new Error(`QuotaExceededError: simulated disk write failure on key ${key}`);
    }
    if (hasFailedNormalWrite && failRollbackTargetKey && key === failRollbackTargetKey) {
      throw new Error(`FatalRollbackError: simulated catastrophic disk failure during rollback on key ${key}`);
    }
    memoryStore.set(key, String(val));
  },
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

globalThis.localStorage = mockLocalStorage;

class MockLockManager {
  constructor() {
    this.queues = new Map();
  }

  request(name, callback) {
    const prevPromise = this.queues.get(name) || Promise.resolve();
    let release;
    const currentPromise = new Promise((resolve) => {
      release = resolve;
    });
    this.queues.set(name, currentPromise);

    return prevPromise
      .catch(() => {}) // Un error en la transacción previa no bloquea a la siguiente
      .then(async () => {
        try {
          return await callback();
        } finally {
          release();
        }
      });
  }
}

const mockLocks = new MockLockManager();
Object.defineProperty(globalThis, 'navigator', {
  value: { locks: mockLocks },
  configurable: true,
  writable: true,
});

// ==============================================================================
// 2. Compilación e importación dinámica del módulo REAL de producción
// ==============================================================================
console.log('Compilando e importando el módulo real src/features/inventario/api/checkoutTransaction.ts...');

const buildResult = await esbuild.build({
  entryPoints: ['src/features/inventario/api/checkoutTransaction.ts'],
  bundle: true,
  format: 'esm',
  write: false,
  alias: { '@': './src' },
});

const bundleText = buildResult.outputFiles[0].text;
const base64Module = Buffer.from(bundleText).toString('base64');
const realModule = await import(`data:text/javascript;base64,${base64Module}`);

const { executeSaleTransaction } = realModule;
assert.strictEqual(
  typeof executeSaleTransaction,
  'function',
  'executeSaleTransaction debe ser una función exportada del módulo real.'
);

console.log('✓ Módulo real importado exitosamente.\n');

// ==============================================================================
// 3. Claves de almacenamiento y helpers
// ==============================================================================
function getProductStorageKey(tenantId) {
  return `stockly_products_${tenantId}_v1`;
}

function getMovementStorageKey(tenantId) {
  return `stockly_movements_${tenantId}_v1`;
}

function getSalesStorageKey(tenantId) {
  return `stockly_sales_${tenantId}_v1`;
}

function loadProducts(tenantId) {
  const raw = mockLocalStorage.getItem(getProductStorageKey(tenantId));
  return raw ? JSON.parse(raw) : [];
}

function loadMovements(tenantId) {
  const raw = mockLocalStorage.getItem(getMovementStorageKey(tenantId));
  return raw ? JSON.parse(raw) : [];
}

function loadSales(tenantId) {
  const raw = mockLocalStorage.getItem(getSalesStorageKey(tenantId));
  return raw ? JSON.parse(raw) : [];
}

// ==============================================================================
// 4. SUITE DE PRUEBAS DE ENDURECIMIENTO Y CONCURRENCIA
// ==============================================================================
console.log('--- INICIANDO SUITE DE PRUEBAS AUTOMATIZADA: FASE 1.2 ---\n');

const TENANT_A = 'empresa-alfa';
const TENANT_B = 'empresa-beta';

// Inicialización de datos para Empresa Alfa
const initialProdAlfa = [
  { id: 'p1', sku: 'ALF-01', name: 'Martillo', stock: 10, minStock: 2, status: 'normal', isActive: true },
  { id: 'p2', sku: 'ALF-02', name: 'Taladro', stock: 5, minStock: 1, status: 'normal', isActive: true },
  { id: 'p3', sku: 'ALF-03', name: 'Amoladora Inactiva', stock: 4, minStock: 1, status: 'normal', isActive: false },
];
const initialSalesAlfa = [
  { id: 's1', tenantId: TENANT_A, saleNumber: 'V-0010', items: [], total: 1000, payments: [], status: 'completada' },
];

mockLocalStorage.setItem(getProductStorageKey(TENANT_A), JSON.stringify(initialProdAlfa));
mockLocalStorage.setItem(getMovementStorageKey(TENANT_A), JSON.stringify([]));
mockLocalStorage.setItem(getSalesStorageKey(TENANT_A), JSON.stringify(initialSalesAlfa));

// ------------------------------------------------------------------------------
// Test 1: Venta normal exitosa con el módulo real
// ------------------------------------------------------------------------------
console.log('Prueba 1: Venta normal exitosa con el módulo real...');
const cartSale1 = [
  { productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 2, unitPrice: 500, subtotal: 1000 },
];
const res1 = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: cartSale1,
  clientName: 'Juan Perez',
  cartSubtotal: 1000,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1000,
  payments: [{ id: 'pay1', method: 'efectivo', amount: 1000 }],
});

assert.strictEqual(res1.success, true);
assert.strictEqual(res1.sale.saleNumber, 'V-0011');
assert.strictEqual(res1.updatedProducts.find((p) => p.id === 'p1').stock, 8);
assert.strictEqual(res1.movements.length, 1);
assert.strictEqual(res1.movements[0].direction, 'decrease');
assert.strictEqual(res1.movements[0].reason, 'sale');

const storedProd1 = loadProducts(TENANT_A);
const storedMov1 = loadMovements(TENANT_A);
const storedSales1 = loadSales(TENANT_A);
assert.strictEqual(storedProd1.find((p) => p.id === 'p1').stock, 8);
assert.strictEqual(storedMov1.length, 1);
assert.strictEqual(storedSales1[0].saleNumber, 'V-0011');
console.log('✓ Prueba 1 superada: Venta confirmada por el módulo real, stock descontado a 8 y V-0011 persistida.\n');

// ------------------------------------------------------------------------------
// Test 2: Fallo simulado en Paso 1 (Escritura de productos)
// ------------------------------------------------------------------------------
console.log('Prueba 2: Fallo simulado en escritura de productos (Paso 1)...');
failureTargetKey = getProductStorageKey(TENANT_A);

const cartSaleFail1 = [
  { productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 3, unitPrice: 500, subtotal: 1500 },
];
const resFail1 = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: cartSaleFail1,
  clientName: 'Cliente Fallo 1',
  cartSubtotal: 1500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1500,
  payments: [{ id: 'pay2', method: 'efectivo', amount: 1500 }],
});

assert.strictEqual(resFail1.success, false);
assert.strictEqual(resFail1.isRollbackFailed, false);
assert.match(resFail1.error, /Error de almacenamiento/);
assert.strictEqual(loadProducts(TENANT_A).find((p) => p.id === 'p1').stock, 8);
assert.strictEqual(loadMovements(TENANT_A).length, 1);
assert.strictEqual(loadSales(TENANT_A).length, 2);
resetFailureFlags();
console.log('✓ Prueba 2 superada: Aborto limpio en paso 1 sin mutar existencias ni comprobantes.\n');

// ------------------------------------------------------------------------------
// Test 3: Fallo simulado en Paso 2 (Escritura de movimientos) -> Rollback de productos
// ------------------------------------------------------------------------------
console.log('Prueba 3: Fallo simulado en escritura de movimientos (Paso 2)...');
failureTargetKey = getMovementStorageKey(TENANT_A);

const resFail2 = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: cartSaleFail1,
  clientName: 'Cliente Fallo 2',
  cartSubtotal: 1500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1500,
  payments: [{ id: 'pay3', method: 'efectivo', amount: 1500 }],
});

assert.strictEqual(resFail2.success, false);
assert.strictEqual(resFail2.isRollbackFailed, false);
assert.match(resFail2.error, /revertidos automáticamente/);
// Verificar que el stock volvió a 8
assert.strictEqual(loadProducts(TENANT_A).find((p) => p.id === 'p1').stock, 8);
assert.strictEqual(loadMovements(TENANT_A).length, 1);
assert.strictEqual(loadSales(TENANT_A).length, 2);
resetFailureFlags();
console.log('✓ Prueba 3 superada: Tras fallar movimientos, productos fueron revertidos exactamente a 8.\n');

// ------------------------------------------------------------------------------
// Test 4: Fallo simulado en Paso 3 (Escritura de ventas) -> Rollback de productos y movimientos
// ------------------------------------------------------------------------------
console.log('Prueba 4: Fallo simulado en escritura de ventas (Paso 3)...');
failureTargetKey = getSalesStorageKey(TENANT_A);

const resFail3 = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: cartSaleFail1,
  clientName: 'Cliente Fallo 3',
  cartSubtotal: 1500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1500,
  payments: [{ id: 'pay4', method: 'efectivo', amount: 1500 }],
});

assert.strictEqual(resFail3.success, false);
assert.strictEqual(resFail3.isRollbackFailed, false);
assert.match(resFail3.error, /revertidos automáticamente/);
// Verificar que ni productos ni movimientos quedaron en estado parcial
assert.strictEqual(loadProducts(TENANT_A).find((p) => p.id === 'p1').stock, 8);
assert.strictEqual(loadMovements(TENANT_A).length, 1);
assert.strictEqual(loadSales(TENANT_A).length, 2);
resetFailureFlags();
console.log('✓ Prueba 4 superada: Tras fallar ventas, productos y movimientos volvieron fielmente a su estado previo.\n');

// ------------------------------------------------------------------------------
// Test 5: Reintento tras rollback exitoso sin doble descuento
// ------------------------------------------------------------------------------
console.log('Prueba 5: Reintento tras fallo previo sin doble descuento...');
const resRetry = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: cartSaleFail1, // Vendemos 3 martillos
  clientName: 'Cliente Reintento',
  cartSubtotal: 1500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1500,
  payments: [{ id: 'pay5', method: 'efectivo', amount: 1500 }],
});

assert.strictEqual(resRetry.success, true);
assert.strictEqual(resRetry.sale.saleNumber, 'V-0012');
assert.strictEqual(loadProducts(TENANT_A).find((p) => p.id === 'p1').stock, 5); // 8 - 3 = 5
assert.strictEqual(loadMovements(TENANT_A).length, 2);
assert.strictEqual(loadSales(TENANT_A).length, 3);
console.log('✓ Prueba 5 superada: El reintento descontó el stock exactamente una vez (de 8 a 5) y emitió V-0012.\n');

// ------------------------------------------------------------------------------
// Test 6: Restauración de claves que NO existían previamente (removeItem)
// ------------------------------------------------------------------------------
console.log('Prueba 6: Restauración de claves que no existían antes (removeItem vs null)...');
const TENANT_NEW = 'empresa-nueva';
// No inicializamos la clave de movimientos para TENANT_NEW en mockLocalStorage (es null)
mockLocalStorage.setItem(
  getProductStorageKey(TENANT_NEW),
  JSON.stringify([{ id: 'pn1', sku: 'NEW-01', name: 'Item', stock: 10, minStock: 1, status: 'normal', isActive: true }])
);
mockLocalStorage.setItem(getSalesStorageKey(TENANT_NEW), JSON.stringify([]));
assert.strictEqual(mockLocalStorage.getItem(getMovementStorageKey(TENANT_NEW)), null);

// Provocamos fallo en paso 3 (ventas)
failureTargetKey = getSalesStorageKey(TENANT_NEW);
const resNewTenant = await executeSaleTransaction({
  tenantId: TENANT_NEW,
  cartItems: [{ productId: 'pn1', sku: 'NEW-01', name: 'Item', quantity: 1, unitPrice: 100, subtotal: 100 }],
  clientName: 'Cliente Nuevo',
  cartSubtotal: 100,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 100,
  payments: [{ id: 'pnew', method: 'efectivo', amount: 100 }],
});
assert.strictEqual(resNewTenant.success, false);
// Verificar que la clave que era null fue eliminada con removeItem y no quedó como string "null"
assert.strictEqual(mockLocalStorage.getItem(getMovementStorageKey(TENANT_NEW)), null);
resetFailureFlags();
console.log('✓ Prueba 6 superada: Claves previamente inexistentes se restauran limpiamente sin guardar "null".\n');

// ------------------------------------------------------------------------------
// Test 7: Fallo durante el propio rollback -> Resultado crítico distinguible
// ------------------------------------------------------------------------------
console.log('Prueba 7: Simulación de fallo en el propio rollback...');
// Fallo en ventas (paso 3) Y fallo simultáneo en restaurar productos en el rollback
failureTargetKey = getSalesStorageKey(TENANT_A);
failRollbackTargetKey = getProductStorageKey(TENANT_A);

const resCatastrophic = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 1, unitPrice: 500, subtotal: 500 }],
  clientName: 'Cliente Catastrofe',
  cartSubtotal: 500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 500,
  payments: [{ id: 'pcat', method: 'efectivo', amount: 500 }],
});

assert.strictEqual(resCatastrophic.success, false);
assert.strictEqual(resCatastrophic.isRollbackFailed, true);
assert.match(resCatastrophic.error, /FALLO CRÍTICO DE ALMACENAMIENTO/);
assert.match(resCatastrophic.error, /NO reintente la operación a ciegas/);

resetFailureFlags();
console.log('✓ Prueba 7 superada: Fallo en el rollback devuelve error crítico distinguible (isRollbackFailed: true).\n');

// ------------------------------------------------------------------------------
// Test 8: Concurrencia entre pestañas para la misma empresa (Web Locks API real)
// ------------------------------------------------------------------------------
console.log('Prueba 8: Dos transacciones concurrentes en la misma empresa...');
// Restaurar productos de Empresa Alfa a 10 para una prueba limpia
mockLocalStorage.setItem(
  getProductStorageKey(TENANT_A),
  JSON.stringify([
    { id: 'p1', sku: 'ALF-01', name: 'Martillo', stock: 10, minStock: 2, status: 'normal', isActive: true },
    { id: 'p2', sku: 'ALF-02', name: 'Taladro', stock: 5, minStock: 1, status: 'normal', isActive: true },
  ])
);

// Lanzamos dos ventas simultáneamente (Pestaña A vende 2 martillos, Pestaña B vende 3 martillos)
const promiseTabA = executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 2, unitPrice: 500, subtotal: 1000 }],
  clientName: 'Pestaña A',
  cartSubtotal: 1000,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1000,
  payments: [{ id: 'pA', method: 'efectivo', amount: 1000 }],
});

const promiseTabB = executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 3, unitPrice: 500, subtotal: 1500 }],
  clientName: 'Pestaña B',
  cartSubtotal: 1500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 1500,
  payments: [{ id: 'pB', method: 'efectivo', amount: 1500 }],
});

const [resTabA, resTabB] = await Promise.all([promiseTabA, promiseTabB]);

assert.strictEqual(resTabA.success, true);
assert.strictEqual(resTabB.success, true);

// Comprobar que los números son consecutivos y distintos
assert.notStrictEqual(resTabA.sale.saleNumber, resTabB.sale.saleNumber);
const saleNumbers = [resTabA.sale.saleNumber, resTabB.sale.saleNumber].sort();
assert.strictEqual(saleNumbers[0], 'V-0013');
assert.strictEqual(saleNumbers[1], 'V-0014');

// Comprobar que el stock final es 10 - 2 - 3 = 5 (cero lost updates)
const finalProdAlfa = loadProducts(TENANT_A);
assert.strictEqual(finalProdAlfa.find((p) => p.id === 'p1').stock, 5);

// Comprobar que ambas ventas están persistidas
const finalSalesAlfa = loadSales(TENANT_A);
assert.ok(finalSalesAlfa.some((s) => s.clientName === 'Pestaña A'));
assert.ok(finalSalesAlfa.some((s) => s.clientName === 'Pestaña B'));

console.log('✓ Prueba 8 superada: Web Locks garantizó exclusión mutua; ambas ventas se ejecutaron consecutivamente sin pérdida de datos.\n');

// ------------------------------------------------------------------------------
// Test 9: Concurrencia entre empresas diferentes (Locks independientes)
// ------------------------------------------------------------------------------
console.log('Prueba 9: Operaciones concurrentes para empresas distintas...');
mockLocalStorage.setItem(
  getProductStorageKey(TENANT_B),
  JSON.stringify([
    { id: 'pb1', sku: 'BET-01', name: 'Pintura', stock: 50, minStock: 5, status: 'normal', isActive: true },
  ])
);
mockLocalStorage.setItem(getMovementStorageKey(TENANT_B), JSON.stringify([]));
mockLocalStorage.setItem(getSalesStorageKey(TENANT_B), JSON.stringify([]));

const [resConcAlfa, resConcBeta] = await Promise.all([
  executeSaleTransaction({
    tenantId: TENANT_A,
    cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 1, unitPrice: 500, subtotal: 500 }],
    clientName: 'Cliente Alfa Conc',
    cartSubtotal: 500,
    discountPercent: 0,
    discountAmount: 0,
    cartTotal: 500,
    payments: [{ id: 'p-alfa', method: 'efectivo', amount: 500 }],
  }),
  executeSaleTransaction({
    tenantId: TENANT_B,
    cartItems: [{ productId: 'pb1', sku: 'BET-01', name: 'Pintura', quantity: 5, unitPrice: 100, subtotal: 500 }],
    clientName: 'Cliente Beta Conc',
    cartSubtotal: 500,
    discountPercent: 0,
    discountAmount: 0,
    cartTotal: 500,
    payments: [{ id: 'p-beta', method: 'efectivo', amount: 500 }],
  }),
]);

assert.strictEqual(resConcAlfa.success, true);
assert.strictEqual(resConcBeta.success, true);
assert.strictEqual(resConcBeta.sale.saleNumber, 'V-0001');
assert.strictEqual(loadProducts(TENANT_B).find((p) => p.id === 'pb1').stock, 45);
assert.strictEqual(loadProducts(TENANT_A).find((p) => p.id === 'p1').stock, 4); // 5 - 1 = 4
console.log('✓ Prueba 9 superada: Las empresas Alfa y Beta operan en paralelo con locks independientes y aislados.\n');

// ------------------------------------------------------------------------------
// Test 10: Liberación de bloqueos ante excepción no controlada
// ------------------------------------------------------------------------------
console.log('Prueba 10: Liberación de locks ante excepción...');
failureTargetKey = getProductStorageKey(TENANT_A);
const failTx = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 1, unitPrice: 500, subtotal: 500 }],
  clientName: 'Error Tx',
  cartSubtotal: 500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 500,
  payments: [{ id: 'pfail', method: 'efectivo', amount: 500 }],
});
assert.strictEqual(failTx.success, false);
resetFailureFlags();

// La siguiente transacción debe poder adquirir el lock sin quedar bloqueada eternamente
const nextTx = await executeSaleTransaction({
  tenantId: TENANT_A,
  cartItems: [{ productId: 'p1', sku: 'ALF-01', name: 'Martillo', quantity: 1, unitPrice: 500, subtotal: 500 }],
  clientName: 'Post Error Tx',
  cartSubtotal: 500,
  discountPercent: 0,
  discountAmount: 0,
  cartTotal: 500,
  payments: [{ id: 'pok', method: 'efectivo', amount: 500 }],
});
assert.strictEqual(nextTx.success, true);
console.log('✓ Prueba 10 superada: El lock se liberó limpiamente tras un error previo permitiendo la siguiente venta.\n');

console.log('==============================================================================');
console.log('TODAS LAS 10 PRUEBAS AUTOMATIZADAS DE LA FASE 1.2 FUERON SUPERADAS CON ÉXITO.');
console.log('==============================================================================');
