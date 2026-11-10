import React, { useState } from 'react';
import { Company } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Building2, CheckCircle2, RefreshCw, ShieldAlert } from 'lucide-react';
import type { CompanySettings } from '../types';
import { NegativeStockModal } from './NegativeStockModal';
import { NegativeStockPolicyCard } from './NegativeStockPolicyCard';
import { CompanyIdentityCard } from './CompanyIdentityCard';
import { CompanyLogoCard } from '@/features/logo/components/CompanyLogoCard';

export interface CompanySettingsPageProps {
  company: Company;
  settings: CompanySettings | null;
  isLoading: boolean;
  error: string | null;
  isMasterAdmin: boolean;
  onReload: () => Promise<void>;
  onUpdateNegativeStockPolicy: (allowNegative: boolean, reason: string) => Promise<{ success: boolean; error?: string }>;
}

export const CompanySettingsPage: React.FC<CompanySettingsPageProps> = ({
  company,
  settings,
  isLoading,
  error,
  isMasterAdmin,
  onReload,
  onUpdateNegativeStockPolicy,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleManualReload = async () => {
    setIsRefreshing(true);
    try {
      await onReload();
      showNotification('Configuración de empresa actualizada.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentAllowNegative = settings ? settings.allowNegativeStock : true;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              Configuración de Empresa
            </h1>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Empresa activa: <span className="font-semibold text-text-primary">{company.name}</span>
            {company.cuit ? ` (${company.cuit})` : ''} — Parámetros operativos y fiscales.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualReload}
            disabled={isLoading || isRefreshing}
            className="text-xs h-9"
          >
            <RefreshCw
              size={14}
              className={`mr-1.5 ${isLoading || isRefreshing ? 'animate-spin' : ''}`}
            />
            <span>Actualizar</span>
          </Button>

          {isMasterAdmin ? (
            <Badge variant="primary" size="sm">
              Rol Administrador
            </Badge>
          ) : (
            <Badge variant="neutral" size="sm">
              Solo lectura (Rol Empleado)
            </Badge>
          )}
        </div>
      </div>

      {notice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 size={15} />
          <span>{notice}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
          <Button variant="outline" size="sm" onClick={onReload} className="text-xs shrink-0">
            Reintentar
          </Button>
        </div>
      )}

      <NegativeStockPolicyCard allowNegative={currentAllowNegative} isMasterAdmin={isMasterAdmin} isLoading={isLoading}
        onChangePolicy={() => setIsModalOpen(true)} />

      <CompanyLogoCard company={company} isMasterAdmin={isMasterAdmin} />

      <CompanyIdentityCard company={company} settings={settings} />

      {/* Modal para cambiar política de stock negativo */}
      <NegativeStockModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentAllowNegative={currentAllowNegative}
        onConfirm={async (targetValue, reason) => {
          const res = await onUpdateNegativeStockPolicy(targetValue, reason);
          if (res.success) {
            showNotification(
              targetValue
                ? 'Política actualizada: Stock negativo habilitado.'
                : 'Política actualizada: Control estricto activado (sin stock negativo).'
            );
          }
          return res;
        }}
      />
    </div>
  );
};
