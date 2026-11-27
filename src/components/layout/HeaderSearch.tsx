import React from 'react';
import { Search } from 'lucide-react';

/** Mac usa Cmd; el resto, Ctrl. */
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Botón del encabezado que abre la búsqueda global (también con Ctrl+K desde cualquier pantalla). */
export const HeaderSearch: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button type="button" onClick={onOpen} aria-label="Buscar en Stockly (Ctrl+K)"
    className="w-full h-9 pl-3 pr-2 flex items-center gap-2 text-xs text-text-muted bg-surface-2/60 hover:bg-surface-2 border border-border/80 hover:border-border-active rounded-lg transition-colors">
    <Search size={14} className="shrink-0" />
    <span className="flex-1 min-w-0 text-left truncate">Buscar productos, clientes, ventas…</span>
    <kbd className="hidden lg:inline shrink-0 text-[10px] font-medium border border-border rounded px-1.5 py-0.5 bg-surface">
      {isMac ? '⌘' : 'Ctrl'} K
    </kbd>
  </button>
);
