import React from 'react';
import { Plus, RefreshCw, Search, ShieldAlert, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ComprasHeaderProps {
  companyName: string;
  isLoading: boolean;
  onReload: () => void;
  onNewPurchase: () => void;
  /** Sin permiso para registrar compras, no se muestra el botón. */
  canCreate?: boolean;
}

/** Título de Compras con recarga y alta de compra. */
export const ComprasHeader: React.FC<ComprasHeaderProps> = ({ companyName, isLoading, onReload, onNewPurchase, canCreate = true }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div>
      <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
        <ShoppingCart className="text-primary" size={22} />
        Compras a Proveedores
      </h1>
      <p className="text-xs text-text-muted">Registro de compras y abastecimiento de stock en {companyName}</p>
    </div>
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={onReload} disabled={isLoading} aria-label="Actualizar compras">
        <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
      </Button>
      {canCreate && (
        <Button variant="primary" size="sm" onClick={onNewPurchase} className="flex items-center gap-1.5">
          <Plus size={15} />
          <span>Nueva Compra</span>
        </Button>
      )}
    </div>
  </div>
);

/** Buscador de compras por número, proveedor o factura. */
export const ComprasSearchBar: React.FC<{ value: string; onChange: (value: string) => void }> = ({ value, onChange }) => (
  <div className="flex items-center gap-2 bg-surface p-2 rounded-xl border border-border">
    <Search size={16} className="text-text-muted ml-2 shrink-0" />
    <input
      type="text"
      aria-label="Buscar compras"
      placeholder="Buscar por número de compra, proveedor o factura..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex-1 bg-transparent text-xs text-text-primary focus:outline-none placeholder:text-text-muted"
    />
    {value && (
      <button onClick={() => onChange('')} className="text-[11px] text-text-muted hover:text-text-primary px-2">
        Limpiar
      </button>
    )}
  </div>
);

/** Aviso para quienes no tienen acceso a Compras (muestra costos de adquisición). */
export const ComprasAccessDenied: React.FC<{ companyName: string; onNavigateHome: () => void }> = ({ companyName, onNavigateHome }) => (
  <div className="flex-1 p-6 flex items-center justify-center">
    <div className="max-w-md w-full text-center space-y-4 p-8 bg-surface border border-border rounded-2xl shadow-xl">
      <div className="w-12 h-12 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger mx-auto">
        <ShieldAlert size={24} />
      </div>
      <h2 className="text-lg font-bold text-text-primary">Acceso Restringido</h2>
      <p className="text-xs text-text-muted">
        No tenés acceso al módulo de Compras a Proveedores en {companyName}. Pedile acceso al administrador.
      </p>
      <Button variant="secondary" size="sm" onClick={onNavigateHome}>Volver al Inicio</Button>
    </div>
  </div>
);
