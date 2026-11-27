import React, { useEffect } from 'react';
import { m } from 'motion/react';
import { AlertTriangle, ChevronRight, Info, Lock, X } from 'lucide-react';
import { useSwipeToDismiss } from '../hooks/useSwipeToDismiss';
import type { Notice, NoticeSeverity } from '../types';

const SEVERITY_ICON: Record<NoticeSeverity, React.ReactNode> = {
  danger: <AlertTriangle size={15} className="text-danger" />,
  warning: <AlertTriangle size={15} className="text-amber-400" />,
  info: <Info size={15} className="text-primary" />,
};

const EASE = [0.22, 1, 0.36, 1] as const;

interface Props {
  notice: Notice;
  index: number;
  /** Cambia cuando se tocó "Vaciar": los fijos se sacuden para mostrar que se quedan. */
  shakeSignal: number;
  onOpen: (notice: Notice) => void;
  onDismiss: (notice: Notice) => void;
}

/** Un aviso: abre su pantalla al tocarlo; los comunes se borran con la X o deslizando a la derecha. */
export const NoticeItem: React.FC<Props> = ({ notice, index, shakeSignal, onOpen, onDismiss }) => {
  const pinned = Boolean(notice.pinned);
  const swipe = useSwipeToDismiss(!pinned, () => onDismiss(notice));
  const { shake } = swipe;

  useEffect(() => {
    if (pinned && shakeSignal > 0) shake();
  }, [shakeSignal, pinned, shake]);

  return (
    <m.li
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 6) * 0.045, duration: 0.24, ease: EASE } }}
      // Al irse se desliza a la derecha y se achica: los de abajo suben suavemente
      exit={{ opacity: 0, x: 140, height: 0, transition: { duration: 0.26, ease: EASE } }}
      className="relative overflow-hidden border-b border-border/60 last:border-b-0"
    >
      {!pinned && (
        <div className="absolute inset-0 flex items-center pl-4 text-[11px] font-semibold text-text-muted bg-surface-2/70" aria-hidden="true">
          Soltá para borrar
        </div>
      )}
      <m.div
        style={{ x: swipe.x }}
        {...swipe.handlers}
        className={`relative bg-surface flex items-start gap-3 px-4 py-3 hover:bg-surface-2 transition-colors ${pinned ? '' : 'touch-pan-y select-none'}`}
      >
        <button type="button" onClick={() => { if (!swipe.consumeClick()) onOpen(notice); }} className="flex-1 min-w-0 flex items-start gap-3 text-left">
          <span className="mt-0.5 shrink-0">{SEVERITY_ICON[notice.severity]}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-xs font-semibold text-text-primary">{notice.title}</span>
            <span className="block text-[11px] text-text-muted leading-relaxed mt-0.5">{notice.detail}</span>
            {pinned && (
              <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-400">
                <Lock size={10} />{notice.pinned}
              </span>
            )}
          </span>
          <ChevronRight size={14} className="shrink-0 mt-1 text-text-muted" />
        </button>
        {!pinned && (
          <button type="button" aria-label={`Borrar aviso: ${notice.title}`} title="Borrar"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onDismiss(notice)}
            className="shrink-0 -mr-1 p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors">
            <X size={13} />
          </button>
        )}
      </m.div>
    </m.li>
  );
};
