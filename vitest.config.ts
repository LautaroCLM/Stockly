import { configDefaults, defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Las pruebas usan la misma configuración que la app (alias @, etc.).
// Se excluyen carpetas que no son de Stockly: herramientas instaladas (.agents) y trabajo temporal (scratch).
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...configDefaults.exclude, '.agents/**', 'scratch/**'],
    },
  })
);
