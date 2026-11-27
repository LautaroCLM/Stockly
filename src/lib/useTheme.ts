import { useCallback, useState } from 'react';
import { getInitialTheme, persistTheme, type Theme } from './theme';
import { transitionTheme, type ThemeOrigin } from './themeTransition';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('light') ? 'light' : getInitialTheme(),
  );

  /** Alterna oscuro/claro con animación; `origin` es de dónde nace el círculo (el botón apretado). */
  const toggleTheme = useCallback((origin?: ThemeOrigin) => {
    const next: Theme = document.documentElement.classList.contains('light') ? 'dark' : 'light';
    setTheme(next);
    transitionTheme(() => persistTheme(next), origin);
  }, []);

  return { theme, toggleTheme };
}
