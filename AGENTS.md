# Stock App: reglas del proyecto

## Qué es
App de gestión de stock e inventario para La Perla Desarrolladora S.A.
Es una reescritura desde cero de una app anterior (Electron + Python + JavaScript, un solo archivo de ~10.000 líneas).
La app anterior es solo referencia funcional. No copiar su código ni su estructura.

Módulos: Inventario (el central), Historial, Empleados, Finanzas, Informes.
Roles: Master Admin y empleado (permisos por rol, definidos en la base de datos).

## Objetivos
1. Cero errores: TypeScript estricto y validación de datos en los bordes con Zod.
2. Código organizado, repartido en archivos pequeños y fácil de entender.
3. Diseño moderno, oscuro y consistente (ver la skill `diseno-stock-app`).

## Arquitectura
- **Online-first.** Supabase (Postgres, Auth, RLS, Realtime) es la única fuente de verdad.
  No hay modo local ni sincronización propia entre dos bases.
- **Una sola web app** (Vite + React + TypeScript). Más adelante se empaqueta como app de escritorio de 64 bits (Electron o Tauri).
  Android y PCs de 32 bits usan la misma web desde el navegador o como PWA.
- **Sin backend propio y sin Python.** Si hace falta lógica de servidor: funciones SQL o Supabase Edge Functions en TypeScript.

Stack: Vite, React, TypeScript (strict), TanStack Router, TanStack Query, Tailwind, shadcn/ui,
React Hook Form + Zod, Recharts, lucide-react, Supabase JS, Vitest.

## Estructura de carpetas
```
src/
├── routes/              # pantallas: solo ensamblan componentes de features
├── features/
│   ├── inventario/
│   │   ├── components/  # tabla, formulario, filtros
│   │   ├── hooks/       # useProductos, useCrearProducto
│   │   ├── api/         # consultas a Supabase (única capa que habla con la base)
│   │   ├── schemas.ts   # validaciones Zod
│   │   └── types.ts
│   ├── historial/  empleados/  finanzas/  informes/
├── components/ui/       # componentes reutilizables (botón, input, modal, tabla)
├── lib/                 # cliente Supabase, formateo de moneda y fechas
└── types/database.ts    # generado desde Supabase, no editar a mano
supabase/migrations/     # cada cambio de la base queda en un archivo versionado
```

## Base de datos
- El stock no se edita directamente: se calcula a partir de `stock_movements` (entradas y salidas).
  El Historial sale de esa misma tabla.
- Tablas base: `products`, `categories`, `suppliers`, `stock_movements`, `employees`, `transactions`, `audit_log`.
- RLS activado en todas las tablas. Los permisos por rol se aplican en la base, no solo en el frontend.
- Dinero con `numeric`, nunca float. Formato es-AR (ejemplo: $4.500,00).
- Tipos de TypeScript generados con Supabase CLI después de cada migración.

## Reglas de código
- Máximo ~200 líneas por archivo y una sola responsabilidad. Si crece, se divide.
- Prohibido `any`. Prohibido `// @ts-ignore` sin justificación escrita.
- Los componentes de UI nunca llaman a Supabase directo: pasan por `features/*/api` y hooks.
- Toda pantalla maneja estados de carga, vacío y error, con mensajes claros para el usuario.
- Código y nombres técnicos en inglés. Textos de la interfaz en español (es-AR).
- Tests para la lógica de stock y los cálculos de dinero.
- No agregar dependencias nuevas sin explicar por qué hacen falta.

## Forma de trabajar
- Trabajar por fases, una a la vez. Antes de cada fase: un plan breve. Al terminar: qué se hizo y cómo probarlo.
- No pasar a la siguiente fase sin confirmación del usuario.
- Si algo del pedido contradice estas reglas o parece poco lógico, avisar antes de implementarlo.

Fases:
1. Especificación (módulos, tablas, roles, pantallas) y estructura del repo.
2. Base de datos, autenticación y roles.
3. Layout general: sidebar, header, tema.
4. Inventario completo.
5. Historial y Empleados.
6. Finanzas e Informes.
7. Importar/exportar y migración de los datos de la app vieja.
8. Empaquetado de escritorio y PWA.
