import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Loader2, Lock, RotateCcw, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatDateTime } from '@/lib/formatters';
import type { Company } from '@/types';
import { useCashRegister } from './hooks/useCashRegister';
import { OpenCashPanel } from './components/OpenCashPanel';
import { CashSummaryPanel } from './components/CashSummaryPanel';
import { CashMovementsList } from './components/CashMovementsList';
import { CashMovementModal } from './components/CashMovementModal';
import { CloseCashModal } from './components/CloseCashModal';
import { CashHistoryTable } from './components/CashHistoryTable';
import type { CashMovementType } from './types';

/**
 * Caja Diaria: controla el efectivo físico del cajón por turno.
 * No registra ventas (las toma de Ventas) ni gastos (eso será Finanzas).
 */
export const CajaPage: React.FC<{ company: Company; canOperate?: boolean }> = ({ company, canOperate = true }) => {
  const { session, summary, movements, isLoading, error, reload, openSession, registerMovement, closeSession } =
    useCashRegister(company.id);
  const [movementType, setMovementType] = useState<CashMovementType | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <Wallet size={20} className="text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">Caja Diaria</h1>
              {!isLoading && (
                <Badge variant={session ? 'primary' : 'neutral'}>{session ? 'Abierta' : 'Cerrada'}</Badge>
              )}
            </div>
            <p className="text-xs text-text-muted">
              {session
                ? `Abierta por ${session.openedByName} el ${formatDateTime(session.openedAt)}${session.openingNotes ? ` · ${session.openingNotes}` : ''}`
                : `Control del efectivo del cajón de ${company.name}, por turno.`}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={isLoading} className="gap-1.5">
          <RotateCcw size={14} className={isLoading ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={() => void reload()}>Reintentar</Button>
        </div>
      )}

      {isLoading ? (
        <p className="py-12 text-center text-xs text-text-muted">
          <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
          Cargando caja...
        </p>
      ) : session && summary ? (
        <>
          {canOperate && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setMovementType('in')}>
              <ArrowDownCircle size={14} /> Ingreso de efectivo
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setMovementType('out')}>
              <ArrowUpCircle size={14} /> Retiro de efectivo
            </Button>
            <Button variant="primary" size="sm" className="gap-1.5 ml-auto" onClick={() => setIsClosing(true)}>
              <Lock size={14} /> Cerrar caja
            </Button>
          </div>
          )}
          <CashSummaryPanel summary={summary} />
          <CashMovementsList movements={movements} />
        </>
      ) : (
        !error && (canOperate
          ? <OpenCashPanel companyName={company.name} onOpen={openSession} />
          : <p className="py-12 text-center text-xs text-text-muted">La caja está cerrada. No tenés permiso para abrirla: pedile acceso al administrador.</p>)
      )}

      <CashHistoryTable companyId={company.id} />

      <AnimatePresence>
      {movementType && summary && (
        <CashMovementModal
          movementType={movementType}
          expectedAmount={summary.expectedAmount}
          onClose={() => setMovementType(null)}
          onSubmit={registerMovement}
        />
      )}
      </AnimatePresence>
      <AnimatePresence>
      {isClosing && summary && (
        <CloseCashModal expectedAmount={summary.expectedAmount} onClose={() => setIsClosing(false)} onSubmit={closeSession} />
      )}
      </AnimatePresence>
    </div>
  );
};
