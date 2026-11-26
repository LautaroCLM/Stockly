import React, { useState } from 'react';
import { Tags, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatNumber } from '@/lib/formatters';
import { LabelsModal } from '@/features/etiquetas/components/LabelsModal';
import type { LabelData } from '@/features/etiquetas/types';

/** Después de cambiar precios: ofrece imprimir las etiquetas nuevas solo de los productos que cambiaron. */
export const AppliedLabelsBanner: React.FC<{ labels: LabelData[]; onDismiss: () => void }> = ({ labels, onDismiss }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="p-3 rounded-xl border border-primary/30 bg-primary/5 flex flex-wrap items-center justify-between gap-3 text-xs">
      <span className="flex items-center gap-2 text-text-secondary">
        <Tags size={15} className="text-primary" />
        Cambiaste el precio de <strong className="text-text-primary">{formatNumber(labels.length)}</strong> productos: actualizá sus etiquetas en la góndola.
      </span>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => setIsOpen(true)} className="gap-1.5"><Tags size={14} />Imprimir etiquetas</Button>
        <button type="button" onClick={onDismiss} aria-label="Ocultar" className="p-1 rounded-md text-text-muted hover:text-text-primary"><X size={14} /></button>
      </div>
      <LabelsModal isOpen={isOpen} onClose={() => setIsOpen(false)} labels={labels}
        subtitle="Con los precios nuevos. Se imprimen 21 por hoja A4." />
    </div>
  );
};
