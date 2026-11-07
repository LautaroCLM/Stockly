import React from 'react';
import { ArrowLeft, Construction, Sparkles, Tractor, UserCheck } from 'lucide-react';
import type { RouteId } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';

interface EmptyStateProps {
  routeId: RouteId;
  onNavigateHome: () => void;
}

interface RouteMeta {
  title: string;
  description: string;
  phase: string;
  icon: React.ReactNode;
  features: string[];
}

/** Módulos del menú que todavía no están construidos. */
const PLANNED_MODULES: Partial<Record<RouteId, RouteMeta>> = {
  maquinas: {
    title: 'Máquinas',
    description:
      'Fichas de las máquinas y equipos, con su consumo, producción y mantenimiento.',
    phase: 'Fase 5',
    icon: <Tractor className="w-8 h-8 text-orange-400" />,
    features: [
      'Consumo de combustible y producción',
      'Mantenimientos preventivos y correctivos, con próximos vencimientos',
      'Historial, costos y estadísticas de rendimiento',
    ],
  },
  personal: {
    title: 'Empleados',
    description:
      'Plantel de empleados, adelantos de sueldo, liquidación de haberes y comisiones por venta.',
    phase: 'Fase 5',
    icon: <UserCheck className="w-8 h-8 text-emerald-400" />,
    features: [
      'Legajos con roles y permisos específicos',
      'Liquidaciones y registro de adelantos y descuentos',
      'Productividad por colaborador',
    ],
  },
};

const FALLBACK: RouteMeta = {
  title: 'Módulo en preparación',
  description: 'Esta sección todavía no está disponible.',
  phase: 'Próximamente',
  icon: <Construction className="w-8 h-8 text-text-muted" />,
  features: [],
};

/** Pantalla de "próximamente" para un módulo del menú que todavía no existe. */
export const EmptyState: React.FC<EmptyStateProps> = ({ routeId, onNavigateHome }) => {
  const meta = PLANNED_MODULES[routeId] ?? FALLBACK;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5 shadow-lg shadow-black/40">
        {meta.icon}
      </div>
      <div className="inline-flex items-center gap-2 mb-3">
        <Badge variant="accent">{meta.phase}</Badge>
        <Badge variant="neutral">En preparación</Badge>
      </div>
      <h2 className="text-xl font-bold text-text-primary tracking-tight mb-2">{meta.title}</h2>
      <p className="text-sm text-text-secondary max-w-lg mb-6 leading-relaxed">{meta.description}</p>

      {meta.features.length > 0 && (
        <div className="w-full bg-surface-2/60 border border-border rounded-xl p-4 text-left mb-6">
          <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-2.5">
            <Sparkles size={14} className="text-primary" />
            Capacidades planificadas para este módulo:
          </span>
          <ul className="space-y-1.5">
            {meta.features.map((feature) => (
              <li key={feature} className="text-xs text-text-secondary flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="secondary" size="md" onClick={onNavigateHome}>
        <ArrowLeft size={14} />
        Volver al Dashboard
      </Button>
    </div>
  );
};
