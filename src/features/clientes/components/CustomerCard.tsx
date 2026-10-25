import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import {
  Mail,
  Phone,
  Edit2,
  Loader2,
  Power,
  MapPin,
  FileText,
} from 'lucide-react';
import type { Customer } from '../types';

interface CustomerCardProps {
  customer: Customer;
  isMasterAdmin: boolean;
  isToggling: boolean;
  onEdit: (customer: Customer) => void;
  onToggleStatus: (customer: Customer) => void;
}

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  isMasterAdmin,
  isToggling,
  onEdit,
  onToggleStatus,
}) => {
  const formatDocDisplay = (cust: Customer) => {
    if (!cust.taxId) {
      return 'Consumidor Final (Sin doc)';
    }
    if (cust.identificationType === 'CUIT' || cust.identificationType === 'CUIL') {
      return `${cust.identificationType} ${formatCuit(cust.taxId)}`;
    }
    return `${cust.identificationType} ${cust.taxId}`;
  };

  return (
    <Card
      className={`border transition-all duration-150 ${
        customer.isActive ? 'border-border/80 bg-card' : 'border-border/40 bg-muted/10 opacity-75'
      }`}
    >
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-sm text-foreground truncate block">
              {customer.name}
            </span>
            <p className="text-[11px] text-muted-foreground font-mono mt-0.5">
              {formatDocDisplay(customer)}
            </p>
          </div>

          <Badge
            variant={customer.isActive ? 'success' : 'neutral'}
            className={`text-[10px] uppercase font-bold shrink-0 ${
              customer.isActive
                ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {customer.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
        </div>

        {/* Details */}
        <div className="space-y-1.5 pt-1 text-xs text-muted-foreground border-t border-border/50">
          {customer.email && (
            <div className="flex items-center gap-2 truncate">
              <Mail className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
              <a href={`mailto:${customer.email}`} className="hover:text-primary transition-colors truncate">
                {customer.email}
              </a>
            </div>
          )}

          {customer.phone && (
            <div className="flex items-center gap-2 truncate">
              <Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
              <a href={`tel:${customer.phone}`} className="hover:text-primary transition-colors truncate">
                {customer.phone}
              </a>
            </div>
          )}

          {customer.address && (
            <div className="flex items-center gap-2 truncate">
              <MapPin className="w-3.5 h-3.5 shrink-0 text-muted-foreground/70" />
              <span className="truncate">{customer.address}</span>
            </div>
          )}

          {customer.notes && (
            <div className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground/80 italic">
              <FileText className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground/60" />
              <p className="line-clamp-2">{customer.notes}</p>
            </div>
          )}
        </div>

        {/* Actions (master_admin only) */}
        {isMasterAdmin && (
          <div className="flex items-center justify-end gap-1.5 pt-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(customer)}
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            >
              <Edit2 className="w-3.5 h-3.5" />
              <span>Editar</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleStatus(customer)}
              disabled={isToggling}
              className={`h-8 px-2.5 text-xs gap-1.5 ${
                customer.isActive
                  ? 'text-destructive/80 hover:text-destructive hover:bg-destructive/10'
                  : 'text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10'
              }`}
            >
              {isToggling ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Power className="w-3.5 h-3.5" />
              )}
              <span>{customer.isActive ? 'Desactivar' : 'Activar'}</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
