import type { TenantId } from '@/types';
import type { Product } from '../types';

/**
 * Lo que comparten las operaciones del catálogo con el hook que guarda el estado.
 * Todas las escrituras de estado se ignoran si la empresa activa cambió mientras tanto.
 */
export interface CatalogContext {
  tenantId: TenantId;
  isMasterAdmin: boolean;
  products: Product[];
  /** Vuelve a leer el catálogo del servidor, lo aplica y lo devuelve. Lanza si falla. */
  fetchAndApply: () => Promise<Product[]>;
  /** Corrige en memoria el catálogo (respaldo cuando la recarga falla tras un éxito confirmado). */
  patchProducts: (update: (prev: Product[]) => Product[]) => void;
  setSyncWarning: (message: string) => void;
}

export interface ProductOperationResult {
  success: boolean;
  partial?: boolean;
  uncertain?: boolean;
  error?: string;
  product?: Product;
}
