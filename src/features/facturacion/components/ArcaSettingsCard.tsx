import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDateShort } from '@/lib/formatters';
import type { Company } from '@/types';
import { useDocumentSettings } from '@/features/documentos/hooks/useDocumentSettings';
import { TAX_CONDITION_LABELS } from '@/features/documentos/types';
import { useArcaSettings } from '../hooks/useArcaSettings';
import { formatArcaPointOfSale } from '../arcaSettingsForm';
import { invoiceLettersFor } from '../vat';
import { ArcaSettingsModal } from './ArcaSettingsModal';
import { ArcaCertificateSection } from './ArcaCertificateSection';

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="space-y-1">
    <span className="block text-[11px] font-medium text-text-muted uppercase tracking-wider">{label}</span>
    <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs text-text-primary font-medium break-words min-h-[2.4rem]">{value || '—'}</div>
  </div>
);

/** Datos fiscales, certificado digital y conexión con ARCA para la factura electrónica. */
export const ArcaSettingsCard: React.FC<{ company: Company; isMasterAdmin: boolean }> = ({ company, isMasterAdmin }) => {
  const arca = useArcaSettings(company.id);
  const issuer = useDocumentSettings(company.id, true);
  const [isEditing, setIsEditing] = useState(false);
  const letters = invoiceLettersFor(issuer.settings.taxCondition);
  const lettersText = letters.length > 0 ? `Factura ${letters.join(' y ')}` : 'No emite factura electrónica';

  return (
    <Card className="overflow-hidden border-border/80">
      <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text-primary">Factura electrónica (ARCA)</h2>
          <p className="text-[11px] text-text-secondary">
            La condición frente al IVA se cambia en &quot;Datos para comprobantes&quot;.
          </p>
        </div>
        {isMasterAdmin && (
          <Button variant="secondary" size="sm" className="gap-1.5" disabled={!arca.isLoaded} onClick={() => setIsEditing(true)}>
            <Pencil size={14} /><span>Editar</span>
          </Button>
        )}
      </div>
      <CardContent className="p-4 sm:p-5 space-y-4">
        {arca.error && (
          <div role="alert" className="p-3 rounded-lg bg-danger/10 border border-danger/20 text-danger text-xs flex items-center justify-between gap-3">
            <span>{arca.error}</span>
            <Button variant="outline" size="sm" onClick={() => void arca.reload()}>Reintentar</Button>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Row label="CUIT" value={company.cuit} />
          <Row label="Condición frente al IVA" value={TAX_CONDITION_LABELS[issuer.settings.taxCondition]} />
          <Row label="Comprobantes que emite" value={lettersText} />
          <Row label="Punto de venta electrónico" value={formatArcaPointOfSale(arca.settings.pointOfSale)} />
          <Row label="Inicio de actividades" value={arca.settings.activityStartDate ? formatDateShort(arca.settings.activityStartDate) : ''} />
          <Row label="Ingresos brutos" value={arca.settings.grossIncomeNumber} />
        </div>
        <ArcaCertificateSection companyId={company.id} cuit={company.cuit} isMasterAdmin={isMasterAdmin} />
        <p className="p-2.5 rounded-lg bg-surface-2 border border-border text-[11px] text-text-muted leading-relaxed flex items-start gap-2">
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-warning" />
          <span>La emisión de facturas desde las ventas se agrega en la próxima etapa.</span>
        </p>
      </CardContent>
      <AnimatePresence>
        {isEditing && <ArcaSettingsModal initial={arca.settings} onClose={() => setIsEditing(false)} onSave={arca.save} />}
      </AnimatePresence>
    </Card>
  );
};
