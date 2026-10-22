import React from 'react';
import { RouteId } from '@/types';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Boxes,
  Receipt,
  Wallet,
  ShoppingCart,
  Truck,
  Users,
  BarChart3,
  UserCheck,
  History,
  Building2,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface EmptyStateProps {
  routeId: RouteId;
  onNavigateHome: () => void;
}

interface RouteMeta {
  title: string;
  description: string;
  phase: string;
  icon: React.ReactNode;
  features: string[];
}

const ROUTE_META_MAP: Record<RouteId, RouteMeta> = {
  dashboard: {
    title: 'Dashboard General',
    description: 'Panel de control con métricas e indicadores en tiempo real.',
    phase: 'Fase 1 (Completada)',
    icon: <BarChart3 className="w-8 h-8 text-primary" />,
    features: ['KPIs diarios', 'Gráfico de facturación', 'Stock crítico'],
  },
  inventario: {
    title: 'Inventario y Venta Rápida',
    description:
      'Catálogo de productos con tabla densa, buscador multicriterio, stock dinámico y carrito de venta modal/lateral integrado sin salir de la vista.',
    phase: 'Fase 4 (Próxima etapa)',
    icon: <Boxes className="w-8 h-8 text-primary" />,
    features: [
      'Búsqueda por nombre, código y SKU',
      'Acción "Agregar al Carrito" con un clic',
      'Carrito flotante con total acumulado y panel lateral',
      'Cálculo de stock por entradas/salidas (stock_movements)',
      'Alertas de stock negativo y umbrales mínimos',
    ],
  },
  ventas: {
    title: 'Historial de Ventas',
    description:
      'Registro inmutable de transacciones completadas, detalle de tickets facturados, medios de pago y reimpresión de comprobantes.',
    phase: 'Fase 5',
    icon: <Receipt className="w-8 h-8 text-accent" />,
    features: [
      'Detalle línea por línea de cada venta',
      'Filtro por fecha, cliente y vendedor',
      'Desglose de efectivo, débito, transferencia y crédito',
    ],
  },
  caja: {
    title: 'Caja Diaria y Turnos',
    description:
      'Apertura, arqueos intermedios, control de efectivo por turno y cierre diario de caja con cálculo de diferencias.',
    phase: 'Fase 5',
    icon: <Wallet className="w-8 h-8 text-emerald-400" />,
    features: [
      'Control de saldo inicial y extracciones justificadas',
      'Arqueo ciego con detección de sobrantes/faltantes',
      'Resumen de cobros por método',
    ],
  },
  compras: {
    title: 'Compras a Proveedores',
    description:
      'Órdenes de compra, recepción de mercadería con remito e impacto automático en stock y cuentas por pagar.',
    phase: 'Fase 6',
    icon: <ShoppingCart className="w-8 h-8 text-amber-400" />,
    features: [
      'Carga de facturas de compra y remitos de entrega',
      'Actualización masiva de costos de reposición',
      'Vinculación directa con cuentas corrientes de proveedores',
    ],
  },
  proveedores: {
    title: 'Gestión de Proveedores',
    description:
      'Fichas de proveedores, condiciones comerciales, plazos de entrega y estado de deuda comercial.',
    phase: 'Fase 6',
    icon: <Truck className="w-8 h-8 text-blue-400" />,
    features: [
      'Catálogo de proveedores con CUIT y contacto',
      'Cuentas corrientes y registro de pagos',
      'Histórico de compras por proveedor',
    ],
  },
  clientes: {
    title: 'Gestión de Clientes',
    description:
      'Fichero de clientes, cuentas corrientes para clientes habituales, límites de crédito y seguimiento de saldos.',
    phase: 'Fase 6',
    icon: <Users className="w-8 h-8 text-purple-400" />,
    features: [
      'Datos fiscales para facturación A/B',
      'Saldos pendientes y recibos de cobranza',
      'Historial de consumo por cliente',
    ],
  },
  finanzas: {
    title: 'Finanzas y Balances',
    description:
      'Estado de resultados, flujo de fondos proyectado, márgenes brutos por categoría y rentabilidad neta.',
    phase: 'Fase 6',
    icon: <BarChart3 className="w-8 h-8 text-cyan-400" />,
    features: [
      'Cálculo estricto en numeric (es-AR)',
      'Ingresos vs. costos de mercadería vendida',
      'Exportación de balances en PDF y Excel',
    ],
  },
  personal: {
    title: 'Personal y Haberes',
    description:
      'Plantel de empleados, turnos, adelantos de sueldo, liquidación de haberes y comisiones por venta.',
    phase: 'Fase 5',
    icon: <UserCheck className="w-8 h-8 text-emerald-400" />,
    features: [
      'Legajos con roles y permisos específicos',
      'Registro de adelantos y descuentos',
      'Productividad por colaborador',
    ],
  },
  historial: {
    title: 'Auditoría y Eventos del Sistema',
    description:
      'Registro inmutable (audit_log) de cada inserción, modificación o anulación realizada por cualquier usuario de la empresa.',
    phase: 'Fase 5',
    icon: <History className="w-8 h-8 text-slate-400" />,
    features: [
      'Trazabilidad completa con ID de usuario y timestamp',
      'Historial de ajustes manuales de stock',
      'Inmutabilidad garantizada por triggers Postgres',
    ],
  },
  'config-empresa': {
    title: 'Datos de la Empresa',
    description:
      'Configuración fiscal, punto de venta, datos comerciales de la empresa activa y personalización de tickets.',
    phase: 'Fase 7',
    icon: <Building2 className="w-8 h-8 text-primary" />,
    features: [
      'Razón social, CUIT y condición frente al IVA',
      'Numeración de talonarios y puntos de emisión',
      'Logo y encabezados para comprobantes',
    ],
  },
  'config-miembros': {
    title: 'Miembros, Roles y Permisos',
    description:
      'Invitaciones al equipo, asignación de perfiles (Master Admin vs Empleado) y control granular de accesos.',
    phase: 'Fase 2 / 7',
    icon: <ShieldCheck className="w-8 h-8 text-accent" />,
    features: [
      'Control de roles respaldado por Supabase Auth & RLS',
      'Restricción de vistas sensibles para personal de salón',
      'Auditoría de sesiones activas',
    ],
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({ routeId, onNavigateHome }) => {
  const meta = ROUTE_META_MAP[routeId] || ROUTE_META_MAP.inventario;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5 shadow-lg shadow-black/40">
        {meta.icon}
      </div>

      <div className="inline-flex items-center gap-2 mb-3">
        <Badge variant="accent">{meta.phase}</Badge>
        <Badge variant="neutral">Arquitectura SaaS Multi-tenant</Badge>
      </div>

      <h2 className="text-xl font-bold text-text-primary tracking-tight mb-2">
        {meta.title}
      </h2>

      <p className="text-sm text-text-secondary max-w-lg mb-6 leading-relaxed">
        {meta.description}
      </p>

      <div className="w-full bg-surface-2/60 border border-border rounded-xl p-4 text-left mb-6">
        <span className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-2.5">
          <Sparkles size={14} className="text-primary" />
          Capacidades planificadas para este módulo:
        </span>
        <ul className="space-y-1.5">
          {meta.features.map((feature, idx) => (
            <li
              key={idx}
              className="text-xs text-text-secondary flex items-start gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-1.5 shrink-0" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="secondary" size="md" onClick={onNavigateHome}>
          <ArrowLeft size={14} />
          Volver al Dashboard
        </Button>
      </div>
    </div>
  );
};
