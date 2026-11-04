import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError } from '@/lib/errorMessages';
import { sanitizeProductError } from './productsApi';

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
