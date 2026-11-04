import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import type { CashMovement } from '../types';

/** Ingresos y retiros manuales del turno abierto. */
export const CashMovementsList: React.FC<{ movements: CashMovement[] }> = ({ movements }) => (
  <Card>
    <CardContent className="p-5 text-xs">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Ingresos y retiros del turno</h2>
      {movements.length === 0 ? (
        <p className="text-text-muted">Todavía no hay ingresos ni retiros manuales en este turno.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-[11px] uppercase tracking-wide text-text-muted">
              <tr>
                <th className="py-2 pr-3 font-semibold">Fecha y hora</th>
                <th className="py-2 pr-3 font-semibold">Tipo</th>
                <th className="py-2 pr-3 font-semibold">Motivo</th>
                <th className="py-2 pr-3 font-semibold">Usuario</th>
                <th className="py-2 font-semibold text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id} className="border-t border-border/50">
                  <td className="py-2 pr-3 text-text-secondary whitespace-nowrap">{formatDateTime(movement.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={movement.movementType === 'in' ? 'primary' : 'warning'}>
                      {movement.movementType === 'in' ? 'Ingreso' : 'Retiro'}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-text-primary break-words">{movement.reason}</td>
                  <td className="py-2 pr-3 text-text-secondary">{movement.createdByName}</td>
                  <td className="py-2 text-right tabular-nums text-text-primary">
                    {movement.movementType === 'in' ? '+' : '-'} {formatCurrency(movement.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </CardContent>
  </Card>
);
