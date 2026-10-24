import React, { useState, useMemo } from 'react';
import type { Product } from '../types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Search, Plus, Check, AlertCircle, Info } from 'lucide-react';

interface InitialStockProductPickerProps {
  products: Product[];
  productsWithMovements: Set<string>;
  selectedProductIds: Set<string>;
  isCheckingEligibility: boolean;
  onSelectProduct: (product: Product) => void;
}

export const InitialStockProductPicker: React.FC<InitialStockProductPickerProps> = ({
  products,
  productsWithMovements,
  selectedProductIds,
  isCheckingEligibility,
  onSelectProduct,
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.barcode.includes(q)
    );
  }, [products, searchQuery]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar producto por nombre, SKU o código..."
          className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-2 border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      </div>

      <div className="max-h-52 overflow-y-auto divide-y divide-border/40 rounded-xl border border-border bg-surface-2/30">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-text-muted">
            No se encontraron productos que coincidan con la búsqueda.
          </div>
        ) : (
          filtered.map((prod) => {
            const hasStock = prod.stock !== 0;
            const hasMovements = productsWithMovements.has(prod.id);
            const isEligible = !hasStock && !hasMovements;
            const isSelected = selectedProductIds.has(prod.id);

            return (
              <div
                key={prod.id}
                className="p-2.5 px-3 flex items-center justify-between gap-3 text-xs hover:bg-surface-2/60 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary truncate">{prod.name}</span>
                    <span className="font-mono text-[10px] text-text-muted">({prod.sku})</span>
                    <Badge variant="neutral" className="text-[10px] px-1 py-0 border-border">
                      {prod.unit}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-text-muted">Stock actual: {prod.stock}</span>
                    {!isEligible && (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertCircle size={11} />
                        {hasStock
                          ? 'Posee existencias (usar Ajuste de Stock)'
                          : 'Posee movimientos previos (usar Ajuste de Stock)'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0">
                  {isSelected ? (
                    <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <Check size={12} /> Agregado
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant={isEligible ? 'secondary' : 'outline'}
                      disabled={!isEligible || isCheckingEligibility}
                      onClick={() => onSelectProduct(prod)}
                      className="h-7 text-xs gap-1 border-border"
                      title={
                        isEligible
                          ? 'Agregar producto a la lista de carga inicial'
                          : 'Este producto no es apto para carga inicial; debe ajustarse desde Ajuste de Stock.'
                      }
                    >
                      <Plus size={13} />
                      Agregar
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {isCheckingEligibility && (
        <p className="text-[10px] text-text-muted flex items-center gap-1">
          <Info size={12} />
          Verificando historial de movimientos en la base de datos...
        </p>
      )}
    </div>
  );
};
