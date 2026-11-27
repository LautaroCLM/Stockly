import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  // El círculo del cambio de tema nace desde el centro del botón
  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggleTheme({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={label}
      aria-label={label}
      className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/80 bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors focus:outline-none overflow-hidden"
    >
      {/* El ícono gira y se achica al salir; el nuevo entra girando desde el otro lado */}
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={isDark ? 'sun' : 'moon'}
          initial={{ rotate: isDark ? -90 : 90, scale: 0.4, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          exit={{ rotate: isDark ? 90 : -90, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="flex"
        >
          {isDark ? <Sun size={16} /> : <Moon size={16} />}
        </m.span>
      </AnimatePresence>
    </button>
  );
};
