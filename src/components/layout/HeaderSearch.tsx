import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ProductSearchBox } from '@/features/inventario/components/ProductSearchBox';
import type { Product } from '@/features/inventario/types';

interface HeaderSearchProps {
  /** Busca el texto en el catálogo de productos de la empresa activa. */
  onSearch: (query: string) => void;
  /** Catálogo de la empresa activa, para sugerir mientras se escribe. */
  products: readonly Product[];
}

/** Buscador global: sugiere productos al escribir y, al elegir uno o presionar Enter, abre Inventario filtrado. */
export const HeaderSearch: React.FC<HeaderSearchProps> = ({ onSearch, products }) => {
  const [query, setQuery] = useState('');
  const activeProducts = useMemo(() => products.filter((p) => p.isActive !== false), [products]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(query.trim());
  };

  return (
    <form role="search" onSubmit={handleSubmit} className="w-full">
      <ProductSearchBox
        value={query}
        onChange={setQuery}
        products={activeProducts}
        onPick={(text) => onSearch(text.trim())}
        ariaLabel="Buscar producto en el inventario"
        placeholder="Buscar producto por nombre, SKU o código"
        inputClassName="w-full h-9 pl-9 pr-8 text-xs bg-surface-2/60 hover:bg-surface-2 border border-border/80 focus:border-primary/50 focus:bg-surface-2 focus:outline-none rounded-lg text-text-primary placeholder:text-text-muted transition-colors"
        trailing={query ? (
          <button type="button" onClick={() => setQuery('')} title="Borrar búsqueda"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary p-0.5">
            <X size={13} />
          </button>
        ) : null}
      />
    </form>
  );
};
