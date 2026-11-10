import React from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { ImportOptions, ImportPlan } from '../excel/buildImport';

const MAX_ISSUES_SHOWN = 8;

interface ImportPlanSummaryProps {
  plan: ImportPlan;
  options: ImportOptions;
  hasSkuColumn: boolean;
  hasStockColumn: boolean;
  disabled?: boolean;
  /** Se marca para aceptar que las filas con problemas queden afuera. */
  acceptIssues: boolean;
  onOptions: (options: ImportOptions) => void;
  onAcceptIssues: (accepted: boolean) => void;
}

const RADIO = 'flex items-start gap-2 p-2.5 rounded-lg bg-surface-2 border border-border cursor-pointer text-xs';

/** Qué va a pasar con el archivo: opciones, conteo por tipo y los problemas por fila. */
export const ImportPlanSummary: React.FC<ImportPlanSummaryProps> = ({
  plan, options, hasSkuColumn, hasStockColumn, disabled, acceptIssues, onOptions, onAcceptIssues,
}) => {
  const blocking = plan.issues.some((i) => i.row === 0);
  const rowIssues = plan.issues.filter((i) => i.row !== 0);

  return (
    <div className="space-y-3 text-xs">
      <div className="grid sm:grid-cols-2 gap-2">
        <fieldset className="space-y-1.5" disabled={disabled}>
          <legend className="font-semibold text-text-secondary mb-1">Si el producto ya existe</legend>
          <label className={RADIO}>
            <input type="radio" name="on-existing" checked={options.onExisting === 'update'} onChange={() => onOptions({ ...options, onExisting: 'update' })} className="mt-0.5" />
            <span className="text-text-secondary leading-relaxed"><strong className="text-text-primary">Actualizar</strong> los datos elegidos y sumar el stock.</span>
          </label>
          <label className={RADIO}>
            <input type="radio" name="on-existing" checked={options.onExisting === 'skip'} onChange={() => onOptions({ ...options, onExisting: 'skip' })} className="mt-0.5" />
            <span className="text-text-secondary leading-relaxed"><strong className="text-text-primary">Omitir</strong>: no tocar los que ya existen.</span>
          </label>
        </fieldset>
        <fieldset className="space-y-1.5" disabled={disabled || !hasSkuColumn}>
          <legend className="font-semibold text-text-secondary mb-1">Reconocer cada producto por</legend>
          <label className={RADIO}>
            <input type="radio" name="match-by" checked={options.matchBy === 'sku'} onChange={() => onOptions({ ...options, matchBy: 'sku' })} className="mt-0.5" />
            <span className="text-text-secondary">SKU / Código</span>
          </label>
          <label className={RADIO}>
            <input type="radio" name="match-by" checked={options.matchBy === 'name'} onChange={() => onOptions({ ...options, matchBy: 'name' })} className="mt-0.5" />
            <span className="text-text-secondary">Nombre del producto</span>
          </label>
        </fieldset>
      </div>

      {!hasSkuColumn && (
        <p className="flex items-start gap-2 text-text-muted leading-relaxed"><Info size={14} className="shrink-0 mt-0.5 text-primary" />
          Sin columna de SKU, los productos se reconocen por nombre y a los nuevos se les asigna un código automático (IMP-0001, IMP-0002...).</p>
      )}
      <p className="flex items-start gap-2 text-text-muted leading-relaxed"><Info size={14} className="shrink-0 mt-0.5 text-primary" />
        {hasStockColumn
          ? 'El stock del archivo se suma al que ya tiene cada producto (por ejemplo, 20 + 4 = 24) y queda registrado en el historial. Los productos nuevos empiezan con el stock del archivo.'
          : 'No elegiste una columna de stock: las existencias de los productos que ya existen no cambian y los nuevos quedan en 0.'}
      </p>

      {plan.newCategories.length > 0 && (
        <label className={RADIO}>
          <input type="checkbox" checked={options.createCategories} disabled={disabled} onChange={(e) => onOptions({ ...options, createCategories: e.target.checked })} className="mt-0.5" />
          <span className="text-text-secondary leading-relaxed">
            {plan.newCategories.length === 1 ? 'Crear la categoría nueva del archivo' : `Crear las ${plan.newCategories.length} categorías nuevas del archivo`}: {plan.newCategories.slice(0, 4).join(', ')}{plan.newCategories.length > 4 ? '...' : ''}.
          </span>
        </label>
      )}

      <div className="flex flex-wrap gap-2" aria-live="polite">
        <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">{plan.toCreate} {plan.toCreate === 1 ? 'nuevo' : 'nuevos'}</span>
        <span className="px-2.5 py-1 rounded-full bg-primary/10 border border-primary/25 text-text-primary">{plan.toUpdate} {plan.toUpdate === 1 ? 'existente a actualizar' : 'existentes a actualizar'}</span>
        {plan.toSkip > 0 && <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-secondary">{plan.toSkip} {plan.toSkip === 1 ? 'omitido' : 'omitidos'}</span>}
        {plan.stockEntries > 0 && <span className="px-2.5 py-1 rounded-full bg-surface-2 border border-border text-text-secondary">stock para {plan.stockEntries}</span>}
        {rowIssues.length > 0 && <span className="px-2.5 py-1 rounded-full bg-danger/10 border border-danger/30 text-danger">{rowIssues.length} {rowIssues.length === 1 ? 'con problemas' : 'con problemas'}</span>}
      </div>

      {blocking && plan.issues.filter((i) => i.row === 0).map((i) => (
        <p key={i.message} role="alert" className="flex items-start gap-2 p-2.5 rounded-lg bg-danger/10 border border-danger/30 text-danger leading-relaxed">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />{i.message}</p>
      ))}

      {rowIssues.length > 0 && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 space-y-2">
          <p className="font-semibold text-danger flex items-center gap-2"><AlertTriangle size={14} />Estas filas no se pueden importar:</p>
          <ul className="space-y-1 text-text-secondary">
            {rowIssues.slice(0, MAX_ISSUES_SHOWN).map((i) => <li key={`${i.row}-${i.message}`}><strong className="text-text-primary">Fila {i.row}:</strong> {i.message}.</li>)}
            {rowIssues.length > MAX_ISSUES_SHOWN && <li className="text-text-muted">... y {rowIssues.length - MAX_ISSUES_SHOWN} más.</li>}
          </ul>
          {plan.rows.length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer text-text-secondary">
              <input type="checkbox" checked={acceptIssues} disabled={disabled} onChange={(e) => onAcceptIssues(e.target.checked)} className="mt-0.5" />
              <span>Importar igual las {plan.rows.length} filas correctas y dejar estas afuera. Corregilas en el archivo y volvé a importarlo si las necesitás.</span>
            </label>
          )}
        </div>
      )}

      {!blocking && rowIssues.length === 0 && plan.rows.length > 0 && (
        <p className="flex items-center gap-2 text-emerald-300"><CheckCircle2 size={14} />El archivo está listo para importar.</p>
      )}
    </div>
  );
};
