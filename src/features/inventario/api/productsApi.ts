import { supabase } from '@/lib/supabase';
import { fetchAllRows } from '@/lib/fetchAllRows';
import type { Product, StockStatus } from '../types';

export function computeStatus(stock: number, minStock: number): StockStatus {
  if (stock < 0) return 'negative';
  if (stock === 0) return 'out_of_stock';
  if (stock <= minStock) return 'low';
  return 'normal';
}

/**
 * Normaliza y traduce errores emitidos por PostgreSQL y las RPC de catálogo.
 */
export function sanitizeProductError(err: unknown, defaultMessage: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const msg = err.message.replace(/^(P0001|error):\s*/i, '').trim();
    if (msg.includes('idx_products_company_sku_unique') || (msg.includes('ya existe') && msg.includes('SKU'))) {
      return 'Ya existe un producto con ese código SKU en esta empresa.';
    }
    if (msg.includes('chk_products_unit_valid')) {
      return 'Unidad de medida inválida. Valores permitidos: unidad, kg, litro, metro, bulto, par.';
    }
    if (msg.includes('master_admin')) {
      return 'Acceso denegado: se requiere rol de Administrador (master_admin) para modificar el catálogo.';
    }
    return msg;
  }
  if (err instanceof Error) {
    return err.message.replace(/^(P0001|error):\s*/i, '').trim();
  }
  return defaultMessage;
}

/**
 * Determina si una falla se debe a pérdida de conectividad o error de transporte,
 * dejando en incertidumbre si PostgreSQL ejecutó o no la mutación.
 */
export function isNetworkOrUncertainError(err: unknown): boolean {
  if (!err) return false;
  const str = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    str.includes('failed to fetch') ||
    str.includes('networkerror') ||
    str.includes('network') ||
    str.includes('timeout') ||
    str.includes('connection refused') ||
    str.includes('abort')
  );
}

export interface CreateProductParams {
  companyId: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  costPrice?: number | null;
  minStock: number;
  barcode?: string;
  description?: string;
  categoryId?: string;
  supplierId?: string;
}

export interface UpdateProductParams {
  companyId: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  sellingPrice: number;
  costPrice?: number | null;
  currentCostPrice?: number | null;
  minStock: number;
  barcode?: string;
  description?: string;
  categoryId?: string;
  supplierId?: string;
  isActive?: boolean;
}

export interface UpdateProductExecutionResult {
  status: 'success' | 'partial' | 'failed' | 'uncertain';
  message?: string;
  generalDataSaved: boolean;
  costSaved: boolean;
}

/**
 * Consulta los productos de la empresa activa desde public.products bajo RLS.
 * Si isMasterAdmin es true, consulta de forma complementaria public.product_costs.
 * Si un producto no posee costo asignado o el usuario es employee, costPrice es null.
 */
