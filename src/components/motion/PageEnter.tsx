import React, { useEffect, useRef } from 'react';

/** Cuánto dura la secuencia completa de entrada (el último bloque termina antes de esto). */
const SEQUENCE_MS = 800;

interface PageEnterProps {
  /** Identifica la pantalla: al cambiar, se reproduce la entrada de la nueva. */
  routeKey: string;
  children: React.ReactNode;
}

/**
 * Entrada de pantalla: al abrir un módulo, sus bloques aparecen de arriba hacia abajo (encabezado,
 * subtítulo, controles, tarjetas...). Los contenedores marcados con `data-stagger` escalonan sus hijos.
 *
 * - Es solo CSS (transform y opacity): no re-renderiza nada ni anima filas de tablas.
 * - Se reproduce al montar la pantalla; actualizar datos o cambiar filtros no la repite.
 * - La clase se quita al terminar, así los modales y datos que aparezcan después no heredan demoras.
 * - No hay animación de salida: el módulo nuevo se muestra al instante, sin retrasar la navegación.
 */
export const PageEnter: React.FC<PageEnterProps> = ({ routeKey, children }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    const timer = window.setTimeout(() => node?.classList.remove('page-enter'), SEQUENCE_MS);
    return () => window.clearTimeout(timer);
  }, [routeKey]);

  // key: al cambiar de módulo se monta un contenedor nuevo y la secuencia vuelve a empezar
  return (
    <div key={routeKey} ref={ref} className="page-enter">
      {children}
    </div>
  );
};
