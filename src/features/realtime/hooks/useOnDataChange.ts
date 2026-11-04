import { useEffect, useRef } from 'react';
import { affectsTables, subscribeToDataChanges, type DataTable } from '../changeBus';

/** Espera para agrupar varios cambios seguidos (una venta toca varias tablas). */
const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Ejecuta `onChange` cuando cambia alguna de `tables` (o cuando se pide recargar todo).
 * Agrupa los avisos que llegan juntos para recargar una sola vez.
 * `tables` debe ser una constante fuera del componente.
 */
export function useOnDataChange(
  tables: readonly DataTable[],
  onChange: () => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS
): void {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = subscribeToDataChanges((change) => {
      if (!affectsTables(tables, change)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        callbackRef.current();
      }, debounceMs);
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [tables, debounceMs]);
}