export async function fetchProducts(
  companyId: string,
  isMasterAdmin: boolean
): Promise<Product[]> {
  // Lectura completa por páginas: el catálogo entero se usa en la venta y en los filtros locales
  const { data: prodRows, error: prodErr } = await fetchAllRows((from, to) =>
    supabase
      .from('products')
      .select('id, company_id, sku, barcode, name, description, category_id, supplier_id, unit, selling_price, min_stock, current_stock, is_active, created_at, updated_at')
      .eq('company_id', companyId)
      .order('name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (prodErr) {
    throw new Error(sanitizeProductError(prodErr, 'Error al consultar el catálogo de productos.'));
  }

  // Resolver nombres de categorías asociadas
  const { data: catRows } = await fetchAllRows((from, to) =>
    supabase
      .from('categories')
      .select('id, name')
      .eq('company_id', companyId)
      .order('id', { ascending: true })
      .range(from, to)
  );

  const catMap = new Map(catRows.map((c) => [c.id, c.name]));

  // Resolver costos confidenciales exclusivamente para master_admin
  let costMap = new Map<string, number>();
  if (isMasterAdmin) {
    const { data: costRows, error: costErr } = await fetchAllRows((from, to) =>
      supabase
        .from('product_costs')
        .select('product_id, cost_price')
        .eq('company_id', companyId)
        .order('product_id', { ascending: true })
        .range(from, to)
    );

    if (!costErr && costRows) {
      costMap = new Map(costRows.map((c) => [c.product_id, Number(c.cost_price)]));
    }
  }

  return prodRows.map((row) => {
    const stock = Number(row.current_stock);
    const minStock = Number(row.min_stock);
    const categoryName = row.category_id ? catMap.get(row.category_id) || 'General' : 'General';
    const cost = isMasterAdmin && costMap.has(row.id) ? costMap.get(row.id)! : null;

    return {
      id: row.id,
      sku: row.sku,
      barcode: row.barcode || '',
      name: row.name,
      categoryId: row.category_id || undefined,
      category: categoryName,
      salePrice: Number(row.selling_price),
      costPrice: cost,
      stock,
      minStock,
      unit: row.unit,
      status: computeStatus(stock, minStock),
      description: row.description || undefined,
      isActive: row.is_active,
    };
  });
}

/**
 * Crea un producto en el catálogo mediante la RPC public.create_product.
 * Inicializa current_stock en 0.00 y registra atómicamente el costo en public.product_costs.
 */
export async function createProductRpc(params: CreateProductParams): Promise<string> {
  const { data, error } = await supabase.rpc('create_product', {
    p_company_id: params.companyId,
    p_sku: params.sku.trim().toUpperCase(),
    p_name: params.name.trim(),
    p_unit: params.unit.trim().toLowerCase(),
    p_selling_price: params.sellingPrice,
    p_cost_price: params.costPrice != null ? params.costPrice : 0.00,
    p_min_stock: params.minStock,
    p_barcode: params.barcode?.trim() || undefined,
    p_description: params.description?.trim() || undefined,
    p_category_id: params.categoryId || undefined,
    p_supplier_id: params.supplierId || undefined,
  });

  if (error) {
    throw new Error(sanitizeProductError(error, 'Error al crear el producto.'));
  }

  if (!data) {
    throw new Error('El servidor no retornó el identificador del nuevo producto.');
  }

  return data;
}

/**
 * Actualiza los atributos de un producto distinguiendo resultados parciales y fallas de red.
 * No asume que public.update_product y public.update_product_cost constituyan una transacción única.
 */
export async function updateProductRpc(
  params: UpdateProductParams,
  isMasterAdmin: boolean
): Promise<UpdateProductExecutionResult> {
  // Fase 1: Actualización de datos maestros en public.products
  try {
    const { error: updErr } = await supabase.rpc('update_product', {
      p_company_id: params.companyId,
      p_product_id: params.productId,
      p_sku: params.sku.trim().toUpperCase(),
      p_name: params.name.trim(),
      p_unit: params.unit.trim().toLowerCase(),
      p_selling_price: params.sellingPrice,
      p_min_stock: params.minStock,
      p_barcode: params.barcode?.trim() || undefined,
      p_description: params.description?.trim() || undefined,
      p_category_id: params.categoryId || undefined,
      p_supplier_id: params.supplierId || undefined,
      p_is_active: params.isActive ?? true,
    });

    if (updErr) {
      return {
        status: 'failed',
        generalDataSaved: false,
        costSaved: false,
        message: sanitizeProductError(updErr, 'Error al actualizar los datos generales del producto.'),
      };
    }
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return {
        status: 'uncertain',
        generalDataSaved: false,
        costSaved: false,
        message:
          'Error de red durante la actualización. El estado en la base de datos es incierto; por favor revise o recargue los datos antes de reintentar.',
      };
    }
    return {
      status: 'failed',
      generalDataSaved: false,
      costSaved: false,
      message: sanitizeProductError(err, 'No se pudo actualizar el producto.'),
    };
  }

  // Fase 2: Evaluar si el costo requiere actualización
  const costNeedsUpdate =
    isMasterAdmin &&
    params.costPrice !== undefined &&
    params.costPrice !== null &&
    params.costPrice !== params.currentCostPrice;

  if (!costNeedsUpdate) {
    return {
      status: 'success',
      generalDataSaved: true,
      costSaved: true,
    };
  }

  // Fase 3: Actualizar costo confidencial en public.product_costs
  try {
    const { error: costErr } = await supabase.rpc('update_product_cost', {
      p_company_id: params.companyId,
      p_product_id: params.productId,
      p_cost_price: params.costPrice!,
    });

    if (costErr) {
      return {
        status: 'partial',
        generalDataSaved: true,
        costSaved: false,
        message: `Guardado parcial: los datos generales del producto se actualizaron en la base de datos, pero falló la actualización del costo confidencial (${sanitizeProductError(costErr, 'error al registrar costo')}). Verifique el costo registrado.`,
      };
    }

    return {
      status: 'success',
      generalDataSaved: true,
      costSaved: true,
    };
  } catch (err) {
    if (isNetworkOrUncertainError(err)) {
      return {
        status: 'uncertain',
        generalDataSaved: true,
        costSaved: false,
        message:
          'Guardado parcial con estado de costo incierto: los datos generales fueron aplicados, pero ocurrió un corte de red durante la actualización del costo. Recargue los datos para confirmar el estado final.',
      };
    }
    return {
      status: 'partial',
      generalDataSaved: true,
      costSaved: false,
      message: `Guardado parcial: los datos generales se guardaron, pero ocurrió un error al modificar el costo confidencial (${sanitizeProductError(err, 'error desconocido')}).`,
    };
  }
}

/**
 * Activa o desactiva un producto mediante public.update_product conservando sus datos existentes.
 */
export async function setProductActiveRpc(
  companyId: string,
  product: Product,
  isActive: boolean
): Promise<void> {
  const { error } = await supabase.rpc('update_product', {
    p_company_id: companyId,
    p_product_id: product.id,
    p_sku: product.sku,
    p_name: product.name,
    p_unit: product.unit,
    p_selling_price: product.salePrice,
    p_min_stock: product.minStock,
    p_barcode: product.barcode || undefined,
    p_description: product.description || undefined,
    p_category_id: product.categoryId || undefined,
    p_is_active: isActive,
  });

  if (error) {
    throw new Error(
      sanitizeProductError(error, `Error al ${isActive ? 'reactivar' : 'desactivar'} el producto.`)
    );
  }
}
