import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import { Mail, Clock, Loader2, Ban } from 'lucide-react';
import type { CompanyInvitation } from '../types';

export interface InvitationsTableProps {
  invitations: CompanyInvitation[];
  isLoading: boolean;
  revokingId: string | null;
  onRevoke: (invitationId: string) => void;
}

export const InvitationsTable: React.FC<InvitationsTableProps> = ({
  invitations,
  isLoading,
  revokingId,
  onRevoke,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Mail size={16} className="text-accent" />
        <h2 className="text-sm font-bold text-text-primary">
          Invitaciones Emitidas ({invitations.length})
        </h2>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && invitations.length === 0 ? (
            <div className="py-8 text-center text-text-muted flex flex-col items-center gap-2">
              <Loader2 size={18} className="animate-spin text-accent" />
              <p className="text-xs">Consultando invitaciones...</p>
            </div>
          ) : invitations.length === 0 ? (
            <div className="py-8 text-center text-text-muted">
              <p className="text-xs">No hay invitaciones registradas.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2/60 text-text-muted uppercase tracking-wider font-semibold border-b border-border text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Correo Destinatario</th>
                    <th className="py-3 px-4">Rol Propuesto</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Fecha de Expiración</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {invitations.map((inv) => {
                    const isPending = inv.status === 'pending';
                    const isRevoking = revokingId === inv.id;

                    return (
                      <tr key={inv.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-semibold text-text-primary font-mono">
                            {inv.email}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-3 border border-border text-text-secondary">
                            {inv.role === 'master_admin' ? 'Administrador' : 'Empleado'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {inv.status === 'pending' && (
                            <Badge variant="warning" size="sm">
                              Pendiente
                            </Badge>
                          )}
                          {inv.status === 'accepted' && (
                            <Badge variant="success" size="sm">
                              Aceptada
                            </Badge>
                          )}
                          {inv.status === 'revoked' && (
                            <Badge variant="danger" size="sm">
                              Revocada
                            </Badge>
                          )}
                          {inv.status === 'expired' && (
                            <Badge variant="neutral" size="sm">
                              Expirada
                            </Badge>
                          )}
                        </td>

                        <td className="py-3 px-4 text-text-secondary">
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <Clock size={12} className="text-text-muted" />
                            <span>{formatDateTime(inv.expiresAt)}</span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right">
                          {isPending ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onRevoke(inv.id)}
                              disabled={isRevoking}
                              className="h-7 px-2 text-danger hover:bg-danger/10 text-xs"
                              title="Revocar invitación"
                            >
                              {isRevoking ? (
                                <Loader2 size={12} className="animate-spin mr-1" />
                              ) : (
                                <Ban size={12} className="mr-1" />
                              )}
                              Revocar
                            </Button>
                          ) : (
                            <span className="text-[11px] text-text-muted italic">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
