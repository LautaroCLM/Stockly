export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'stockly.theme';

/** El navegador puede bloquear localStorage: nunca debe romper la app. */
function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Sin persistencia: el tema sigue aplicándose en esta sesión.
  }
}

/** Tema guardado; si no hay, el del sistema operativo. */
export function getInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  const prefersLight =
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: light)').matches;
  return prefersLight ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.classList.toggle('light', theme === 'light');
  root.style.colorScheme = theme;
}

export function persistTheme(theme: Theme): void {
  storeTheme(theme);
  applyTheme(theme);
}
