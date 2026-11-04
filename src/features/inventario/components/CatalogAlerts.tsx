import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CatalogAlertsProps {
  error: string | null;
  syncWarning: string | null;
  onReload?: () => void;
}

/** Avisos del catálogo: error de carga y operación confirmada pendiente de sincronizar. */
export const CatalogAlerts: React.FC<CatalogAlertsProps> = ({ error, syncWarning, onReload }) => (
  <>
    {error && (
      <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center justify-between gap-2 animate-in fade-in">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}
            className="h-7 text-xs border-danger/30 hover:bg-danger/20 text-danger shrink-0 gap-1.5">
            <RotateCcw size={13} />
            Reintentar
          </Button>
        )}
      </div>
    )}

    {syncWarning && (
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center justify-between gap-2 animate-in fade-in">
        <div className="flex items-center gap-2">
          <AlertTriangle size={15} className="shrink-0 text-amber-400" />
          <span>{syncWarning}</span>
        </div>
        {onReload && (
          <Button variant="outline" size="sm" onClick={onReload}
            className="h-7 text-xs border-amber-500/30 hover:bg-amber-500/20 text-amber-300 shrink-0 gap-1.5">
            <RotateCcw size={13} />
            Reintentar recarga
          </Button>
        )}
      </div>
    )}
  </>
);
