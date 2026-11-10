import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { AlertTriangle, Bell, CheckCircle2, ChevronRight, Info } from 'lucide-react';
import { popoverVariants } from '@/lib/motion';
import type { RouteId } from '@/types';
import type { Notice, NoticeSeverity } from '../types';

const SEVERITY_STYLE: Record<NoticeSeverity, { icon: React.ReactNode; dot: string }> = {
  danger: { icon: <AlertTriangle size={15} className="text-danger" />, dot: 'bg-danger' },
  warning: { icon: <AlertTriangle size={15} className="text-amber-400" />, dot: 'bg-amber-500' },
  info: { icon: <Info size={15} className="text-primary" />, dot: 'bg-primary' },
};

interface NoticesBellProps {
  notices: Notice[];
  onSelect: (route: RouteId) => void;
}

/** Campana del encabezado: cuenta los avisos y, al abrirse, los lista con acceso directo a cada uno. */
export const NoticesBell: React.FC<NoticesBellProps> = ({ notices, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasDanger = notices.some((n) => n.severity === 'danger');

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors"
        title={notices.length > 0 ? `${notices.length} ${notices.length === 1 ? 'aviso' : 'avisos'}` : 'Sin avisos'}
        aria-label={`Avisos: ${notices.length}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Bell size={18} />
        {notices.length > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-white text-[10px] font-bold leading-4 text-center tabular-nums ${hasDanger ? 'bg-danger' : 'bg-amber-500'}`}>
            {notices.length > 99 ? '99+' : notices.length}
          </span>
        )}
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
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-2/50">
              <h2 className="text-sm font-bold text-text-primary">Avisos</h2>
              <span className="text-[11px] text-text-muted">{notices.length === 0 ? 'Todo en orden' : `${notices.length} para revisar`}</span>
            </div>

            {notices.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-2">
                <CheckCircle2 size={26} className="mx-auto text-emerald-400" />
                <p className="text-xs text-text-secondary">No hay nada pendiente por ahora.</p>
              </div>
            ) : (
              <ul className="max-h-[60vh] overflow-y-auto divide-y divide-border/60">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onSelect(notice.route);
                      }}
                      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-surface-2 transition-colors"
                    >
                      <span className="mt-0.5 shrink-0">{SEVERITY_STYLE[notice.severity].icon}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold text-text-primary">{notice.title}</span>
                        <span className="block text-[11px] text-text-muted leading-relaxed mt-0.5">{notice.detail}</span>
                      </span>
                      <ChevronRight size={14} className="shrink-0 mt-1 text-text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
};
