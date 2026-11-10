import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, FilePlus2, FileText, Loader2, Search, Settings2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { localDateInputValue } from '@/lib/localDate';
import type { Company } from '@/types';
import type { Product } from '@/features/inventario/types';
import type { Customer } from '@/features/clientes/types';
import { useDocuments } from './hooks/useDocuments';
import { useDocumentSettings } from './hooks/useDocumentSettings';
import { documentToForm } from './duplicate';
import { DOC_TYPES, DOC_TYPE_HINTS, DOC_TYPE_LABELS } from './types';
import type { DocType, DocumentFilters, DocumentFormValues, DocumentRecord } from './types';
import { DocumentFormModal } from './components/DocumentFormModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { DocumentSettingsModal } from './components/DocumentSettingsModal';
import { DocumentsTable } from './components/DocumentsTable';
import { VoidDocumentModal } from './components/VoidDocumentModal';

interface DocumentosPageProps {
  company: Company;
  canView: boolean;
  canOperate: boolean;
  isMasterAdmin: boolean;
  products: Product[];
  customers: Customer[];
}

type Dialog =
  | { kind: 'new'; type: DocType; initial?: DocumentFormValues }
  | { kind: 'void'; doc: DocumentRecord }
  | { kind: 'settings' }
  | null;

const INPUT = 'h-9 px-3 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary';

/** Tickets, presupuestos, remitos X y garantías: comprobantes internos que no cuentan como venta. */
export const DocumentosPage: React.FC<DocumentosPageProps> = ({ company, canView, canOperate, isMasterAdmin, products, customers }) => {
  const [filters, setFilters] = useState<DocumentFilters>({ type: 'all', query: '', includeVoided: false });
  const data = useDocuments(company.id, canView, filters);
  const issuer = useDocumentSettings(company.id, canView);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [lastPreviewId, setLastPreviewId] = useState('');
  const today = localDateInputValue();

  const openPreview = (id: string) => {
    setLastPreviewId(id);
    setPreviewId(id);
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">No tenés acceso a este módulo. Pedile acceso al administrador.</p>
      </div>
    );
  }

  const list = data.documents;
  const hasFilters = filters.type !== 'all' || filters.query.trim() !== '' || filters.includeVoided;

  return (
    <div className="space-y-5 max-w-6xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center"><FileText size={20} className="text-primary" /></div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Documentos</h1>
            <p className="text-xs text-text-muted">Tickets, presupuestos, remitos y garantías. No cuentan como venta ni mueven el stock.</p>
          </div>
        </div>
        {isMasterAdmin && (
          <Button variant="secondary" size="sm" className="gap-1.5 h-9" onClick={() => setDialog({ kind: 'settings' })}>
            <Settings2 size={14} /><span>Datos para comprobantes</span>
          </Button>
        )}
      </div>

      {canOperate && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5" aria-label="Crear un documento">
          {DOC_TYPES.map((type) => (
            <button key={type} onClick={() => setDialog({ kind: 'new', type })}
              className="text-left p-3.5 rounded-xl bg-surface border border-border hover:border-primary/50 hover:bg-surface-2/50 transition-colors focus:outline-none focus-visible:border-primary">
              <span className="flex items-center gap-2 text-sm font-bold text-text-primary"><FilePlus2 size={15} className="text-primary" />{DOC_TYPE_LABELS[type]}</span>
              <span className="block mt-1 text-[11px] text-text-muted leading-snug">{DOC_TYPE_HINTS[type]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input aria-label="Buscar por cliente" placeholder="Buscar por cliente" value={filters.query} className={`${INPUT} pl-8 w-56`}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} />
        </div>
        <select aria-label="Tipo de documento" value={filters.type} className={`${INPUT} cursor-pointer`}
          onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value as DocType | 'all' }))}>
          <option value="all">Todos los tipos</option>
          {DOC_TYPES.map((type) => <option key={type} value={type}>{DOC_TYPE_LABELS[type]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input type="checkbox" checked={filters.includeVoided} onChange={(e) => setFilters((f) => ({ ...f, includeVoided: e.target.checked }))} />
          Mostrar anulados
        </label>
      </div>

      {data.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} /><span className="flex-1">{data.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void data.reload()}>Reintentar</Button>
        </div>
      )}

      {list === null ? (
        !data.error && <p className="py-12 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Cargando documentos...</p>
      ) : list.length === 0 ? (
        <p className="py-12 text-center text-xs text-text-muted">
          {hasFilters ? 'No hay documentos con esos filtros.' : canOperate ? 'Todavía no emitiste documentos. Elegí un tipo arriba para crear el primero.' : 'Todavía no hay documentos emitidos.'}
        </p>
      ) : (
        <DocumentsTable documents={list} onOpen={(doc) => openPreview(doc.id)} />
      )}

      <AnimatePresence>
        {dialog?.kind === 'new' && (
          <DocumentFormModal type={dialog.type} initial={dialog.initial} today={today} products={products} customers={customers}
            onClose={() => setDialog(null)} onSubmit={data.createDocument}
            onCreated={(created) => { setDialog(null); openPreview(created.documentId); }} />
        )}
        {dialog?.kind === 'void' && (
          <VoidDocumentModal doc={dialog.doc} onClose={() => setDialog(null)} onVoid={data.voidDocument} onVoided={() => setDialog(null)} />
        )}
        {dialog?.kind === 'settings' && (
          <DocumentSettingsModal initial={issuer.settings} onClose={() => setDialog(null)} onSave={issuer.save} />
        )}
      </AnimatePresence>

      <DocumentPreviewModal isOpen={previewId !== null && dialog === null} documentId={previewId ?? lastPreviewId} company={company}
        settings={issuer.settings} canOperate={canOperate} onClose={() => setPreviewId(null)}
        onDuplicate={(doc, items) => { setPreviewId(null); setDialog({ kind: 'new', type: doc.type, initial: documentToForm(doc, items, today) }); }}
        onVoid={(doc) => setDialog({ kind: 'void', doc })} />
    </div>
  );
};
