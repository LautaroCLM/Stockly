import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import { ShieldCheck, Loader2, Ban, RotateCcw } from 'lucide-react';
import type { CompanyMember } from '../types';

export interface MembersTableProps {
  members: CompanyMember[];
  isLoading: boolean;
  isMasterAdmin: boolean;
  currentUserId?: string;
  onOpenDeactivate: (member: CompanyMember) => void;
  onOpenReactivate: (member: CompanyMember) => void;
}

export const MembersTable: React.FC<MembersTableProps> = ({
  members,
  isLoading,
  isMasterAdmin,
  currentUserId,
  onOpenDeactivate,
  onOpenReactivate,
}) => {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-text-primary">
            Equipo y Membresías ({members.length})
          </h2>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading && members.length === 0 ? (
            <div className="py-12 text-center text-text-muted flex flex-col items-center gap-2">
              <Loader2 size={22} className="animate-spin text-primary" />
              <p className="text-xs">Cargando colaboradores desde Supabase...</p>
            </div>
          ) : members.length === 0 ? (
            <div className="py-12 text-center text-text-muted">
              <p className="text-xs">No se encontraron miembros para esta empresa.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-surface-2/60 text-text-muted uppercase tracking-wider font-semibold border-b border-border text-[10px]">
                  <tr>
                    <th className="py-3 px-4">Colaborador / Identidad</th>
                    <th className="py-3 px-4">Rol Asignado</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">Fecha de Alta</th>
                    {isMasterAdmin && <th className="py-3 px-4 text-right">Acciones</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {members.map((m) => {
                    const isSelf = currentUserId === m.userId;
                    const displayName =
                      m.fullName ||
                      m.email ||
                      `Usuario: ${m.userId.substring(0, 8)}...`;

                    return (
                      <tr key={m.id} className="hover:bg-surface-2/40 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-text-primary">{displayName}</span>
                            {isSelf && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-3 text-text-muted border border-border">
                                Tú
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-text-muted font-mono block">
                            {m.email ?? `UUID: ${m.userId.substring(0, 18)}...`}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`text-[11px] font-mono font-medium px-2 py-0.5 rounded border ${
                              m.role === 'master_admin'
                                ? 'bg-primary/20 text-primary-light border-primary/40'
                                : 'bg-surface-3 text-text-secondary border-border'
                            }`}
                          >
                            {m.role === 'master_admin' ? 'Administrador' : 'Empleado'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          {m.isActive ? (
                            <Badge variant="success" size="sm">
                              Activo
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              Inactivo
                            </Badge>
                          )}
                        </td>

                        <td className="py-3 px-4 text-text-secondary">
                          {formatDateTime(m.joinedAt)}
                        </td>

                        {isMasterAdmin && (
                          <td className="py-3 px-4 text-right">
                            {isSelf ? (
                              <span className="text-[11px] text-text-muted italic">
                                Cuenta activa
                              </span>
                            ) : m.isActive ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onOpenDeactivate(m)}
                                className="h-7 px-2 text-danger hover:bg-danger/10 text-xs"
                                title="Desactivar acceso a la empresa"
                              >
                                <Ban size={13} className="mr-1" />
                                Desactivar
                              </Button>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenReactivate(m)}
                                className="h-7 px-2 text-primary hover:bg-primary/10 text-xs"
                                title="Reactivar acceso a la empresa"
                              >
                                <RotateCcw size={13} className="mr-1" />
                                Reactivar
                              </Button>
                            )}
                          </td>
                        )}
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
