import React from 'react';
import { PackageX, PackagePlus, Plus, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ProductsEmptyStateProps {
  /** true si la empresa todavía no tiene ningún producto cargado. */
  isCatalogEmpty: boolean;
  /** Error de carga: si la lista está vacía por un error, no se invita a crear productos. */
  loadError?: string | null;
  onClearFilters: () => void;
  onCreateProduct: () => void;
}

/**
 * Estado vacío de la tabla de inventario.
 * Distingue un catálogo sin productos, una búsqueda sin resultados y una carga fallida.
 */
export const ProductsEmptyState: React.FC<ProductsEmptyStateProps> = ({
  isCatalogEmpty,
  loadError = null,
  onClearFilters,
  onCreateProduct,
}) => {
  if (isCatalogEmpty && loadError) {
    return (
      <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-text-muted">
        <WifiOff size={36} className="text-danger/60 mb-2" />
        <span className="text-xs font-semibold text-text-primary">No se pudo cargar el catálogo</span>
        <p className="text-[11px] text-text-muted mt-1">
          Los productos no se borraron: es un problema para leerlos. Probá de nuevo con el botón Reintentar.
        </p>
      </div>
    );
  }

  const Icon = isCatalogEmpty ? PackagePlus : PackageX;

  return (
    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-text-muted">
      <Icon size={36} className="text-text-muted/50 mb-2" />
      <span className="text-xs font-semibold text-text-primary">
        {isCatalogEmpty ? 'Todavía no hay productos cargados' : 'No hay productos con estos filtros'}
      </span>
      <p className="text-[11px] text-text-muted mt-1 mb-3">
        {isCatalogEmpty
          ? 'Creá el primer producto de esta empresa para empezar a gestionar el stock.'
          : 'Probá con otro término de búsqueda o limpiá los filtros activos.'}
      </p>
      {isCatalogEmpty ? (
        <Button variant="primary" size="sm" onClick={onCreateProduct} className="gap-1.5">
          <Plus size={14} />
          <span>Nuevo producto</span>
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={onClearFilters}>
          Limpiar filtros
        </Button>
      )}
    </div>
  );
};
