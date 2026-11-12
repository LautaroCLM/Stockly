import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, CheckCircle2, Loader2, Percent, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/formatters';
import type { Company } from '@/types';
import type { Category } from '@/features/inventario/types';
import type { Supplier } from '@/features/proveedores/types';
import { usePriceHistory } from './hooks/usePriceHistory';
import { usePricePreview } from './hooks/usePricePreview';
import { signedPercent, summarizePreview, validatePercent } from './priceMath';
import { describeScope } from './scopeText';
import type { PriceChangeParams } from './types';
import { ConfirmApplyModal } from './components/ConfirmApplyModal';
import { INITIAL_PRICE_FORM, PriceChangeForm } from './components/PriceChangeForm';
import type { PriceFormState } from './components/PriceChangeForm';
import { PriceHistory } from './components/PriceHistory';
import { PricePreviewTable } from './components/PricePreviewTable';

interface PreciosPageProps {
  company: Company;
  canView: boolean;
  canOperate: boolean;
  categories: Category[];
  suppliers: Supplier[];
  /** Recarga el catálogo de Inventario para que muestre los precios nuevos. */
  onPricesChanged: () => void;
}

type Notice = { kind: 'ok' | 'error'; message: string } | null;

/** Cambio de precios masivo: subir o bajar el precio de venta por porcentaje, con vista previa y reversión. */
export const PreciosPage: React.FC<PreciosPageProps> = ({ company, canView, canOperate, categories, suppliers, onPricesChanged }) => {
  const [form, setForm] = useState<PriceFormState>(INITIAL_PRICE_FORM);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const batchIdRef = useRef('');

  const history = usePriceHistory(company.id, canView);
  const params = useMemo<PriceChangeParams | null>(() => {
    const percent = validatePercent(form.percentText, form.direction) === null ? signedPercent(form.percentText, form.direction) : null;
    return percent === null ? null : { percent, step: form.step, categoryIds: form.categoryIds, supplierIds: form.supplierIds };
  }, [form.percentText, form.direction, form.step, form.categoryIds, form.supplierIds]);
  const preview = usePricePreview(company.id, canView && canOperate, params);

  // Con otro filtro cambia la lista de productos: se vuelven a tildar todos
  const paramsKey = params ? JSON.stringify(params) : '';
  useEffect(() => {
    setExcluded(new Set());
  }, [paramsKey]);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">No tenés acceso a este módulo. Pedile acceso al administrador.</p>
      </div>
    );
  }

  const rows = preview.rows ?? [];
  const summary = summarizePreview(rows, excluded);
  const scope = describeScope(form.categoryIds, form.supplierIds, categories, suppliers);
  const toggleProduct = (id: string) => setExcluded((prev) => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });

  const openConfirm = () => {
    batchIdRef.current = crypto.randomUUID();
    setNotice(null);
    setConfirming(true);
  };

  const applied = (updated: number) => {
    setConfirming(false);
    setNotice({ kind: 'ok', message: `Listo: se actualizó el precio de ${formatNumber(updated)} ${updated === 1 ? 'producto' : 'productos'}. Podés revertirlo desde el historial.` });
    setForm((f) => ({ ...f, percentText: '', note: '' }));
    onPricesChanged();
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center"><Percent size={20} className="text-primary" /></div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Cambio de precios</h1>
          <p className="text-xs text-text-muted">Subí o bajá el precio de venta de muchos productos a la vez. Antes de aplicar ves cómo quedaría cada uno.</p>
        </div>
      </div>

      {notice && (
        <div role={notice.kind === 'error' ? 'alert' : 'status'}
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${notice.kind === 'ok' ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
          {notice.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}<span>{notice.message}</span>
        </div>
      )}

      {canOperate ? (
        <>
          <PriceChangeForm value={form} categories={categories} suppliers={suppliers} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

          {preview.error && (
            <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
              <AlertTriangle size={14} /><span className="flex-1">{preview.error}</span>
              <Button variant="secondary" size="sm" onClick={() => void preview.reload()}>Reintentar</Button>
            </div>
          )}
          {params === null && <p className="py-6 text-center text-xs text-text-muted">Escribí el porcentaje para ver cómo quedarían los precios.</p>}
          {params !== null && preview.isLoading && <p className="py-6 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Calculando vista previa...</p>}
          {params !== null && !preview.isLoading && !preview.error && preview.rows !== null && rows.length === 0 && (
            <p className="py-6 text-center text-xs text-text-muted">No hay productos activos con precio para esos filtros, o el cambio no modifica ningún precio.</p>
          )}
          {params !== null && rows.length > 0 && (
            <section className="space-y-3" aria-label="Vista previa">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-text-secondary">
                  <strong className="text-text-primary">{formatNumber(summary.selected)}</strong> de {formatNumber(rows.length)} productos se van a cambiar
                  {summary.excluded > 0 ? ` (${formatNumber(summary.excluded)} los dejaste afuera)` : ''}.
                </p>
                <Button size="sm" disabled={summary.selected === 0 || preview.isLoading} onClick={openConfirm} className="gap-1.5">
                  <Percent size={14} /><span>Aplicar a {formatNumber(summary.selected)} productos</span>
                </Button>
              </div>
              <PricePreviewTable rows={rows} excluded={excluded} onToggle={toggleProduct}
                onToggleAll={(all) => setExcluded(all ? new Set() : new Set(rows.map((r) => r.productId)))} />
            </section>
          )}
        </>
      ) : (
        <p className="p-3 rounded-xl bg-surface border border-border text-xs text-text-muted">Podés ver el historial, pero no tenés permiso para cambiar precios.</p>
      )}

      <section className="space-y-3" aria-label="Historial">
        <h2 className="text-sm font-bold text-text-primary">Historial de cambios</h2>
        {history.error && <p role="alert" className="text-xs text-danger">{history.error}</p>}
        {history.batches === null ? (
          !history.error && <p className="py-6 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Cargando historial...</p>
        ) : history.batches.length === 0 ? (
          <p className="py-6 text-center text-xs text-text-muted">Todavía no se hicieron cambios de precios.</p>
        ) : (
          <PriceHistory batches={history.batches} canOperate={canOperate} onRevert={history.revert}
            onResult={(message, kind) => { setNotice({ kind, message }); if (kind === 'ok') onPricesChanged(); void preview.reload(); }}
            scopeText={(b) => describeScope(b.categoryIds, b.supplierIds, categories, suppliers)} />
        )}
      </section>

      <AnimatePresence>
        {confirming && params !== null && (
          <ConfirmApplyModal params={params} selected={summary.selected} scopeText={scope} onClose={() => setConfirming(false)}
            onConfirm={() => history.apply(batchIdRef.current, params, [...excluded], form.note)}
            onApplied={(updated) => { applied(updated); void preview.reload(); }} />
        )}
      </AnimatePresence>
    </div>
  );
};
