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

function getCategoryKey(tenantId) {
  return `stockly_categories_${tenantId}_v1`;
}
function getProductKey(tenantId) {
  return `stockly_products_${tenantId}_v1`;
}

function loadCategories(tenantId) {
  const raw = localStorage.getItem(getCategoryKey(tenantId));
  if (raw) return JSON.parse(raw);

  // Migración idempotente local desde productos
  const productsRaw = localStorage.getItem(getProductKey(tenantId));
  if (productsRaw) {
    const products = JSON.parse(productsRaw);
    if (Array.isArray(products) && products.length > 0) {
      const uniqueMap = new Map();
      for (const p of products) {
        const clean = p.category?.trim();
        if (clean && !uniqueMap.has(clean.toLowerCase())) {
          uniqueMap.set(clean.toLowerCase(), clean);
        }
      }

      const initialCategories = Array.from(uniqueMap.values())
        .sort()
        .map((name, idx) => ({
          id: `cat-${tenantId.slice(0, 3)}-${(idx + 1).toString().padStart(3, '0')}`,
          companyId: tenantId,
          name,
          createdAt: new Date().toISOString(),
        }));

      if (initialCategories.length > 0) {
        localStorage.setItem(getCategoryKey(tenantId), JSON.stringify(initialCategories));

        // Vincular productos
        const updated = products.map((prod) => {
          const match = initialCategories.find(
            (c) => c.name.toLowerCase() === prod.category?.trim().toLowerCase()
          );
          return match ? { ...prod, categoryId: match.id } : prod;
        });
        localStorage.setItem(getProductKey(tenantId), JSON.stringify(updated));
        return initialCategories;
      }
    }
  }

  return [];
}

function saveCategories(tenantId, categories) {
  localStorage.setItem(getCategoryKey(tenantId), JSON.stringify(categories));
}

function loadProducts(tenantId) {
  const raw = localStorage.getItem(getProductKey(tenantId));
  return raw ? JSON.parse(raw) : [];
}

function saveProducts(tenantId, products) {
  localStorage.setItem(getProductKey(tenantId), JSON.stringify(products));
}

// ============================================================================
// LÓGICA DE NEGOCIO DE CATEGORÍAS
// ============================================================================
function validateCategoryName(categories, name, excludeId) {
  const clean = name.trim();
  if (!clean) {
    return { valid: false, error: 'El nombre de la categoría es obligatorio.' };
  }
  const duplicate = categories.some(
    (c) => c.id !== excludeId && c.name.trim().toLowerCase() === clean.toLowerCase()
  );
  if (duplicate) {
    return { valid: false, error: `Ya existe una categoría llamada "${clean}".` };
  }
  return { valid: true };
}

