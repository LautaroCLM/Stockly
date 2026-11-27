import React, { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Wallet, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Notice } from '@/features/avisos/types';
import { CASH_CLOSED_NOTICE_ID } from '@/features/avisos/buildNotices';

interface Props {
  companyId: string;
  notices: Notice[];
  onOpenCash: () => void;
}

const shownKey = (companyId: string) => `stockly:cash-reminder-shown:${companyId}`;

/**
 * Recordatorio al abrir la app: si la caja está cerrada (y la persona puede abrirla), aparece una
 * vez por sesión con un botón que lleva a Caja Diaria. El aviso sigue en la campanita hasta abrirla.
 */
export const CashReminder: React.FC<Props> = ({ companyId, notices, onOpenCash }) => {
  const isClosed = notices.some((n) => n.id === CASH_CLOSED_NOTICE_ID);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isClosed) return setVisible(false);
    if (sessionStorage.getItem(shownKey(companyId))) return;
    sessionStorage.setItem(shownKey(companyId), '1');
    setVisible(true);
  }, [isClosed, companyId]);

  return (
    <AnimatePresence>
      {visible && (
        <m.div role="alertdialog" aria-label="La caja está cerrada"
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}
          className="fixed top-20 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md p-4 rounded-2xl border border-warning/40 bg-surface shadow-2xl flex items-start gap-3">
          <div className="w-9 h-9 shrink-0 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center text-warning">
            <Wallet size={18} />
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <p className="text-sm font-bold text-text-primary">La caja está cerrada</p>
              <p className="text-xs text-text-secondary">Abrila con el efectivo inicial antes de empezar a cobrar.</p>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" className="h-8" onClick={() => { setVisible(false); onOpenCash(); }}>Abrir caja</Button>
              <Button size="sm" variant="secondary" className="h-8" onClick={() => setVisible(false)}>Ahora no</Button>
            </div>
          </div>
          <button type="button" aria-label="Cerrar recordatorio" className="p-1 rounded text-text-muted hover:text-text-primary" onClick={() => setVisible(false)}>
            <X size={14} />
          </button>
        </m.div>
      )}
    </AnimatePresence>
  );
};
