import { useState, useEffect, useCallback } from 'react';
import { TenantId } from '@/types';
import { Product, ProductFormData, StockStatus, StockMovement, StockAdjustmentData, CartItem } from '../types';
import { getMockProducts } from '@/data/mockProducts';
import { loadMovementsFromStorage, saveMovementsToStorage } from './useStockMovements';

export function getProductStorageKey(tenantId: TenantId): string {
  return `stockly_products_${tenantId}_v1`;
}

export function computeStatus(stock: number, minStock: number): StockStatus {
  if (stock < 0) return 'negative';
  if (stock === 0) return 'out_of_stock';
  if (stock <= minStock) return 'low';
  return 'normal';
}

export function loadProductsFromStorage(tenantId: TenantId): Product[] {
  try {
    const raw = localStorage.getItem(getProductStorageKey(tenantId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((p: Product) => ({
          ...p,
          isActive: p.isActive !== false,
        }));
      }
    }
  } catch (err) {
    console.warn(`Error al leer productos de ${tenantId} desde localStorage:`, err);
  }

  // Seed default mock catalog if none exists for this tenant
  const initial = getMockProducts(tenantId).map((p) => ({
    ...p,
    isActive: p.isActive ?? true,
  }));

  try {
    localStorage.setItem(getProductStorageKey(tenantId), JSON.stringify(initial));
  } catch (err) {
    console.warn(`Error al guardar productos iniciales en localStorage:`, err);
  }

  return initial;
}

export function saveProductsToStorage(tenantId: TenantId, products: Product[]): boolean {
  try {
    localStorage.setItem(getProductStorageKey(tenantId), JSON.stringify(products));
    return true;
  } catch (err) {
    console.error(`Error al guardar productos de ${tenantId} en localStorage:`, err);
    return false;
  }
}

export interface ValidationResult {
  valid: boolean;
  skuError?: string;
  barcodeError?: string;
  generalError?: string;
}

