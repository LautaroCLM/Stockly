import React, { useState } from 'react';
import { Company } from '@/types';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import {
  Building2,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Info,
  Calendar,
  Lock,
  Boxes,
  HelpCircle,
} from 'lucide-react';
import type { CompanySettings } from '../types';
import { NegativeStockModal } from './NegativeStockModal';

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

      {/* SECCIÓN 1: POLÍTICA DE STOCK NEGATIVO */}
      <Card className="overflow-hidden border-border/80">
        <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Boxes className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-text-primary">
                Control de Existencias y Stock Negativo
              </h2>
              <p className="text-[11px] text-text-secondary">
                Regla que determina si las ventas y salidas pueden consumir más unidades de las registradas.
              </p>
            </div>
          </div>

          <div>
            {currentAllowNegative ? (
              <Badge variant="warning" size="sm">
                Stock Negativo Habilitado
              </Badge>
            ) : (
              <Badge variant="success" size="sm">
                Control Estricto Activado
              </Badge>
            )}
          </div>
        </div>

        <CardContent className="p-4 sm:p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-surface-2/50 border border-border/60 space-y-2">
              <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <HelpCircle size={14} className="text-text-muted" />
                <span>¿Cómo opera este parámetro?</span>
              </span>
              <p className="text-xs text-text-secondary leading-relaxed">
                {currentAllowNegative
                  ? 'Actualmente, el catálogo permite saldos menores a cero. Las operaciones continuarán confirmándose aun cuando el stock físico no haya sido ingresado previamente.'
                  : 'Actualmente, el sistema bloquea cualquier venta o salida que exceda las existencias físicas registradas en el catálogo.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-surface-2/50 border border-border/60 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-xs font-semibold text-text-primary">
                  Acción de Gobernanza
                </span>
                <p className="text-xs text-text-secondary mt-1">
                  {isMasterAdmin
                    ? 'Como Administrador podés modificar esta política en cualquier momento con motivo justificatorio.'
                    : 'Solo los administradores con rol master_admin pueden alterar esta política.'}
                </p>
              </div>

              {isMasterAdmin && (
                <div className="pt-2">
                  <Button
                    variant={currentAllowNegative ? 'outline' : 'primary'}
                    size="sm"
                    onClick={() => setIsModalOpen(true)}
                    disabled={isLoading}
                    className="text-xs w-full sm:w-auto"
                  >
                    <ShieldCheck size={14} className="mr-1.5" />
                    <span>
                      {currentAllowNegative
                        ? 'Activar Control Estricto (Bloquear bajo cero)'
                        : 'Habilitar Stock Negativo (Modo Flexible)'}
                    </span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECCIÓN 2: INFORMACIÓN GENERAL Y FISCAL (Solo lectura) */}
      <Card className="overflow-hidden border-border/80">
        <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className="w-5 h-5 text-text-secondary" />
            <div>
              <h2 className="text-sm font-bold text-text-primary">
                Identificación Corporativa y Fiscal
              </h2>
              <p className="text-[11px] text-text-secondary">
                Metadatos registrados en la base de datos para esta empresa.
              </p>
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
            <p className="leading-relaxed text-[11px]">
              Por ahora, la razón social, el CUIT, la moneda y el huso horario no se pueden modificar desde la app.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Razón Social / Nombre Comercial
              </label>
              <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-semibold text-text-primary">
                {settings?.name || company.name}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                CUIT / Identificación Fiscal
              </label>
              <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-mono text-text-primary">
                {settings?.taxId || company.cuit || 'Sin CUIT asignado'}
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Moneda Base
              </label>
              <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-medium text-text-primary">
                {settings?.currency || company.currency || 'ARS'} (Pesos Argentinos)
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium text-text-muted uppercase tracking-wider">
                Huso Horario
              </label>
              <div className="p-2.5 rounded-lg bg-surface-2 border border-border text-xs font-medium text-text-primary">
                {settings?.timezone || company.timezone || 'America/Argentina/Buenos_Aires'}
              </div>
            </div>
          </div>

          {/* Fechas de auditoría */}
          {settings && (
            <div className="pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-3 text-[11px] text-text-muted">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} />
                <span>Fecha de creación: {formatDateTime(settings.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono">
                <span>Tenant ID: {settings.id}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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
