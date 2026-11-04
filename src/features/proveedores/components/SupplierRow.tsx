import React from 'react';
import { Edit2, Loader2, Mail, Phone, Power } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import type { Supplier } from '../types';

interface SupplierRowProps {
  supplier: Supplier;
  canManage: boolean;
  isToggling: boolean;
  onEdit: (supplier: Supplier) => void;
  onToggle: (supplier: Supplier) => void;
}

/** Un proveedor: datos fiscales, contacto, estado y acciones. */
export const SupplierRow: React.FC<SupplierRowProps> = ({ supplier: s, canManage, isToggling, onEdit, onToggle }) => (
  <tr className="hover:bg-surface-2/40 transition-colors">
    <td className="py-3 px-4">
      <span className="font-semibold text-text-primary block">{s.name}</span>
      {s.address && <span className="text-[11px] text-text-muted block truncate max-w-xs">{s.address}</span>}
    </td>
    <td className="py-3 px-4 font-mono text-[11px] text-text-secondary">
      {s.taxId ? formatCuit(s.taxId) : <span className="text-text-muted">Sin CUIT</span>}
    </td>
    <td className="py-3 px-4 text-text-secondary">{s.contactName || <span className="text-text-muted">—</span>}</td>
    <td className="py-3 px-4 space-y-0.5">
      {s.email && (
        <div className="flex items-center gap-1.5 text-text-secondary text-[11px]">
          <Mail size={12} className="text-text-muted shrink-0" />
          <a href={`mailto:${s.email}`} className="hover:text-primary transition-colors">{s.email}</a>
        </div>
      )}
      {s.phone && (
        <div className="flex items-center gap-1.5 text-text-secondary text-[11px]">
          <Phone size={12} className="text-text-muted shrink-0" />
          <span>{s.phone}</span>
        </div>
      )}
      {!s.email && !s.phone && <span className="text-text-muted">—</span>}
    </td>
    <td className="py-3 px-4">
      <Badge variant={s.isActive ? 'success' : 'neutral'} size="sm">{s.isActive ? 'Activo' : 'Inactivo'}</Badge>
    </td>
    {canManage && (
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => onEdit(s)} title="Editar proveedor">
            <Edit2 size={12} className="mr-1" />
            <span>Editar</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => onToggle(s)} disabled={isToggling}
            className={`h-7 px-2 text-xs ${s.isActive ? 'hover:text-danger hover:border-danger/40' : 'hover:text-emerald-400'}`}
            title={s.isActive ? 'Desactivar proveedor' : 'Reactivar proveedor'}>
            {isToggling ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} className={s.isActive ? 'text-text-muted' : 'text-emerald-400'} />}
          </Button>
        </div>
      </td>
    )}
  </tr>
);
