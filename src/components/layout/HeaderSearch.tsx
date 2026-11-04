import React, { useState } from 'react';
import { Search } from 'lucide-react';

interface HeaderSearchProps {
  /** Busca el texto en el catálogo de productos de la empresa activa. */
  onSearch: (query: string) => void;
}

/** Buscador global: al presionar Enter abre Inventario filtrado por el texto. */
export const HeaderSearch: React.FC<HeaderSearchProps> = ({ onSearch }) => {
  const [query, setQuery] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSearch(query.trim());
  };

  return (
    <form role="search" onSubmit={handleSubmit} className="w-full relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Buscar producto en el inventario"
        placeholder="Buscar producto por nombre, SKU o código y presionar Enter"
        className="w-full h-9 pl-9 pr-3 text-xs bg-surface-2/60 hover:bg-surface-2 border border-border/80 focus:border-primary/50 focus:bg-surface-2 focus:outline-none rounded-lg text-text-primary placeholder:text-text-muted transition-colors"
      />
    </form>
  );
};
