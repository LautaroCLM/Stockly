/**
 * Utilidades para exportación, respaldo y verificación de localStorage en Stockly.
 * Operaciones 100% de lectura y descarga segura sin alterar los datos existentes.
 */

export interface StorageBackup {
  version: string;
  exportTimestamp: string;
  appName: string;
  data: Record<string, unknown>;
  metadata: {
    totalKeys: number;
    keys: string[];
  };
}

/**
 * Recopila todas las claves stockly_* presentes en localStorage del navegador
 * y devuelve una estructura JSON tipada y verificada.
 */
export function createStorageSnapshot(): StorageBackup {
  const data: Record<string, unknown> = {};
  const keys: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('stockly_')) {
      keys.push(key);
      try {
        const raw = localStorage.getItem(key);
        data[key] = raw ? JSON.parse(raw) : null;
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
  }

  return {
    version: '1.0',
    exportTimestamp: new Date().toISOString(),
    appName: 'Stockly SaaS',
    data,
    metadata: {
      totalKeys: keys.length,
      keys: keys.sort(),
    },
  };
}

/**
 * Dispara la descarga en el navegador de un archivo JSON con el respaldo completo
 * de todos los datos locales de Stockly.
 */
export function downloadStorageBackup(): void {
  const snapshot = createStorageSnapshot();
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `stockly-backup-${dateStr}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json;charset=utf-8',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
