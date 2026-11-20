import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/80 bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3 transition-colors focus:outline-none"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};
