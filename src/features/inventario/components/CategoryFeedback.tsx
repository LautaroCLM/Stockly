import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';

export type CategoryAlert = { type: 'error' | 'success'; message: string } | null;

/** Error de carga de categorías y resultado de la última operación. */
export const CategoryFeedback: React.FC<{ loadError: string | null; alert: CategoryAlert }> = ({ loadError, alert }) => (
  <>
    {loadError && (
      <div className="p-3 rounded-xl border border-danger/30 bg-danger/10 text-xs text-danger flex items-center gap-2 animate-in fade-in">
        <AlertTriangle size={15} className="shrink-0" />
        <span>{loadError}</span>
      </div>
    )}
    {alert && (
      <div
        role={alert.type === 'error' ? 'alert' : 'status'}
        className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in ${
          alert.type === 'error'
            ? 'bg-danger/10 border-danger/30 text-danger'
            : 'bg-emerald-950/30 border-emerald-800/40 text-emerald-400'
        }`}
      >
        {alert.type === 'error' ? <AlertTriangle size={15} className="shrink-0" /> : <Check size={15} className="shrink-0" />}
        <span>{alert.message}</span>
      </div>
    )}
  </>
);
