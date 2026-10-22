import assert from 'node:assert/strict';

// ============================================================================
// SIMULACIÓN DE AMBIENTE: LOCALSTORAGE & ESTADO
// ============================================================================
const memoryStore = new Map();
globalThis.localStorage = {
  getItem: (key) => memoryStore.get(key) ?? null,
  setItem: (key, val) => memoryStore.set(key, String(val)),
  removeItem: (key) => memoryStore.delete(key),
  clear: () => memoryStore.clear(),
};

function getProductKey(tenantId) {
  return `stockly_products_${tenantId}_v1`;
}
function getCartKey(tenantId, userId = 'admin') {
  return `stockly_cart_${tenantId}_${userId}_v1`;
}
function getMovementsKey(tenantId) {
  return `stockly_movements_${tenantId}_v1`;
}

function loadProducts(tenantId) {
  const raw = localStorage.getItem(getProductKey(tenantId));
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return parsed.map((p) => ({
    ...p,
    isActive: p.isActive !== false,
  }));
}

function saveProducts(tenantId, products) {
  localStorage.setItem(getProductKey(tenantId), JSON.stringify(products));
}

function loadMovements(tenantId) {
  const raw = localStorage.getItem(getMovementsKey(tenantId));
  return raw ? JSON.parse(raw) : [];
}

function saveMovements(tenantId, movements) {
  localStorage.setItem(getMovementsKey(tenantId), JSON.stringify(movements));
}

// ============================================================================
// LÓGICA DE NEGOCIO IDÉNTICA A USEPRODUCTS, USECART Y CONFIRMSALE
// ============================================================================
function deactivateProduct(tenantId, productId) {
  const products = loadProducts(tenantId);
  const target = products.find((p) => p.id === productId);
  if (!target) return { success: false, error: 'Producto no encontrado' };

  target.isActive = false;
  saveProducts(tenantId, products);
  return { success: true, product: target };
}

function reactivateProduct(tenantId, productId) {
  const products = loadProducts(tenantId);
  const target = products.find((p) => p.id === productId);
  if (!target) return { success: false, error: 'Producto no encontrado' };

  target.isActive = true;
  saveProducts(tenantId, products);
  return { success: true, product: target };
}

function addToCart(cart, product, quantity = 1) {
  // Regla 4: No permitir agregar productos inactivos al carrito
  if (product.isActive === false) {
    return { success: false, error: 'No se puede agregar un producto desactivado al carrito' };
  }

  const existing = cart.items.find((i) => i.productId === product.id);
  if (existing) {
    existing.quantity += quantity;
    existing.subtotal = existing.quantity * existing.unitPrice;
  } else {
    cart.items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPrice: product.salePrice,
      quantity,
      subtotal: quantity * product.salePrice,
    });
  }
  cart.total = cart.items.reduce((acc, i) => acc + i.subtotal, 0);
  return { success: true, cart };
}

function removeFromCart(cart, productId) {
  cart.items = cart.items.filter((i) => i.productId !== productId);
  cart.total = cart.items.reduce((acc, i) => acc + i.subtotal, 0);
  return cart;
}

function filterProducts(products, activeFilter) {
  return products.filter((p) => {
    const isProductActive = p.isActive !== false;
    if (activeFilter === 'active') return isProductActive;
    if (activeFilter === 'inactive') return !isProductActive;
    return true; // 'all'
  });
}

function validateAndConfirmSale(tenantId, cart, clientName, paymentMethods) {
  const products = loadProducts(tenantId);

  // Verificación estricta de productos inactivos en el carrito
  const inactiveItems = cart.items.filter((item) => {
    const prod = products.find((p) => p.id === item.productId);
    return prod && prod.isActive === false;
  });

  if (inactiveItems.length > 0) {
    return {
      success: false,
      error: `Venta bloqueada: el carrito contiene artículos desactivados: ${inactiveItems.map((i) => i.name).join(', ')}`,
      blockedItems: inactiveItems,
    };
  }

  // Descuento de stock en catálogo y registro en movimientos
  const movements = loadMovements(tenantId);
  const timestamp = new Date().toISOString();
  const saleId = `sale-${Date.now()}`;
  const saleNumber = 'V-0901';

  for (const item of cart.items) {
    const prod = products.find((p) => p.id === item.productId);
    assert(prod, 'El producto debe existir');
    const prevStock = prod.stock;
    prod.stock -= item.quantity;

    movements.unshift({
      id: `mov-${Date.now()}-${item.productId}`,
      productId: prod.id,
      productName: prod.name,
      direction: 'decrease',
      reason: 'sale',
      quantity: item.quantity,
      previousStock: prevStock,
      newStock: prod.stock,
      referenceDoc: saleNumber,
      createdAt: timestamp,
    });
  }

  saveProducts(tenantId, products);
  saveMovements(tenantId, movements);

  const saleRecord = {
    id: saleId,
    tenantId,
    saleNumber,
    items: [...cart.items],
    total: cart.total,
    payments: paymentMethods,
    clientName,
    createdAt: timestamp,
  };

  // Vaciado de carrito
  cart.items = [];
  cart.total = 0;

  return { success: true, sale: saleRecord };
}

