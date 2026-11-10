import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import type { Company } from '@/types';
import { useDocumentSettings } from '../hooks/useDocumentSettings';
import { TAX_CONDITION_LABELS } from '../types';
import { DocumentSettingsModal } from './DocumentSettingsModal';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <span className="block text-[11px] font-medium text-text-muted uppercase tracking-wider">{label}</span>
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs text-text-primary font-medium break-words min-h-[2.4rem]">{value || '—'}</div>
  </div>
);

/** Datos que salen impresos en el ticket de venta y en los documentos: domicilio, contacto, IVA y pie. */
export const IssuerDataCard: React.FC<{ company: Company; isMasterAdmin: boolean }> = ({ company, isMasterAdmin }) => {
  const { settings, isLoaded, save } = useDocumentSettings(company.id, true);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <Card className="overflow-hidden border-border/80">
      <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Datos para comprobantes</h2>
          <p className="text-[11px] text-text-secondary">Salen en el ticket de venta, los presupuestos, remitos y garantías.</p>
        </div>
        {isMasterAdmin && (
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={!isLoaded} onClick={() => setIsEditing(true)}>
            <Pencil size={14} /><span>Editar</span>
          </Button>
        )}
      </div>
      <CardContent className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Row label="Domicilio" value={settings.address} />
        <Row label="Teléfono" value={settings.phone} />
        <Row label="Email" value={settings.email} />
        <Row label="Condición frente al IVA" value={TAX_CONDITION_LABELS[settings.taxCondition]} />
        <Row label="Punto de venta" value={String(settings.pointOfSale).padStart(4, '0')} />
        <Row label="Pie de los comprobantes" value={settings.footerNote} />
      </CardContent>
      <AnimatePresence>
        {isEditing && <DocumentSettingsModal initial={settings} onClose={() => setIsEditing(false)} onSave={save} />}
      </AnimatePresence>
    </Card>
  );
};