export function useProducts(tenantId: TenantId) {
  const [products, setProducts] = useState<Product[]>(() => loadProductsFromStorage(tenantId));

  // Reload products strictly when company/tenant changes
  useEffect(() => {
    setProducts(loadProductsFromStorage(tenantId));
  }, [tenantId]);

  // Sincronización en tiempo real entre pestañas mediante storage event
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === getProductStorageKey(tenantId)) {
        setProducts(loadProductsFromStorage(tenantId));
      }
    }
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [tenantId]);

  const syncProductsFromTransaction = useCallback((updated: Product[]) => {
    setProducts(updated);
  }, []);

  const validateSkuAndBarcode = useCallback(
    (sku: string, barcode: string, currentProductId?: string): ValidationResult => {
      const cleanSku = sku.trim().toLowerCase();
      const cleanBarcode = barcode.trim();

      if (!cleanSku) {
        return { valid: false, skuError: 'El SKU es obligatorio.' };
      }

      // Check duplicate SKU in this company
      const skuDuplicate = products.some(
        (p) => p.sku.toLowerCase() === cleanSku && p.id !== currentProductId
      );
      if (skuDuplicate) {
        return {
          valid: false,
          skuError: `El SKU "${sku.trim().toUpperCase()}" ya está registrado en esta empresa.`,
        };
      }

      // Check duplicate Barcode in this company if provided
      if (cleanBarcode) {
        const barcodeDuplicate = products.some(
          (p) => p.barcode && p.barcode.trim() === cleanBarcode && p.id !== currentProductId
        );
        if (barcodeDuplicate) {
          return {
            valid: false,
            barcodeError: `El código de barras "${cleanBarcode}" ya pertenece a otro producto en esta empresa.`,
          };
        }
      }

      return { valid: true };
    },
    [products]
  );

  const createProduct = useCallback(
    (data: ProductFormData): { success: boolean; error?: string; product?: Product } => {
      const validation = validateSkuAndBarcode(data.sku, data.barcode);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.skuError || validation.barcodeError || 'Datos de producto inválidos.',
        };
      }

      const cleanName = data.name.trim();
      const cleanCategory = data.category.trim();

      if (!cleanName) {
        return { success: false, error: 'El nombre del producto es obligatorio.' };
      }
      if (!cleanCategory) {
        return { success: false, error: 'La categoría es obligatoria.' };
      }
      if (data.salePrice < 0) {
        return { success: false, error: 'El precio de venta no puede ser negativo.' };
      }
      if (data.costPrice < 0) {
        return { success: false, error: 'El costo no puede ser negativo.' };
      }
      if (data.minStock < 0) {
        return { success: false, error: 'El stock mínimo no puede ser negativo.' };
      }

      // Initial stock is 0 for new products
      const initialStock = 0;
      const status = computeStatus(initialStock, data.minStock);

      const newProduct: Product = {
        id: `prod-${tenantId.slice(0, 3)}-${Date.now()}`,
        sku: data.sku.trim().toUpperCase(),
        barcode: data.barcode.trim(),
        name: cleanName,
        categoryId: data.categoryId,
        category: cleanCategory,
        salePrice: Number(data.salePrice),
        costPrice: Number(data.costPrice),
        stock: initialStock,
        minStock: Number(data.minStock),
        unit: data.unit?.trim() || 'u.',
        description: data.description?.trim() || undefined,
        status,
        isActive: true,
      };

      setProducts((prev) => {
        const next = [newProduct, ...prev];
        saveProductsToStorage(tenantId, next);
        return next;
      });

      return { success: true, product: newProduct };
    },
    [tenantId, validateSkuAndBarcode]
  );

  const updateProduct = useCallback(
    (id: string, data: ProductFormData): { success: boolean; error?: string; product?: Product } => {
      const validation = validateSkuAndBarcode(data.sku, data.barcode, id);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.skuError || validation.barcodeError || 'Datos de producto inválidos.',
        };
      }

      const cleanName = data.name.trim();
      const cleanCategory = data.category.trim();

      if (!cleanName) {
        return { success: false, error: 'El nombre del producto es obligatorio.' };
      }
      if (!cleanCategory) {
        return { success: false, error: 'La categoría es obligatoria.' };
      }
      if (data.salePrice < 0) {
        return { success: false, error: 'El precio de venta no puede ser negativo.' };
      }
      if (data.costPrice < 0) {
        return { success: false, error: 'El costo no puede ser negativo.' };
      }
      if (data.minStock < 0) {
        return { success: false, error: 'El stock mínimo no puede ser negativo.' };
      }

      let updatedProduct: Product | undefined;

      setProducts((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index === -1) return prev;

        const existing = prev[index];
        const updatedStatus = computeStatus(existing.stock, Number(data.minStock));

        updatedProduct = {
          ...existing,
          sku: data.sku.trim().toUpperCase(),
          barcode: data.barcode.trim(),
          name: cleanName,
          categoryId: data.categoryId || existing.categoryId,
          category: cleanCategory,
          salePrice: Number(data.salePrice),
          costPrice: Number(data.costPrice),
          minStock: Number(data.minStock),
          unit: data.unit?.trim() || existing.unit,
          description: data.description?.trim() || undefined,
          status: updatedStatus,
        };

        const next = [...prev];
        next[index] = updatedProduct;
        saveProductsToStorage(tenantId, next);
        return next;
      });

      if (!updatedProduct) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      return { success: true, product: updatedProduct };
    },
    [tenantId, validateSkuAndBarcode]
  );

  const renameCategoryInProducts = useCallback(
    (categoryId: string, oldName: string, newName: string) => {
      setProducts((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          const matchId = p.categoryId === categoryId;
          const matchName = p.category.trim().toLowerCase() === oldName.trim().toLowerCase();
          if (matchId || matchName) {
            changed = true;
            return {
              ...p,
              categoryId,
              category: newName,
            };
          }
          return p;
        });

        if (changed) {
          saveProductsToStorage(tenantId, next);
        }
        return next;
      });
    },
    [tenantId]
  );

  const deactivateProduct = useCallback(
    (id: string): { success: boolean; error?: string; product?: Product } => {
      let updatedProduct: Product | undefined;

      setProducts((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index === -1) return prev;

        const existing = prev[index];
        updatedProduct = {
          ...existing,
          isActive: false,
        };

        const next = [...prev];
        next[index] = updatedProduct;
        saveProductsToStorage(tenantId, next);
        return next;
      });

      if (!updatedProduct) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      return { success: true, product: updatedProduct };
    },
    [tenantId]
  );

  const reactivateProduct = useCallback(
    (id: string): { success: boolean; error?: string; product?: Product } => {
      let updatedProduct: Product | undefined;

      setProducts((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index === -1) return prev;

        const existing = prev[index];
        updatedProduct = {
          ...existing,
          isActive: true,
        };

        const next = [...prev];
        next[index] = updatedProduct;
        saveProductsToStorage(tenantId, next);
        return next;
      });

      if (!updatedProduct) {
        return { success: false, error: 'Producto no encontrado.' };
      }

      return { success: true, product: updatedProduct };
    },
    [tenantId]
  );

  const adjustStock = useCallback(
    (data: StockAdjustmentData): { success: boolean; error?: string; movement?: StockMovement } => {
      if (isNaN(data.quantity) || data.quantity <= 0) {
        return { success: false, error: 'La cantidad debe ser un número positivo mayor a cero.' };
      }

      const product = products.find((p) => p.id === data.productId);
      if (!product) {
        return { success: false, error: 'Producto no encontrado en esta empresa.' };
      }

      const previousStock = product.stock;
      const newStock =
        data.direction === 'increase'
          ? previousStock + data.quantity
          : previousStock - data.quantity;

      const newStatus = computeStatus(newStock, product.minStock);

      const movement: StockMovement = {
        id: `mov-${tenantId.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        companyId: tenantId,
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        direction: data.direction,
        reason: data.reason,
        quantity: data.quantity,
        previousStock,
        newStock,
        referenceDoc: data.referenceDoc?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        createdBy: 'Lautaro C. (Master Admin)',
        createdAt: new Date().toISOString(),
      };

      const updatedProducts = products.map((p) =>
        p.id === data.productId ? { ...p, stock: newStock, status: newStatus } : p
      );

      const existingMovements = loadMovementsFromStorage(tenantId);
      const updatedMovements = [movement, ...existingMovements];

      const prodSaved = saveProductsToStorage(tenantId, updatedProducts);
      const movSaved = saveMovementsToStorage(tenantId, updatedMovements);

      if (!prodSaved || !movSaved) {
        return { success: false, error: 'Error al persistir el ajuste en el almacenamiento local.' };
      }

      setProducts(updatedProducts);
      return { success: true, movement };
    },
    [tenantId, products]
  );

  const discountStockForSale = useCallback(
    (
      saleId: string,
      saleNumber: string,
      items: CartItem[]
    ): { success: boolean; error?: string; movements?: StockMovement[] } => {
      if (!items || items.length === 0) {
        return { success: false, error: 'El carrito no contiene productos.' };
      }

      const timestamp = new Date().toISOString();
      const newMovements: StockMovement[] = [];
      const productUpdatesMap = new Map<string, { newStock: number; status: StockStatus }>();

      for (const item of items) {
        const product = products.find((p) => p.id === item.productId);
        if (!product) {
          return { success: false, error: `El producto ${item.sku} no existe en la empresa activa.` };
        }
        if (product.isActive === false) {
          return {
            success: false,
            error: `El producto "${product.name}" (${product.sku}) se encuentra desactivado y no puede ser vendido.`,
          };
        }
        if (item.quantity <= 0) {
          return { success: false, error: `Cantidad no válida para el producto ${item.sku}.` };
        }

        const previousStock = productUpdatesMap.has(product.id)
          ? productUpdatesMap.get(product.id)!.newStock
          : product.stock;
        const newStock = previousStock - item.quantity;
        const status = computeStatus(newStock, product.minStock);

        productUpdatesMap.set(product.id, { newStock, status });

        newMovements.push({
          id: `mov-${tenantId.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          companyId: tenantId,
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
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

      const updatedProducts = products.map((p) => {
        const update = productUpdatesMap.get(p.id);
        if (update) {
          return { ...p, stock: update.newStock, status: update.status };
        }
        return p;
      });

      const existingMovements = loadMovementsFromStorage(tenantId);
      const updatedMovements = [...newMovements, ...existingMovements];

      const prodSaved = saveProductsToStorage(tenantId, updatedProducts);
      const movSaved = saveMovementsToStorage(tenantId, updatedMovements);

      if (!prodSaved || !movSaved) {
        return { success: false, error: 'Error al persistir el descuento de existencias en el almacenamiento local.' };
      }

      setProducts(updatedProducts);
      return { success: true, movements: newMovements };
    },
    [tenantId, products]
  );

  return {
    products,
    createProduct,
    updateProduct,
    renameCategoryInProducts,
    deactivateProduct,
    reactivateProduct,
    adjustStock,
    discountStockForSale,
    validateSkuAndBarcode,
    syncProductsFromTransaction,
  };
}
