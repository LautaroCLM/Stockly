import plugin from 'tailwindcss/plugin';

/**
 * Capa CSS del sistema de animaciones de Stockly (la capa Motion vive en src/lib/motion).
 *
 * Todo se hace con transform y opacity, sin JavaScript por elemento, y se reproduce solo cuando
 * el elemento se monta: actualizar un dato no repite nada. Con "reducir movimiento" no se anima.
 *
 * Qué define:
 *  1. Variables de tiempo y curva (--ease-out, --motion-*). Deben coincidir con src/lib/motion/tokens.ts.
 *  2. Utilidades `animate-in`, `fade-in`, `zoom-in-*`, `slide-in-from-*`, `duration-*`
 *     (el código ya las usaba, pero sin ninguna librería que las definiera no hacían nada).
 *  3. Entrada de página: `.page-enter` escalona de arriba hacia abajo los bloques de la pantalla
 *     y, dentro de un contenedor con `data-stagger`, sus tarjetas.
 *  4. Base global: foco suave en campos, aviso discreto en mensajes de error y respuesta al presionar.
 */
export default plugin(({ addBase, addComponents, addUtilities, matchUtilities, theme }) => {
  addBase({
    ':root': {
      '--ease-out': 'cubic-bezier(0.22, 1, 0.36, 1)',
      '--motion-fast': '150ms',
      '--motion-base': '220ms',
      '--motion-page': '300ms',
      '--motion-stagger': '40ms',
    },
    '@keyframes enter': {
      from: {
        opacity: 'var(--enter-opacity, 1)',
        transform:
          'translate3d(var(--enter-x, 0), var(--enter-y, 0), 0) scale3d(var(--enter-scale, 1), var(--enter-scale, 1), 1)',
      },
    },
    '@keyframes enter-down': {
      from: { opacity: '0', transform: 'translate3d(0, -8px, 0)' },
    },

    // Campos: el foco cambia el borde y el aro con suavidad
    'input, select, textarea': {
      transitionProperty: 'border-color, box-shadow, background-color, opacity',
      transitionDuration: 'var(--motion-fast)',
      transitionTimingFunction: 'var(--ease-out)',
    },
    // Mensajes de error y avisos: aparecen con un pequeño descenso, una sola vez
    '[role="alert"]': {
      animation: 'enter-down var(--motion-base) var(--ease-out) backwards',
    },
    // Botones: respuesta breve al presionar (los deshabilitados no reaccionan)
    'button:not(:disabled):active, [role="tab"]:active': {
      transform: 'scale(0.98)',
    },
    'button, [role="tab"]': {
      transitionProperty: 'color, background-color, border-color, opacity, box-shadow, transform',
      transitionDuration: 'var(--motion-fast)',
      transitionTimingFunction: 'var(--ease-out)',
    },
  });

  // Utilidades de entrada. El estado inicial sale de variables que cada clase (fade-in, zoom-in-95...) define.
  // El relleno es "backwards": al terminar no queda ningún transform activo (un transform dejaría
  // de funcionar a position: fixed en los hijos, como los modales).
  addUtilities({
    '.animate-in': {
      animationName: 'enter',
      animationDuration: 'var(--motion-base)',
      animationTimingFunction: 'var(--ease-out)',
      animationFillMode: 'backwards',
    },
    '.fade-in': { '--enter-opacity': '0' },
    '.zoom-in': { '--enter-scale': '0.5' },
    '.zoom-in-95': { '--enter-scale': '0.95' },
    '.slide-in-from-top': { '--enter-y': '-8px' },
    '.slide-in-from-right': { '--enter-x': '100%' },
    '.slide-in-from-left': { '--enter-x': '-100%' },
  });
  // duration-* también fija la duración de la animación
  matchUtilities({ duration: (value) => ({ animationDuration: value }) }, { values: theme('transitionDuration') });

  // Entrada de página: bloques de arriba hacia abajo y tarjetas escalonadas.
  // Solo actúa mientras el contenedor tiene la clase (PageEnter la quita al terminar), así que
  // lo que se muestre después (modales, datos nuevos) no hereda demoras.
  const nth = (n) => `> *:nth-child(${n})`;
  const sections = {};
  const cards = {};
  for (let i = 1; i <= 8; i += 1) {
    sections[`.page-enter > * ${nth(i)}`] = { '--i': String(i - 1) };
    cards[`.page-enter [data-stagger] ${nth(i)}`] = { '--i': String(i - 1) };
  }
  addComponents({
    '.page-enter > *': { animation: 'enter-down var(--motion-base) var(--ease-out) backwards' },
    '.page-enter > * > *': {
      animation: 'enter-down var(--motion-page) var(--ease-out) backwards',
      animationDelay: 'calc(var(--i, 8) * var(--motion-stagger))',
    },
    ...sections,
    '.page-enter > * > [data-stagger]': { animation: 'none' },
    '.page-enter [data-stagger] > *': {
      animation: 'enter-down var(--motion-page) var(--ease-out) backwards',
      animationDelay: 'calc(120ms + var(--i, 8) * var(--motion-stagger))',
    },
    ...cards,
  });

  addBase({
    '@media (prefers-reduced-motion: reduce)': {
      '.animate-in, .page-enter > *, .page-enter > * > *, .page-enter [data-stagger] > *, [role="alert"]': {
        animation: 'none !important',
      },
      'button:not(:disabled):active, [role="tab"]:active': { transform: 'none' },
    },
  });
});
