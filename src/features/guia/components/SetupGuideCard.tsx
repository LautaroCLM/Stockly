import React from 'react';
import { ArrowRight, Check, Rocket, X } from 'lucide-react';
import type { RouteId } from '@/types';
import type { SetupStep } from '../setupSteps';

interface SetupGuideCardProps {
  steps: SetupStep[];
  doneCount: number;
  onNavigate: (route: RouteId) => void;
  onDismiss: () => void;
}

/** Guía de primeros pasos para una empresa nueva: qué falta cargar y un botón para ir a hacerlo. */
export const SetupGuideCard: React.FC<SetupGuideCardProps> = ({ steps, doneCount, onNavigate, onDismiss }) => {
  const nextId = steps.find((s) => !s.done)?.id;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <section aria-label="Primeros pasos" className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-surface to-surface p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary shrink-0">
            <Rocket size={19} />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Primeros pasos</h2>
            <p className="text-xs text-text-muted">Dejá tu empresa lista para vender en unos minutos.</p>
          </div>
        </div>
        <button type="button" onClick={onDismiss} title="Ocultar guía" aria-label="Ocultar guía"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2">
          <X size={16} />
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-text-muted">
          <span><strong className="text-text-primary">{doneCount}</strong> de {steps.length} pasos completos</span>
          <span className="tabular-nums">{percent}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="grid gap-2 sm:grid-cols-2">
        {steps.map((step, index) => {
          const isNext = step.id === nextId;
          return (
            <li key={step.id}
              className={`rounded-xl border p-3 flex items-start gap-3 ${isNext ? 'border-primary/50 bg-surface-2/80' : 'border-border bg-surface-2/40'}`}>
              <span aria-hidden className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                step.done ? 'bg-success/15 text-success border border-success/40' : 'bg-surface-3 text-text-muted border border-border'}`}>
                {step.done ? <Check size={13} /> : index + 1}
              </span>
              <div className="flex-1 min-w-0 space-y-1">
                <p className={`text-xs font-semibold ${step.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                  {step.title}<span className="sr-only">{step.done ? ' (hecho)' : ' (pendiente)'}</span>
                </p>
                {!step.done && <p className="text-[11px] text-text-muted">{step.description}</p>}
                {!step.done && (
                  <button type="button" onClick={() => onNavigate(step.route)}
                    className={`mt-1 inline-flex items-center gap-1 text-[11px] font-semibold ${isNext ? 'text-primary' : 'text-text-secondary'} hover:underline`}>
                    {step.actionLabel}<ArrowRight size={12} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
