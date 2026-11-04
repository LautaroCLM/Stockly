import React from 'react';
import { Boxes, HelpCircle, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface NegativeStockPolicyCardProps {
  allowNegative: boolean;
  isMasterAdmin: boolean;
  isLoading: boolean;
  onChangePolicy: () => void;
}

/** Política de stock negativo: cómo funciona hoy y, para administradores, cómo cambiarla. */
export const NegativeStockPolicyCard: React.FC<NegativeStockPolicyCardProps> = ({ allowNegative, isMasterAdmin, isLoading, onChangePolicy }) => (
  <Card className="overflow-hidden border-border/80">
    <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Boxes className="w-5 h-5 text-primary" />
        <div>
          <h2 className="text-sm font-bold text-text-primary">Control de Existencias y Stock Negativo</h2>
          <p className="text-[11px] text-text-secondary">Regla que determina si las ventas y salidas pueden consumir más unidades de las registradas.</p>
        </div>
      </div>
      {allowNegative ? (
        <Badge variant="warning" size="sm">Stock Negativo Habilitado</Badge>
      ) : (
        <Badge variant="success" size="sm">Control Estricto Activado</Badge>
      )}
    </div>

    <CardContent className="p-4 sm:p-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-surface-2/50 border border-border/60 space-y-2">
          <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
            <HelpCircle size={14} className="text-text-muted" />
            <span>¿Cómo opera este parámetro?</span>
          </span>
          <p className="text-xs text-text-secondary leading-relaxed">
            {allowNegative
              ? 'Actualmente, el catálogo permite saldos menores a cero. Las operaciones continuarán confirmándose aun cuando el stock físico no haya sido ingresado previamente.'
              : 'Actualmente, el sistema bloquea cualquier venta o salida que exceda las existencias físicas registradas en el catálogo.'}
          </p>
        </div>
        <div className="p-4 rounded-xl bg-surface-2/50 border border-border/60 flex flex-col justify-between space-y-3">
          <div>
            <span className="text-xs font-semibold text-text-primary">Quién puede cambiarla</span>
            <p className="text-xs text-text-secondary mt-1">
              {isMasterAdmin
                ? 'Como Administrador podés modificar esta política en cualquier momento indicando el motivo.'
                : 'Solo los administradores de la empresa pueden cambiar esta política.'}
            </p>
          </div>
          {isMasterAdmin && (
            <div className="pt-2">
              <Button variant={allowNegative ? 'outline' : 'primary'} size="sm" onClick={onChangePolicy} disabled={isLoading} className="text-xs w-full sm:w-auto">
                <ShieldCheck size={14} className="mr-1.5" />
                <span>{allowNegative ? 'Activar Control Estricto (Bloquear bajo cero)' : 'Habilitar Stock Negativo (Modo Flexible)'}</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </CardContent>
  </Card>
);
