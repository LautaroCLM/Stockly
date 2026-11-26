import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { CheckCircle, Printer, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import type { Sale } from '@/features/inventario/types';
import { useCompanyLogo } from '@/features/logo/hooks/useCompanyLogo';
import { useDocumentSettings } from '@/features/documentos/hooks/useDocumentSettings';
import type { ReturnReceiptData } from '../returnReceiptTypes';
import { ReturnTicket } from './ReturnTicket';

interface ReturnReceiptModalProps {
  sale: Sale | null;
  company: Company;
  /** Devoluciones de la venta; arranca mostrando la que tenga este número (o la última). */
  returns: ReturnReceiptData[];
  initialNumber?: string;
  onClose: () => void;
}

const Body: React.FC<ReturnReceiptModalProps & { sale: Sale }> = ({ sale, company, returns, initialNumber, onClose }) => {
  const { settings } = useDocumentSettings(company.id, true);
  const { logo } = useCompanyLogo(company.id);
  // Arranca en la devolución pedida o, si no se indica, en la más reciente
  const [selected, setSelected] = useState(() => {
    const found = returns.findIndex((r) => r.returnNumber === initialNumber);
    return found >= 0 ? found : returns.length - 1;
  });
  const data = returns[selected];
  if (!data) return null;

  return (
    <ModalFrame ariaLabel={`Comprobante de devolución ${data.returnNumber}`} onBackdropClick={onClose} panelClassName="max-w-lg print:hidden">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/60 print:hidden">
        <div className="flex items-center gap-2">
          <CheckCircle size={18} className="text-emerald-400" />
          <h2 className="text-sm font-bold text-text-primary">Comprobante de devolución</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
      </div>
      {returns.length > 1 && (
        <div className="px-6 pt-3 flex flex-wrap gap-1.5 print:hidden" role="tablist" aria-label="Devoluciones de la venta">
          {returns.map((r, i) => (
            <button key={r.returnNumber} type="button" role="tab" aria-selected={r === data} onClick={() => setSelected(i)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold ${r === data ? 'bg-primary text-white' : 'bg-surface-2 text-text-muted hover:text-text-primary'}`}>
              {r.returnNumber}
            </button>
          ))}
        </div>
      )}
      <div className="p-6 overflow-y-auto max-h-[70vh]">
        <ReturnTicket data={data} sale={sale} company={company} settings={settings} logo={logo} />
      </div>
      <div className="p-4 px-6 border-t border-border bg-surface-2/60 flex items-center justify-between gap-3 print:hidden">
        <Button variant="secondary" size="md" onClick={onClose}>Cerrar</Button>
        <Button variant="primary" size="md" onClick={() => window.print()} className="gap-2 shadow-md shadow-primary/25">
          <Printer size={16} /><span>Imprimir comprobante (80mm)</span>
        </Button>
      </div>
      {/* Copia que solo se ve al imprimir: fuera de #root para que salga solo el comprobante */}
      {createPortal(
        <div id="print-root"><ReturnTicket data={data} sale={sale} company={company} settings={settings} logo={logo} /></div>,
        document.body
      )}
    </ModalFrame>
  );
};

/** Ver e imprimir el comprobante de una devolución (con selector si la venta tuvo varias). */
export const ReturnReceiptModal: React.FC<ReturnReceiptModalProps> = (props) => (
  <AnimatePresence>
    {props.sale && props.returns.length > 0 && <Body {...props} sale={props.sale} key={props.initialNumber ?? props.sale.id} />}
  </AnimatePresence>
);
