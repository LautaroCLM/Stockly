import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { Ban, Copy, Loader2, Printer, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';
import type { Company } from '@/types';
import { useCompanyLogo } from '@/features/logo/hooks/useCompanyLogo';
import { useDocumentDetail } from '../hooks/useDocumentDetail';
import { formatDocumentNumber } from '../documentMath';
import { DOC_TYPE_LABELS, isThermal } from '../types';
import type { DocumentItem, DocumentRecord, DocumentSettings } from '../types';
import { DocumentSheet } from './DocumentSheet';
import { DocumentTicket } from './DocumentTicket';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  documentId: string;
  company: Company;
  settings: DocumentSettings;
  canOperate: boolean;
  onClose: () => void;
  onDuplicate: (doc: DocumentRecord, items: DocumentItem[]) => void;
  onVoid: (doc: DocumentRecord) => void;
}

const Body: React.FC<DocumentPreviewModalProps> = ({ documentId, company, settings, canOperate, onClose, onDuplicate, onVoid }) => {
  const { doc, items, error } = useDocumentDetail(company.id, documentId);
  const { logo } = useCompanyLogo(company.id);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const thermal = doc ? isThermal(doc.type) : true;
  const layout = doc && (thermal
    ? <DocumentTicket doc={doc} items={items} company={company} settings={settings} logo={logo} />
    : <DocumentSheet doc={doc} items={items} company={company} settings={settings} logo={logo} />);

  return (
    <>
      <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm print:hidden" onClick={onClose} />
        <m.div variants={modalPanelVariants} role="dialog" aria-modal="true" aria-label="Vista del documento"
          className={`relative w-full ${thermal ? 'max-w-lg' : 'max-w-4xl'} bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden`}>
          <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/60">
            <h2 className="text-sm font-bold text-text-primary">
              {doc ? `${DOC_TYPE_LABELS[doc.type]} ${formatDocumentNumber(doc.pointOfSale, doc.number)}` : 'Documento'}
            </h2>
            <button onClick={onClose} aria-label="Cerrar" className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
          </div>

          <div className="p-6 overflow-y-auto max-h-[70vh] bg-surface-2/20">
            {error && <p role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/25 text-danger text-xs">{error}</p>}
            {!doc && !error && <p className="py-12 text-center text-xs text-text-muted"><Loader2 size={16} className="inline animate-spin mr-2 text-primary" />Cargando documento...</p>}
            {layout}
          </div>

          <div className="p-4 px-6 border-t border-border bg-surface-2/60 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {doc && canOperate && (
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => onDuplicate(doc, items)}><Copy size={14} /><span>Duplicar</span></Button>
              )}
              {doc && canOperate && doc.status === 'active' && (
                <Button variant="secondary" size="sm" className="gap-1.5 text-danger" onClick={() => onVoid(doc)}><Ban size={14} /><span>Anular</span></Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cerrar</Button>
              <Button variant="primary" size="sm" disabled={!doc} onClick={() => window.print()} className="gap-1.5">
                <Printer size={14} /><span>{thermal ? 'Imprimir ticket (80 mm)' : 'Imprimir (A4)'}</span>
              </Button>
            </div>
          </div>
        </m.div>
      </m.div>
      {/* Copia solo para imprimir: fuera de #root para que salga solo el documento */}
      {doc && createPortal(<div id="print-root" className={thermal ? '' : 'print-a4'}>{layout}</div>, document.body)}
    </>
  );
};

/** Vista previa de un documento con su impresión (ticket de 80 mm o A4). */
export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <Body {...props} />}</AnimatePresence>
);
