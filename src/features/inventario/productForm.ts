import type { Product, ProductFormData } from './types';

/** Valores del formulario de producto tal como los escribe el usuario. */
export interface ProductFormValues {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  costPrice: string;
  salePrice: string;
  minStock: string;
  unit: string;
  description: string;
}

export function initialProductFormValues(product: Product | null | undefined, categories: string[]): ProductFormValues {
  if (product) {
    return {
      name: product.name,
      sku: product.sku,
      barcode: product.barcode || '',
      category: product.category,
      costPrice: product.costPrice !== null && product.costPrice !== undefined ? product.costPrice.toString() : '',
      salePrice: product.salePrice.toString(),
      minStock: product.minStock.toString(),
      unit: product.unit || 'unidad',
      description: product.description || '',
    };
  }
  return {
    name: '',
    sku: '',
    barcode: '',
    category: categories[0] || '',
    costPrice: '',
    salePrice: '0',
    minStock: '5',
    unit: 'unidad',
    description: '',
  };
}

/** Costo ingresado, o null si está vacío (un costo ausente no es $0). */
export function parseCost(costPrice: string): number | null {
  return costPrice.trim() !== '' && !isNaN(Number(costPrice)) ? parseFloat(costPrice) : null;
}

/** Ganancia y margen estimados; null cuando no se pueden calcular. */
export function marginSummary(costPrice: string, salePrice: string) {
  const cost = parseCost(costPrice);
  const sale = parseFloat(salePrice) || 0;
  return {
    grossProfit: cost !== null ? sale - cost : null,
    margin: cost !== null && sale > 0 ? ((sale - cost) / sale) * 100 : null,
    isNegativeMargin: cost !== null && sale > 0 && cost > sale,
  };
}

export function validateProductForm(values: ProductFormValues, categories: string[], canManageCosts: boolean): string | null {
  if (!values.name.trim()) return 'El nombre del producto es obligatorio.';
  if (!values.sku.trim()) return 'El código SKU es obligatorio.';
  if (categories.length === 0) {
    return 'No hay categorías registradas en la empresa. Debe crear una categoría desde la sección "Categorías" antes de continuar.';
  }
  if (!values.category.trim()) return 'Debe seleccionar una categoría para el producto.';
  const cost = parseCost(values.costPrice);
  if (canManageCosts && cost !== null && cost < 0) return 'El costo no puede ser negativo.';
  if ((parseFloat(values.salePrice) || 0) < 0) return 'El precio de venta no puede ser negativo.';
  if (parseFloat(values.minStock) < 0) return 'El stock mínimo no puede ser negativo.';
  return null;
}

export function toProductFormData(values: ProductFormValues, canManageCosts: boolean): ProductFormData {
  return {
    name: values.name.trim(),
    sku: values.sku.trim().toUpperCase(),
    barcode: values.barcode.trim(),
    category: values.category.trim(),
    costPrice: canManageCosts ? parseCost(values.costPrice) : undefined,
    salePrice: parseFloat(values.salePrice) || 0,
    minStock: Math.max(0, parseInt(values.minStock, 10) || 0),
    unit: values.unit.trim().toLowerCase() || 'unidad',
    description: values.description.trim() || undefined,
  };
}
