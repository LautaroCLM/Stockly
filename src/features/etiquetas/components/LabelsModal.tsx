import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'motion/react';
import { Printer, Search, Tags, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import type { LabelData } from '../types';
import { PriceLabel } from './PriceLabel';

interface LabelsModalProps {
  isOpen: boolean;
  /** Productos que se pueden imprimir. */
  labels: LabelData[];
  /** Cuáles arrancan marcados (por defecto, todos). */
  initialSelected?: string[];
  subtitle?: string;
  onClose: () => void;
}

const MAX_COPIES = 50;

/** Elegir productos y cantidad de copias, ver la etiqueta y mandar a imprimir en hojas A4 (3 × 7 por hoja). */
const LabelsModalBody: React.FC<LabelsModalProps> = ({ labels, initialSelected, subtitle, onClose }) => {
  const [copies, setCopies] = useState<Record<string, number>>(() =>
    Object.fromEntries((initialSelected ?? labels.map((l) => l.id)).map((id) => [id, 1])));
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? labels.filter((l) => l.name.toLowerCase().includes(q) || l.sku.toLowerCase().includes(q) || l.barcode.includes(q)) : labels;
  }, [labels, query]);
  const sheet = labels.flatMap((l) => Array.from({ length: copies[l.id] ?? 0 }, (_, i) => ({ label: l, key: `${l.id}-${i}` })));
  const setCount = (id: string, n: number) => setCopies((c) => ({ ...c, [id]: Math.max(0, Math.min(MAX_COPIES, n)) }));
  const preview = sheet[0]?.label ?? labels[0];

  return (
    <ModalFrame ariaLabel="Imprimir etiquetas de precio" onBackdropClick={onClose} panelClassName="max-w-3xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary"><Tags size={18} /></div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Etiquetas de precio</h2>
            <p className="text-xs text-text-muted">{subtitle ?? 'Elegí qué productos y cuántas copias. Se imprimen 21 por hoja A4.'}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-5 p-5 max-h-[70vh] overflow-y-auto">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar producto…" aria-label="Buscar producto"
                className="w-full h-8 pl-8 pr-2 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
            </div>
            <button type="button" onClick={() => visible.forEach((l) => setCount(l.id, Math.max(1, copies[l.id] ?? 0)))} className="text-[11px] text-primary hover:underline">Todos</button>
            <button type="button" onClick={() => visible.forEach((l) => setCount(l.id, 0))} className="text-[11px] text-text-muted hover:underline">Ninguno</button>
          </div>
          <ul className="rounded-xl border border-border divide-y divide-border/50 max-h-[50vh] overflow-y-auto">
            {visible.map((l) => {
              const n = copies[l.id] ?? 0;
              return (
                <li key={l.id} className={`flex items-center gap-3 px-3 py-2 ${n === 0 ? 'opacity-55' : ''}`}>
                  <input type="checkbox" checked={n > 0} onChange={(e) => setCount(l.id, e.target.checked ? 1 : 0)} aria-label={`Imprimir ${l.name}`} className="w-4 h-4 accent-primary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-primary truncate">{l.name}</p>
                    <p className="text-[10px] text-text-muted">{formatCurrency(l.price)} · {l.sku}</p>
                  </div>
                  <input type="number" min={0} max={MAX_COPIES} value={n} onChange={(e) => setCount(l.id, Number(e.target.value) || 0)}
                    aria-label={`Copias de ${l.name}`} className="w-14 h-7 px-1 text-center text-xs bg-surface-3 border border-border rounded-md text-text-primary focus:outline-none focus:border-primary" />
                </li>
              );
            })}
          </ul>
        </div>
        {preview && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold text-text-secondary">Vista previa</p>
            <div className="rounded-lg overflow-hidden border border-border w-fit"><PriceLabel label={preview} /></div>
          </div>
        )}
      </div>

      <div className="p-4 px-6 border-t border-border bg-surface-2/40 flex items-center justify-between gap-3">
        <span className="text-xs text-text-muted"><strong className="text-text-primary">{sheet.length}</strong> etiquetas · {Math.ceil(sheet.length / 21)} hoja(s)</span>
        <Button variant="primary" size="md" disabled={sheet.length === 0} onClick={() => window.print()} className="gap-2">
          <Printer size={16} /><span>Imprimir</span>
        </Button>
      </div>
      {createPortal(
        <div id="print-root" className="print-a4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 63.5mm)', gridAutoRows: '38mm', columnGap: '2.5mm' }}>
            {sheet.map(({ label, key }) => <PriceLabel key={key} label={label} />)}
          </div>
        </div>,
        document.body
      )}
    </ModalFrame>
  );
};

export const LabelsModal: React.FC<LabelsModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <LabelsModalBody {...props} />}</AnimatePresence>
);