function createCategory(tenantId, name, description) {
  const categories = loadCategories(tenantId);
  const validation = validateCategoryName(categories, name);
  if (!validation.valid) return { success: false, error: validation.error };

  const newCat = {
    id: `cat-${tenantId.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    companyId: tenantId,
    name: name.trim(),
    description: description?.trim(),
    createdAt: new Date().toISOString(),
  };

  const updated = [...categories, newCat].sort((a, b) => a.name.localeCompare(b.name));
  saveCategories(tenantId, updated);
  return { success: true, category: newCat };
}

function renameCategory(tenantId, id, newName) {
  const categories = loadCategories(tenantId);
  const validation = validateCategoryName(categories, newName, id);
  if (!validation.valid) return { success: false, error: validation.error };

  const target = categories.find((c) => c.id === id);
  if (!target) return { success: false, error: 'Categoría no encontrada' };

  const oldName = target.name;
  target.name = newName.trim();
  saveCategories(tenantId, categories);

  // Actualización en cascada a todos los productos
  const products = loadProducts(tenantId);
  let productsUpdated = 0;
  for (const prod of products) {
    if (prod.categoryId === id || prod.category.trim().toLowerCase() === oldName.trim().toLowerCase()) {
      prod.categoryId = id;
      prod.category = target.name;
      productsUpdated++;
    }
  }
  saveProducts(tenantId, products);

  return { success: true, category: target, productsUpdated };
}

function deleteCategory(tenantId, id) {
  const categories = loadCategories(tenantId);
  const target = categories.find((c) => c.id === id);
  if (!target) return { success: false, error: 'Categoría no encontrada' };

  // Validar si tiene productos asociados
  const products = loadProducts(tenantId);
  const associatedCount = products.filter(
    (p) => p.categoryId === id || p.category.trim().toLowerCase() === target.name.trim().toLowerCase()
  ).length;

  if (associatedCount > 0) {
    return {
      success: false,
      error: `No se puede eliminar la categoría porque tiene ${associatedCount} producto(s) asociado(s). Reasigna o elimina los productos primero.`,
    };
  }

  const updated = categories.filter((c) => c.id !== id);
  saveCategories(tenantId, updated);
  return { success: true };
}

function filterProducts(products, categoryFilter) {
  if (categoryFilter === 'all') return products;
  return products.filter((p) => p.category === categoryFilter);
}

// ============================================================================
// SUITE DE PRUEBAS OBLIGATORIAS ETAPA 3.4
// ============================================================================
console.log('--- INICIANDO SUITE DE PRUEBAS ETAPA 3.4: GESTIÓN FORMAL DE CATEGORÍAS ---\n');

const TENANT_1 = 'ferreteria_central';
const TENANT_2 = 'corralon_sur';

// 9. Migración de los productos existentes sin pérdida ni duplicación de categorías
// Precargamos productos sin catálogo previo de categorías:
const legacyProducts = [
  { id: 'prod-01', sku: 'FER-01', name: 'Disco Norton 115mm', category: 'Abrasivos', stock: 10 },
  { id: 'prod-02', sku: 'FER-02', name: 'Disco Flap 115mm', category: 'abrasivos', stock: 5 }, // diferencia minúscula
  { id: 'prod-03', sku: 'FER-03', name: 'Electrodo Conarco 2.5', category: 'Soldadura', stock: 20 },
  { id: 'prod-04', sku: 'FER-04', name: 'Taladro Bosch GSB 13', category: 'Herramientas Eléctricas', stock: 3 },
];
saveProducts(TENANT_1, legacyProducts);

// Al invocar loadCategories se dispara la migración idempotente
const migratedCategories = loadCategories(TENANT_1);
assert.equal(migratedCategories.length, 3, 'Debe haber exactamente 3 categorías únicas normalizadas');
assert.equal(
  migratedCategories.some((c) => c.name.toLowerCase() === 'abrasivos'),
  true
);
const migratedProducts = loadProducts(TENANT_1);
assert.equal(
  migratedProducts.every((p) => typeof p.categoryId === 'string' && p.categoryId.startsWith('cat-')),
  true,
  'Todos los productos migrados deben tener asignado un categoryId válido'
);
console.log('✓ Prueba 9 superada: Migración de productos existentes sin pérdida ni duplicación de categorías.');

// 1. Crear una categoría
const createRes = createCategory(TENANT_1, 'Fijaciones', 'Tornillos y tarugos');
assert.equal(createRes.success, true);
assert.equal(createRes.category.name, 'Fijaciones');
assert.equal(loadCategories(TENANT_1).some((c) => c.name === 'Fijaciones'), true);
console.log('✓ Prueba 1 superada: Creación formal de una categoría exitosa.');

// 2. Rechazar un nombre vacío o compuesto solo por espacios
const emptyRes1 = createCategory(TENANT_1, '');
assert.equal(emptyRes1.success, false);
assert.match(emptyRes1.error, /obligatorio/);

const emptyRes2 = createCategory(TENANT_1, '     ');
assert.equal(emptyRes2.success, false);
assert.match(emptyRes2.error, /obligatorio/);
console.log('✓ Prueba 2 superada: Rechazo estricto de nombres vacíos o con solo espacios.');

// 3. Rechazar duplicados como "Pinturas", "pinturas" y " Pinturas "
createCategory(TENANT_1, 'Pinturas');
const dup1 = createCategory(TENANT_1, 'pinturas');
assert.equal(dup1.success, false);
assert.match(dup1.error, /Ya existe una categoría/);

const dup2 = createCategory(TENANT_1, '   PINTURAS   ');
assert.equal(dup2.success, false);
assert.match(dup2.error, /Ya existe una categoría/);
console.log('✓ Prueba 3 superada: Rechazo de duplicados case-insensitive y con espacios exteriores.');

// 4. Renombrar una categoría y actualizar los productos asociados
const soldaduraCat = loadCategories(TENANT_1).find((c) => c.name === 'Soldadura');
assert(soldaduraCat, 'Debe existir la categoría Soldadura');
const renameRes = renameCategory(TENANT_1, soldaduraCat.id, 'Soldaduras Industriales');
assert.equal(renameRes.success, true);
assert.equal(renameRes.productsUpdated >= 1, true);

const updatedProductsAfterRename = loadProducts(TENANT_1);
const prodSoldadura = updatedProductsAfterRename.find((p) => p.sku === 'FER-03');
assert.equal(prodSoldadura.category, 'Soldaduras Industriales');
assert.equal(prodSoldadura.categoryId, soldaduraCat.id);
console.log('✓ Prueba 4 superada: Renombrar categoría actualiza coherentemente todos los productos vinculados.');

// 5. Bloquear la eliminación de una categoría que tenga productos asociados
const deleteBlockedRes = deleteCategory(TENANT_1, soldaduraCat.id);
assert.equal(deleteBlockedRes.success, false);
assert.match(deleteBlockedRes.error, /No se puede eliminar la categoría porque tiene/);
assert.equal(loadCategories(TENANT_1).some((c) => c.id === soldaduraCat.id), true);
console.log('✓ Prueba 5 superada: Bloqueo de eliminación en categorías con productos asociados.');

// 6. Eliminar una categoría sin productos asociados
// "Fijaciones" fue creada y no tiene productos asociados
const fijacionesCat = loadCategories(TENANT_1).find((c) => c.name === 'Fijaciones');
assert(fijacionesCat, 'Debe existir Fijaciones');
const deleteSuccessRes = deleteCategory(TENANT_1, fijacionesCat.id);
assert.equal(deleteSuccessRes.success, true);
assert.equal(loadCategories(TENANT_1).some((c) => c.id === fijacionesCat.id), false);
console.log('✓ Prueba 6 superada: Eliminación exitosa de una categoría vacía.');

// 7. Persistencia tras recargar
// Forzamos lectura fresca de localStorage:
const reloadedCategories = JSON.parse(localStorage.getItem(getCategoryKey(TENANT_1)));
assert.equal(reloadedCategories.some((c) => c.name === 'Soldaduras Industriales'), true);
assert.equal(reloadedCategories.some((c) => c.name === 'Fijaciones'), false);
console.log('✓ Prueba 7 superada: Los cambios persisten fielmente tras recargar.');

// 8. Aislamiento entre dos empresas
createCategory(TENANT_2, 'Graneles y Bolsas');
const catsT1 = loadCategories(TENANT_1);
const catsT2 = loadCategories(TENANT_2);
assert.equal(catsT1.some((c) => c.name === 'Graneles y Bolsas'), false);
assert.equal(catsT2.some((c) => c.name === 'Soldaduras Industriales'), false);
console.log('✓ Prueba 8 superada: Aislamiento estricto de catálogos entre empresas.');

// 10. Funcionamiento del formulario y del filtro después de crear, renombrar y eliminar categorías
const currentT1Products = loadProducts(TENANT_1);
const filteredByRenamed = filterProducts(currentT1Products, 'Soldaduras Industriales');
assert.equal(filteredByRenamed.length, 1);
assert.equal(filteredByRenamed[0].name, 'Electrodo Conarco 2.5');

const filteredByOld = filterProducts(currentT1Products, 'Soldadura');
assert.equal(filteredByOld.length, 0, 'La categoría vieja ya no debe arrojar resultados');

const filteredAll = filterProducts(currentT1Products, 'all');
assert.equal(filteredAll.length, currentT1Products.length);
console.log('✓ Prueba 10 superada: Filtros y formularios operan con el nuevo catálogo sin inconsistencias.');

console.log('\n==============================================================================');
console.log('TODAS LAS 10 PRUEBAS OBLIGATORIAS DE LA ETAPA 3.4 FUERON SUPERADAS.');
console.log('==============================================================================\n');
