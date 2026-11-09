import React from 'react';
import { AlertTriangle, Clock, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import { useClockRoster } from './hooks/useClockRoster';
import { TodayTab } from './components/TodayTab';

interface FichajePageProps {
  company: Company;
}

/** Fichaje para cuentas de empleado: marcar entrada y salida de los compañeros, sin ver datos personales. */
export const FichajePage: React.FC<FichajePageProps> = ({ company }) => {
  const clock = useClockRoster(company.id);

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <Clock size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Fichaje</h1>
            <p className="text-xs text-text-muted">Marcá la entrada y la salida del personal de {company.name}. La hora la registra el sistema.</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void clock.reload()} disabled={clock.isLoading} className="gap-1.5 h-9">
          <RotateCcw size={14} className={clock.isLoading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </Button>
      </div>

      {clock.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{clock.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void clock.reload()}>Reintentar</Button>
        </div>
      )}

      {clock.roster === null ? (
        !clock.error && (
          <p className="py-12 text-center text-xs text-text-muted">
            <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
            Cargando personal...
          </p>
        )
      ) : (
        <TodayTab
          employees={clock.roster.employees}
          schedules={clock.roster.schedules}
          today={clock.roster.today}
          onClockIn={clock.clockIn}
          onClockOut={clock.clockOut}
          emptyMessage="Todavía no hay empleados cargados. Pedile al administrador que los agregue."
        />
      )}
    </div>
  );
};
