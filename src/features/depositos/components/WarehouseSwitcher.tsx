import React from 'react';
import { Warehouse as WarehouseIcon } from 'lucide-react';
import type { WarehousesState } from '../hooks/useWarehouses';

/** Encabezado: depósito de esta PC. Solo aparece si la empresa tiene más de un depósito activo. */
export const WarehouseSwitcher: React.FC<{ warehouses: WarehousesState }> = ({ warehouses }) => {
  if (!warehouses.isMulti || !warehouses.current) return null;
  return (
    <label className="hidden sm:flex items-center gap-1.5 h-9 pl-2.5 pr-1 rounded-lg border border-border bg-surface-2 text-xs text-text-secondary"
      title="Depósito de esta PC: las ventas, compras, ajustes y conteos hechos acá mueven el stock de este depósito">
      <WarehouseIcon size={14} className="text-primary shrink-0" />
      <span className="hidden lg:inline">Depósito</span>
      <select aria-label="Depósito de esta PC" value={warehouses.current.id} onChange={(e) => warehouses.choose(e.target.value)}
        className="h-7 bg-transparent text-text-primary font-semibold focus:outline-none cursor-pointer">
        {warehouses.active.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
    </label>
  );
};
