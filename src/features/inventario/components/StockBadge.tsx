import React from 'react';
import { Product } from '../types';
import { Badge } from '@/components/ui/Badge';
import { AlertCircle, AlertTriangle } from 'lucide-react';

interface StockBadgeProps {
  product: Product;
}

export const StockBadge: React.FC<StockBadgeProps> = ({ product }) => {
  const { stock, minStock, unit } = product;

  if (stock < 0) {
    return (
      <Badge
        variant="danger"
        size="sm"
        className="font-bold flex items-center gap-1 bg-rose-500/20 text-rose-300 border-rose-500/40"
        title={`Stock negativo (${stock} ${unit}). Se requiere arqueo o reposición urgente.`}
      >
        <AlertCircle size={12} className="text-rose-400 shrink-0" />
        <span>Quiebre ({stock} {unit})</span>
      </Badge>
    );
  }

  if (stock === 0) {
    return (
      <Badge
        variant="danger"
        size="sm"
        className="font-medium flex items-center gap-1"
        title="Sin unidades disponibles en salón."
      >
        <span>Agotado (0 {unit})</span>
      </Badge>
    );
  }

  if (stock <= minStock) {
    return (
      <Badge
        variant="warning"
        size="sm"
        className="font-medium flex items-center gap-1"
        title={`Stock bajo el mínimo definido (${minStock} ${unit}).`}
      >
        <AlertTriangle size={11} className="text-amber-400 shrink-0" />
        <span>Bajo ({stock} {unit})</span>
      </Badge>
    );
  }

  return (
    <span className="text-xs font-medium text-text-primary tabular-nums">
      {stock} <span className="text-text-muted text-[11px] font-normal">{unit}</span>
    </span>
  );
};
