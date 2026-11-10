import React from 'react';
import { Boxes, FileDown, FileUp, FolderTree, Loader2, PackagePlus, Plus, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';

interface InventoryHeaderProps {
  companyName: string;
  isMasterAdmin: boolean;
  canImportInitialStock: boolean;
  cartItemsCount: number;
  cartTotal: number;
  onManageCategories: () => void;
  onNewProduct: () => void;
  onInitialStock: () => void;
  onOpenCart: () => void;
  onImportExcel: () => void;
  onExportExcel: () => void;
  isExporting: boolean;
}

const ACTION_CLASS = 'gap-1.5 font-medium border-border hover:bg-surface-2';

/** Título de Inventario y acciones principales (categorías, alta, stock inicial, carrito). */
export const InventoryHeader: React.FC<InventoryHeaderProps> = ({
  companyName,
  isMasterAdmin,
  canImportInitialStock,
  cartItemsCount,
  cartTotal,
  onManageCategories,
  onNewProduct,
  onInitialStock,
  onOpenCart,
  onImportExcel,
  onExportExcel,
  isExporting,
}) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
        <Boxes size={22} />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">Inventario y Venta en Mostrador</h1>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
            {companyName}
          </span>
        </div>
        <p className="text-xs text-text-muted mt-0.5">
          Catálogo activo de productos con búsqueda instantánea, carrito integrado y ajustes de existencias.
        </p>
      </div>
    </div>

    <div className="flex flex-wrap items-center justify-end gap-2.5">
      {isMasterAdmin && (
        <>
          <Button variant="secondary" size="md" onClick={onManageCategories} className={ACTION_CLASS}
            title="Administrar el catálogo formal de categorías de esta empresa">
            <FolderTree size={16} className="text-primary" />
            <span>Gestionar categorías</span>
          </Button>
          <Button variant="secondary" size="md" onClick={onNewProduct} className={ACTION_CLASS}
            title="Crear un nuevo producto en esta empresa">
            <Plus size={16} className="text-primary" />
            <span>Nuevo Producto</span>
          </Button>
          <Button variant="secondary" size="md" onClick={onImportExcel} className={ACTION_CLASS}
            title="Importar muchos productos desde un archivo de Excel o CSV">
            <FileUp size={16} className="text-primary" />
            <span>Importar Excel</span>
          </Button>
          {canImportInitialStock && (
            <Button variant="secondary" size="md" onClick={onInitialStock} className={ACTION_CLASS}
              title="Cargar existencias de apertura y costos iniciales para productos sin movimientos">
              <PackagePlus size={16} className="text-primary" />
              <span>Cargar stock inicial</span>
            </Button>
          )}
        </>
      )}

      <Button variant="secondary" size="md" onClick={onExportExcel} disabled={isExporting} className={ACTION_CLASS}
        title="Descargar el inventario en un archivo de Excel">
        {isExporting ? <Loader2 size={16} className="animate-spin text-primary" /> : <FileDown size={16} className="text-primary" />}
        <span>Exportar Excel</span>
      </Button>

      <Button variant="primary" size="md" onClick={onOpenCart} className="shadow-lg shadow-primary/20 relative">
        <ShoppingCart size={16} />
        <span>Carrito ({cartItemsCount})</span>
        {cartItemsCount > 0 && (
          <span className="font-bold tabular-nums ml-1 px-1.5 py-0.2 rounded bg-black/30 text-xs">
            {formatCurrency(cartTotal)}
          </span>
        )}
      </Button>
    </div>
  </div>
);
