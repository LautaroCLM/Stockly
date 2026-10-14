---
name: diseno-stock-app
description: Sistema de diseño de Stock App (tema oscuro, sidebar agrupado, tarjetas de métricas, gráficos de área azules). Usar al crear o modificar cualquier pantalla, componente visual, tabla o gráfico de la app.
---

# Diseño de Stock App

Referencia visual: dashboard oscuro y moderno, con sidebar lateral, saludo grande arriba,
tarjetas de métricas, gráfico de área azul y listas compactas. Seguir esta guía en toda pantalla
para que la app se vea como un solo producto.

## Colores (definir como variables CSS y mapearlas en Tailwind)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#060A13` | fondo de la app |
| `--surface` | `#0B1220` | tarjetas y sidebar |
| `--surface-2` | `#101A2E` | hover, inputs, elementos elevados |
| `--border` | `#1C2742` | bordes de 1px |
| `--text` | `#E8EEFB` | texto principal |
| `--text-muted` | `#7C8AA8` | etiquetas y texto secundario |
| `--primary` | `#2F6BFF` | botón principal, ítem activo, líneas de gráfico |
| `--accent` | `#27D3F5` | cifras destacadas, segunda serie de gráficos |
| `--success` | `#34D399` | estados correctos |
| `--warning` | `#F5B942` | stock bajo |
| `--danger` | `#F2576B` | sin stock, acciones destructivas |

Los valores son una aproximación de la imagen de referencia. Ajustar en un solo lugar (las variables) si hace falta.
Dejar los tokens listos para sumar un tema claro más adelante.

## Tipografía
- Títulos de página (saludo, nombre de sección): serif con carácter (Newsreader o Fraunces), peso 600.
- Todo lo demás: sans moderna (Inter o Geist).
- Cifras de tablas y métricas: `font-variant-numeric: tabular-nums`.
- Escala: 12 (etiquetas) / 14 (cuerpo y tablas) / 16 / 20 / 28 (títulos) / 36 (cifra principal).

## Layout
- Sidebar fijo de 240 px: logo arriba, navegación en grupos con un pequeño título gris por grupo,
  ítem activo con fondo `--primary` suave y texto claro, "Cerrar sesión" al final.
- Contenido con ancho máximo y márgenes generosos. Arriba: saludo con el nombre del usuario y su rol.
- Primera fila de cada dashboard: tarjetas de métricas (cifra grande en `--accent` o `--primary`, descripción corta debajo).
- Debajo: gráfico principal y listas o tablas en una grilla de 2 columnas.

## Componentes
- **Tarjetas:** `--surface`, borde de 1px `--border`, radio 12 px, sin sombras pesadas.
- **Botones:** principal relleno `--primary` (con un leve brillo azul); secundario con fondo `--surface-2` y borde.
  El texto dice la acción exacta: "Agregar producto", "Guardar cambios".
- **Tablas:** cabecera en `--text-muted`, filas de 48 px, hover en `--surface-2`.
  El estado se muestra con una insignia (badge) de color, nunca pintando toda la fila.
  Las acciones por fila van en un menú de tres puntos, no en tres botones.
- **Insignias:** fondo del color al 15 % de opacidad, texto del color pleno.
- **Gráficos (Recharts):** área con relleno degradado de `--primary` al 35 % a transparente,
  línea de 2 px, segunda serie en `--accent`, ejes y grilla muy sutiles.
- **Formularios:** etiqueta arriba, errores debajo del campo en `--danger`, con texto que explique cómo corregir.
- **Íconos:** lucide-react, un solo tamaño por contexto. Sin emojis como íconos.

## Estados y movimiento
- Toda pantalla tiene estado de carga (skeletons), vacío (con una acción sugerida) y error.
- Movimiento solo como respuesta a una acción del usuario: abrir modales, expandir paneles, confirmar. Sin animaciones decorativas.
- Respetar `prefers-reduced-motion`.

## Calidad mínima
- Contraste legible en todo el texto, foco de teclado visible en todos los controles.
- Responsive: en pantallas chicas el sidebar pasa a menú desplegable y las tablas se desplazan horizontalmente dentro de su contenedor.
- Moneda en formato es-AR ($4.500,00) y fechas dd/mm/aaaa.

## Evitar
- Filas enteras de color rojo o rosa para indicar estado.
- Varios botones de texto por fila.
- Mezclar radios de borde, colores o tamaños de texto fuera de esta guía.
- Degradados decorativos en fondos de tarjetas.
