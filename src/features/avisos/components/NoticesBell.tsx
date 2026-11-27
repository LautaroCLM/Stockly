import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useAnimationControls } from 'motion/react';
import { Bell, CheckCircle2 } from 'lucide-react';
import { popoverVariants } from '@/lib/motion';
import type { RouteId } from '@/types';
import { canDismiss, fingerprint } from '../dismissals';
import { useNoticeDismissals } from '../hooks/useNoticeDismissals';
import type { Notice } from '../types';
import { NoticeItem } from './NoticeItem';

interface NoticesBellProps {
  companyId: string;
  notices: Notice[];
  onSelect: (route: RouteId) => void;
}

/**
 * Campana del encabezado: cuenta los avisos y, al abrirse, los lista. Los comunes se borran (X,
 * deslizando o con "Vaciar"); los fijos se quedan hasta que se resuelven.
 */
export const NoticesBell: React.FC<NoticesBellProps> = ({ companyId, notices, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [shakeSignal, setShakeSignal] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const { visible, dismiss } = useNoticeDismissals(companyId, notices);
  const hasDanger = visible.some((n) => n.severity === 'danger');
  const dismissable = visible.filter(canDismiss);

  // La campana se sacude cuando aparece un aviso que no estaba (no al cargar la app)
  const bell = useAnimationControls();
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = new Set(visible.map(fingerprint));
    const previous = seen.current;
    seen.current = keys;
    if (previous && [...keys].some((k) => !previous.has(k))) {
      void bell.start({ rotate: [0, -16, 14, -10, 7, -3, 0], transition: { duration: 0.7, ease: 'easeInOut' } });
    }
  }, [visible, bell]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const clearAll = () => {
    dismiss(dismissable);
    if (visible.some((n) => n.pinned)) setShakeSignal((s) => s + 1);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
        title={visible.length > 0 ? `${visible.length} ${visible.length === 1 ? 'aviso' : 'avisos'}` : 'Sin avisos'}
        aria-label={`Avisos: ${visible.length}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <m.span animate={bell} className="block origin-top"><Bell size={18} /></m.span>
        <AnimatePresence>
          {visible.length > 0 && (
            <m.span key={visible.length}
              initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 20 }}
              className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold leading-4 text-center tabular-nums ${hasDanger ? 'bg-danger' : 'bg-amber-500'}`}>
              {visible.length > 99 ? '99+' : visible.length}
            </m.span>
          )}
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {isOpen && (
          <m.div
            role="dialog"
            aria-label="Avisos"
            variants={popoverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-border rounded-2xl shadow-2xl shadow-black/60 z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2 bg-surface-2/50">
              <div>
                <h2 className="text-sm font-bold text-text-primary">Avisos</h2>
                <span className="text-[11px] text-text-muted">{visible.length === 0 ? 'Todo en orden' : `${visible.length} para revisar`}</span>
              </div>
              {dismissable.length > 0 && (
                <button type="button" onClick={clearAll}
                  className="text-[11px] font-semibold px-2.5 py-1 rounded-lg text-primary hover:bg-primary/10 transition-colors">
                  Vaciar
                </button>
              )}
            </div>

            <AnimatePresence initial={false} mode="wait">
              {visible.length === 0 ? (
                <m.div key="empty" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22 }}
                  className="px-4 py-8 text-center space-y-2">
                  <m.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.05 }} className="inline-block">
                    <CheckCircle2 size={26} className="text-emerald-400" />
                  </m.span>
                  <p className="text-xs text-text-secondary">No hay nada pendiente por ahora.</p>
                </m.div>
              ) : (
                <m.ul key="list" className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
                  <AnimatePresence initial={true}>
                    {visible.map((notice, index) => (
                      <NoticeItem key={notice.id} notice={notice} index={index} shakeSignal={shakeSignal}
                        onOpen={(n) => { setIsOpen(false); onSelect(n.route); }}
                        onDismiss={(n) => dismiss([n])} />
                    ))}
                  </AnimatePresence>
                </m.ul>
              )}
            </AnimatePresence>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
