import React from 'react';
import { Building2, Calendar, Info, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { formatDateTime } from '@/lib/formatters';
import type { Company } from '@/types';
import type { CompanySettings } from '../types';

const Field: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="space-y-1">
    <span className="block text-[11px] font-medium text-text-muted uppercase tracking-wider">{label}</span>
    <div className={`p-2.5 rounded-lg bg-surface-2 border border-border text-xs text-text-primary ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
  </div>
);

/** Datos de identificación y fiscales de la empresa (solo lectura). */
export const CompanyIdentityCard: React.FC<{ company: Company; settings: CompanySettings | null }> = ({ company, settings }) => (
  <Card className="overflow-hidden border-border/80">
    <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Building2 className="w-5 h-5 text-text-secondary" />
        <div>
          <h2 className="text-sm font-bold text-text-primary">Identificación Corporativa y Fiscal</h2>
          <p className="text-[11px] text-text-secondary">Datos registrados para esta empresa.</p>
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px] text-text-muted">
        <Lock size={12} />
        <span>Solo lectura</span>
      </div>
    </div>

    <CardContent className="p-4 sm:p-5 space-y-4">
      <div className="p-3 rounded-xl bg-surface-2/30 border border-border/50 text-xs text-text-secondary flex items-start gap-2.5">
        <Info size={15} className="text-text-muted shrink-0 mt-0.5" />
        <p className="leading-relaxed text-[11px]">Por ahora, la razón social, el CUIT, la moneda y el huso horario no se pueden modificar desde la app.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Razón Social / Nombre Comercial" value={settings?.name || company.name} />
        <Field label="CUIT / Identificación Fiscal" value={settings?.taxId || company.cuit || 'Sin CUIT asignado'} mono />
        <Field label="Moneda Base" value={`${settings?.currency || company.currency || 'ARS'} (Pesos Argentinos)`} />
        <Field label="Huso Horario" value={settings?.timezone || company.timezone || 'America/Argentina/Buenos_Aires'} />
      </div>
      {settings && (
        <div className="pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 text-[11px] text-text-muted">
          <div className="flex items-center gap-1.5">
            <Calendar size={13} />
            <span>Fecha de creación: {formatDateTime(settings.createdAt)}</span>
          </div>
          <span className="font-mono">ID de empresa: {settings.id}</span>
        </div>
      )}
    </CardContent>
  </Card>
);