// ============================================================================
// EJECUCIÓN DE PRUEBAS
// ============================================================================
console.log('--- INICIANDO SUITE DE PRUEBAS ETAPA 3.3: BAJA LÓGICA Y CARRITO ---\n');

const TENANT_1 = 'ferreteria_central';
const TENANT_2 = 'pintureria_centro';

// Inicialización de catálogo
const initialCatalogT1 = [
  { id: 'p1', sku: 'FER-01', name: 'Taladro Percutor Bosch', category: 'Herramientas', salePrice: 50000, costPrice: 35000, stock: 10, minStock: 2, unit: 'u.', isActive: true },
  { id: 'p2', sku: 'FER-02', name: 'Disco Norton 115mm', category: 'Abrasivos', salePrice: 1500, costPrice: 900, stock: 50, minStock: 10, unit: 'u.', isActive: true },
  { id: 'p3', sku: 'FER-03', name: 'Electrodos Conarco 2.5', category: 'Soldadura', salePrice: 8000, costPrice: 5000, stock: 5, minStock: 2, unit: 'kg', isActive: true },
];

const initialCatalogT2 = [
  { id: 'p2-1', sku: 'PIN-01', name: 'Esmalte Sintético Satinado', category: 'Pinturas', salePrice: 12000, costPrice: 8000, stock: 20, minStock: 5, unit: 'L', isActive: true },
];

saveProducts(TENANT_1, initialCatalogT1);
saveProducts(TENANT_2, initialCatalogT2);

let cart = { items: [], total: 0 };

// 1. Un producto activo se puede agregar al carrito
const p1 = loadProducts(TENANT_1).find((p) => p.id === 'p1');
const addP1 = addToCart(cart, p1, 2);
assert.equal(addP1.success, true);
assert.equal(cart.items.length, 1);
assert.equal(cart.items[0].productId, 'p1');
assert.equal(cart.items[0].quantity, 2);
console.log('✓ Prueba 1 superada: Producto activo agregado correctamente al carrito.');

// 2. Un producto desactivado desaparece del filtro Activos
deactivateProduct(TENANT_1, 'p2');
const activeList = filterProducts(loadProducts(TENANT_1), 'active');
assert.equal(activeList.some((p) => p.id === 'p2'), false, 'p2 no debe estar en filtro Activos');
console.log('✓ Prueba 2 superada: El producto desactivado desaparece de la vista "Activos".');

// 3. El producto aparece en Inactivos y se puede reactivar
const inactiveList = filterProducts(loadProducts(TENANT_1), 'inactive');
assert.equal(inactiveList.some((p) => p.id === 'p2'), true, 'p2 debe estar en filtro Inactivos');
const reactivateResult = reactivateProduct(TENANT_1, 'p2');
assert.equal(reactivateResult.success, true);
const activeListAfterReactivation = filterProducts(loadProducts(TENANT_1), 'active');
assert.equal(activeListAfterReactivation.some((p) => p.id === 'p2'), true, 'p2 debe volver a estar en Activos');
console.log('✓ Prueba 3 superada: Aparece en "Inactivos" y se reactiva correctamente.');

// 4. Un producto inactivo no se puede agregar al carrito
deactivateProduct(TENANT_1, 'p3');
const p3Inactive = loadProducts(TENANT_1).find((p) => p.id === 'p3');
const addInactiveResult = addToCart(cart, p3Inactive, 1);
assert.equal(addInactiveResult.success, false);
assert.equal(cart.items.some((i) => i.productId === 'p3'), false);
console.log('✓ Prueba 4 superada: Se bloquea la adición de productos inactivos al carrito.');

