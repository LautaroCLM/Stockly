import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { Button } from '@/components/ui/Button';
import { buildImportPlan } from '../excel/buildImport';
import type { ImportOptions } from '../excel/buildImport';
import { detectMapping } from '../excel/columns';
import type { ColumnMapping, ImportField } from '../excel/columns';
import { readSpreadsheet } from '../excel/excelIO';
import { importInventoryRpc } from '../api/inventoryImportApi';
import type { InventoryImportResult } from '../api/inventoryImportApi';
import type { Product } from '../types';
import { ImportMappingTable } from './ImportMappingTable';
import { ImportPlanSummary } from './ImportPlanSummary';

interface ImportInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  products: Product[];
  categoryNames: string[];
  /** Se llama al terminar bien, para recargar el inventario. */
  onImported: () => void;
}

type Stage = 'pick' | 'map' | 'done';

const DEFAULT_OPTIONS: ImportOptions = { matchBy: 'sku', onExisting: 'update', createCategories: true };

/** Importar productos desde Excel o CSV: elegir el archivo, confirmar las columnas y listo. */
const ImportInventoryModalBody: React.FC<ImportInventoryModalProps> = ({ onClose, companyId, products, categoryNames, onImported }) => {
  const [stage, setStage] = useState<Stage>('pick');
  const [fileName, setFileName] = useState('');
  const [table, setTable] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [acceptIssues, setAcceptIssues] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<{ message: string; uncertain?: boolean } | null>(null);
  const [result, setResult] = useState<InventoryImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Misma clave mientras no cambie nada: reintentar tras un corte no suma el stock dos veces
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const existing = useMemo(() => products.map((p) => ({ sku: p.sku, name: p.name, unit: p.unit })), [products]);
  const plan = useMemo(
    () => (stage === 'map' ? buildImportPlan(table, mapping, options, existing, categoryNames) : null),
    [stage, table, mapping, options, existing, categoryNames]
  );
  const hasSkuColumn = mapping.sku !== undefined;
  const hasIssues = (plan?.issues.length ?? 0) > 0;
  const blocked = !plan || plan.issues.some((i) => i.row === 0) || plan.rows.length === 0 || (hasIssues && !acceptIssues);

  useEffect(() => {
    idempotencyKeyRef.current = crypto.randomUUID();
  }, [table, mapping, options, acceptIssues]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isImporting && !isReading) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isImporting, isReading, onClose]);

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setIsReading(true);
    setError(null);
    try {
      const data = await readSpreadsheet(file);
      const detected = detectMapping(data[0] ?? []);
      setTable(data);
      setMapping(detected);
      setOptions({ ...DEFAULT_OPTIONS, matchBy: detected.sku !== undefined ? 'sku' : 'name' });
      setAcceptIssues(false);
      setFileName(file.name);
      setStage('map');
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'No se pudo leer el archivo.' });
    } finally {
      setIsReading(false);
    }
  };

  const assign = (column: number, field: ImportField | null) => {
    setMapping((previous) => {
      const next: ColumnMapping = {};
      for (const [key, index] of Object.entries(previous) as [ImportField, number][]) {
        // Un campo va a una sola columna y una columna a un solo campo
        if (index !== column && key !== field) next[key] = index;
      }
      if (field) next[field] = column;
      if (next.sku === undefined) setOptions((o) => ({ ...o, matchBy: 'name' }));
      else if (previous.sku === undefined) setOptions((o) => ({ ...o, matchBy: 'sku' }));
      return next;
    });
  };

  const submit = async () => {
    if (!plan || blocked) return;
    setIsImporting(true);
    setError(null);
    const outcome = await importInventoryRpc(companyId, plan.rows, options, idempotencyKeyRef.current);
    setIsImporting(false);
    if (outcome.ok) {
      setResult(outcome.result);
      setStage('done');
      onImported();
    } else {
      setError({ message: outcome.message, uncertain: outcome.uncertain });
    }
  };

  const busy = isImporting || isReading;
  return (
    <ModalFrame ariaLabel="Importar productos desde Excel" onBackdropClick={() => !busy && onClose()} panelClassName="max-w-3xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary"><FileSpreadsheet size={18} /></div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Importar desde Excel</h2>
            <span className="text-xs text-text-muted">{stage === 'map' ? fileName : 'Sumá muchos productos de una vez'}</span>
          </div>
        </div>
        <button onClick={onClose} disabled={busy} aria-label="Cerrar" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 disabled:opacity-50"><X size={18} /></button>
      </div>

      <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
        {stage === 'pick' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragging(false); void loadFile(e.dataTransfer.files[0]); }}
              className={`rounded-2xl border-2 border-dashed p-8 text-center space-y-3 transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'border-border'}`}
            >
              {isReading ? <Loader2 size={28} className="mx-auto animate-spin text-primary" /> : <Upload size={28} className="mx-auto text-text-muted" />}
              <p className="text-sm font-semibold text-text-primary">{isReading ? 'Leyendo el archivo...' : 'Arrastrá tu archivo acá o elegilo'}</p>
              <p className="text-xs text-text-muted leading-relaxed">Excel (.xlsx) o CSV, con una fila de encabezados y hasta 2.000 productos.</p>
              <input ref={fileInputRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" aria-label="Archivo a importar"
                onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button variant="primary" size="sm" disabled={isReading} onClick={() => fileInputRef.current?.click()}>Elegir archivo</Button>
            </div>
            <p className="text-[11px] text-text-muted leading-relaxed">
              Consejo: exportá tu inventario actual, editalo en Excel (agregá filas o cambiá el stock) e importalo de nuevo.
              Después vas a poder elegir qué columnas importar.
            </p>
          </>
        )}

        {stage === 'map' && plan && (
          <>
            <p className="text-xs text-text-secondary leading-relaxed">
              Revisá a qué dato corresponde cada columna. Las que pongas en <strong className="text-text-primary">No importar</strong> no se tocan.
            </p>
            <ImportMappingTable table={table} mapping={mapping} disabled={busy} onAssign={assign} />
            <ImportPlanSummary plan={plan} options={options} hasSkuColumn={hasSkuColumn} hasStockColumn={mapping.stock !== undefined}
              disabled={busy} acceptIssues={acceptIssues} onOptions={setOptions} onAcceptIssues={setAcceptIssues} />
          </>
        )}

        {stage === 'done' && result && (
          <div className="py-4 text-center space-y-3">
            <CheckCircle2 size={36} className="mx-auto text-emerald-400" />
            <p className="text-sm font-bold text-text-primary">Importación terminada</p>
            <ul className="text-xs text-text-secondary space-y-1">
              <li>{result.created} {result.created === 1 ? 'producto nuevo' : 'productos nuevos'}</li>
              <li>{result.updated} {result.updated === 1 ? 'producto actualizado' : 'productos actualizados'}</li>
              {result.skipped > 0 && <li>{result.skipped} {result.skipped === 1 ? 'omitido' : 'omitidos'}</li>}
              {result.stockEntries > 0 && <li>Stock sumado a {result.stockEntries} {result.stockEntries === 1 ? 'producto' : 'productos'} (queda en Movimientos de Stock)</li>}
              {result.categoriesCreated > 0 && <li>{result.categoriesCreated} {result.categoriesCreated === 1 ? 'categoría creada' : 'categorías creadas'}</li>}
            </ul>
          </div>
        )}

        {error && (
          <div role="alert" className={`p-3 rounded-xl border text-xs leading-relaxed ${error.uncertain ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-danger/10 border-danger/25 text-danger'}`}>
            {error.message}
          </div>
        )}
      </div>

      <div className="p-4 px-6 border-t border-border bg-surface-2/40 flex justify-end gap-2.5">
        {stage === 'map' && (
          <>
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setStage('pick'); setError(null); }}>Elegir otro archivo</Button>
            <Button variant="primary" size="sm" disabled={busy || blocked} onClick={() => void submit()} className="gap-1.5">
              {isImporting && <Loader2 size={14} className="animate-spin" />}
              <span>Importar {plan ? plan.rows.length + plan.toSkip : 0} {plan && plan.rows.length + plan.toSkip === 1 ? 'producto' : 'productos'}</span>
            </Button>
          </>
        )}
        {stage !== 'map' && <Button variant={stage === 'done' ? 'primary' : 'secondary'} size="sm" disabled={busy} onClick={onClose}>{stage === 'done' ? 'Listo' : 'Cancelar'}</Button>}
      </div>
    </ModalFrame>
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la salida. */
export const ImportInventoryModal: React.FC<ImportInventoryModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <ImportInventoryModalBody {...props} />}</AnimatePresence>
);
