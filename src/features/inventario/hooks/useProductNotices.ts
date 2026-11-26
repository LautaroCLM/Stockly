import { useMemo } from 'react';
import { useToast } from '@/components/feedback/ToastProvider';
import type { Product, ProductFormData } from '../types';

type SimpleResult = { success: boolean; error?: string };
type MaybeAsync<T> = Promise<T> | T;

interface ProductActions {
  products: Product[];
  onCreateProduct: (data: ProductFormData) => MaybeAsync<SimpleResult>;
  onUpdateProduct: (id: string, data: ProductFormData) => MaybeAsync<SimpleResult>;
  onDeactivateProduct: (id: string) => MaybeAsync<SimpleResult>;
  onReactivateProduct: (id: string) => MaybeAsync<SimpleResult>;
}

/**
 * Las mismas acciones de productos, con un aviso cuando salen bien.
 * Desactivar ofrece Deshacer (vuelve a activarlo). Los errores los siguen mostrando los formularios.
 */
export function useProductNotices(actions: ProductActions) {
  const { notify } = useToast();
  const { products, onCreateProduct, onUpdateProduct, onDeactivateProduct, onReactivateProduct } = actions;

  return useMemo(() => {
    const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? 'El producto';

    const reactivate = async (id: string) => {
      const result = await onReactivateProduct(id);
      if (result.success) notify({ message: `${nameOf(id)} se volvió a activar` });
      else notify({ message: result.error ?? 'No se pudo reactivar el producto.', tone: 'error' });
      return result;
    };

    return {
      create: async (data: ProductFormData) => {
        const result = await onCreateProduct(data);
        if (result.success) notify({ message: `Producto creado: ${data.name}` });
        return result;
      },
      update: async (id: string, data: ProductFormData) => {
        const result = await onUpdateProduct(id, data);
        if (result.success) notify({ message: `Cambios guardados en ${data.name}` });
        return result;
      },
      deactivate: async (id: string) => {
        const name = nameOf(id);
        const result = await onDeactivateProduct(id);
        if (result.success) {
          notify({
            message: `${name} quedó desactivado`,
            detail: 'Ya no aparece para vender.',
            undo: {
              run: async () => {
                const undone = await onReactivateProduct(id);
                return undone.success ? { ok: true } : { ok: false, message: undone.error ?? 'No se pudo reactivar el producto.' };
              },
            },
          });
        }
        return result;
      },
      reactivate,
    };
  }, [products, onCreateProduct, onUpdateProduct, onDeactivateProduct, onReactivateProduct, notify]);
}