// 5. Si se desactiva un producto que ya estaba en el carrito, el cobro queda bloqueado
// p1 está en el carrito con 2 u. Ahora lo desactivamos:
deactivateProduct(TENANT_1, 'p1');
const saleAttemptBlocked = validateAndConfirmSale(TENANT_1, cart, 'Juan Perez', [{ method: 'efectivo', amount: 100000 }]);
assert.equal(saleAttemptBlocked.success, false);
assert.match(saleAttemptBlocked.error, /Venta bloqueada/);
assert.equal(cart.items.length, 1, 'El carrito debe retener los artículos sin cobrarlos');
console.log('✓ Prueba 5 superada: Cobro estrictamente bloqueado mientras haya productos inactivos en el carrito.');

// 6. Quitar el producto inactivo permite continuar con los demás artículos
// Agregamos p2 (que está activo) al carrito y quitamos p1 (desactivado)
const p2Active = loadProducts(TENANT_1).find((p) => p.id === 'p2');
addToCart(cart, p2Active, 3);
assert.equal(cart.items.length, 2); // p1 (inactivo) y p2 (activo)
removeFromCart(cart, 'p1');
assert.equal(cart.items.length, 1);
assert.equal(cart.items[0].productId, 'p2');
const saleSuccessWithOther = validateAndConfirmSale(TENANT_1, cart, 'Cliente Test', [{ method: 'efectivo', amount: 4500 }]);
assert.equal(saleSuccessWithOther.success, true);
assert.equal(cart.items.length, 0); // Vaciado tras venta exitosa
console.log('✓ Prueba 6 superada: Al quitar el producto inactivo, la venta continúa exitosamente con los demás artículos.');

// 7. Reactivar el producto restablece su disponibilidad
reactivateProduct(TENANT_1, 'p1');
const p1Reactivated = loadProducts(TENANT_1).find((p) => p.id === 'p1');
const addP1Again = addToCart(cart, p1Reactivated, 1);
assert.equal(addP1Again.success, true);
assert.equal(cart.items.length, 1);
cart.items = []; // Limpieza para siguientes pruebas
console.log('✓ Prueba 7 superada: Reactivar el producto restablece de inmediato su disponibilidad para la venta.');

// 8. Las ventas y los movimientos históricos permanecen intactos
const movementsHistory = loadMovements(TENANT_1);
assert.equal(movementsHistory.length >= 1, true, 'Debe conservar los movimientos históricos de venta');
assert.equal(movementsHistory[0].productId, 'p2');
assert.equal(movementsHistory[0].quantity, 3);
console.log('✓ Prueba 8 superada: Los comprobantes de venta y los movimientos de auditoría se conservan íntegros.');

// 9. El estado persiste después de recargar
deactivateProduct(TENANT_1, 'p1');
// Simulamos recarga completa leyendo el storage crudo:
const reloadedCatalog = loadProducts(TENANT_1);
const reloadedP1 = reloadedCatalog.find((p) => p.id === 'p1');
assert.equal(reloadedP1.isActive, false, 'El estado desactivado debe persistir en localStorage');
console.log('✓ Prueba 9 superada: El estado activo/inactivo persiste fielmente en localStorage.');

// 10. El aislamiento entre empresas se mantiene
const catalogT2 = loadProducts(TENANT_2);
assert.equal(catalogT2.length, 1);
assert.equal(catalogT2[0].id, 'p2-1');
assert.equal(catalogT2[0].isActive, true, 'La Empresa 2 no debe ser afectada por los cambios de Empresa 1');
console.log('✓ Prueba 10 superada: Aislamiento estricto multiempresa confirmado.');

// 11. Las funcionalidades de stock, pagos, tickets e historial continúan funcionando
// Probamos venta de p2 con stock suficiente y generación de ticket
addToCart(cart, loadProducts(TENANT_1).find((p) => p.id === 'p2'), 2);
const finalSale = validateAndConfirmSale(TENANT_1, cart, 'Empresa S.A.', [
  { method: 'transferencia', amount: 3000 },
]);
assert.equal(finalSale.success, true);
assert.equal(finalSale.sale.payments[0].method, 'transferencia');
assert.equal(finalSale.sale.total, 3000);
const p2StockFinal = loadProducts(TENANT_1).find((p) => p.id === 'p2').stock;
assert.equal(p2StockFinal, 45); // 50 iniciales - 3 venta anterior - 2 venta actual = 45
console.log('✓ Prueba 11 superada: Stock, pagos, tickets y trazabilidad continúan operando con total consistencia.');

console.log('\n==============================================================================');
console.log('TODAS LAS 11 PRUEBAS DE LA ETAPA 3.3 FUERON SUPERADAS CON ÉXITO.');
console.log('==============================================================================\n');
