import { describe, expect, it } from 'vitest';
import type { NavSection, RouteId } from '@/types';
import { applyHiddenRoutes, toggleHiddenRoute } from './hiddenRoutes';
import { parseHiddenRoutes, serializeHiddenRoutes } from './schemas';

const SECTIONS: NavSection[] = [
  {
    title: 'Operaciones',
    items: [
      { id: 'dashboard', label: 'Dashboard', path: '/', iconName: 'LayoutDashboard' },
      { id: 'inventario', label: 'Inventario', path: '/inventario', iconName: 'Boxes' },
    ],
  },
  {
    title: 'Equipos',
    items: [{ id: 'maquinas', label: 'Máquinas', path: '/maquinas', iconName: 'Tractor' }],
  },
];

const ids = (sections: NavSection[]) => sections.flatMap((s) => s.items.map((i) => i.id));

describe('applyHiddenRoutes', () => {
  it('sin módulos ocultos muestra todo', () => {
    expect(ids(applyHiddenRoutes(SECTIONS, new Set()))).toEqual(['dashboard', 'inventario', 'maquinas']);
  });

  it('quita los módulos ocultos y la sección que queda vacía', () => {
    const result = applyHiddenRoutes(SECTIONS, new Set<RouteId>(['maquinas']));
    expect(ids(result)).toEqual(['dashboard', 'inventario']);
    expect(result.map((s) => s.title)).toEqual(['Operaciones']);
  });

  it('Inicio se muestra aunque figure como oculto', () => {
    expect(ids(applyHiddenRoutes(SECTIONS, new Set<RouteId>(['dashboard', 'inventario'])))).toEqual(['dashboard', 'maquinas']);
  });
});

describe('toggleHiddenRoute', () => {
  it('oculta y vuelve a mostrar sin repetidos', () => {
    const hidden = toggleHiddenRoute(['maquinas'], 'inventario', false);
    expect(hidden).toEqual(['inventario', 'maquinas']);
    expect(toggleHiddenRoute(hidden, 'inventario', false)).toEqual(['inventario', 'maquinas']);
    expect(toggleHiddenRoute(hidden, 'maquinas', true)).toEqual(['inventario']);
  });

  it('no permite ocultar Inicio', () => {
    expect(toggleHiddenRoute([], 'dashboard', false)).toEqual([]);
  });
});

describe('parseHiddenRoutes', () => {
  it('descarta valores inválidos o módulos que ya no existen', () => {
    expect(parseHiddenRoutes(['maquinas', 'modulo-viejo', 3, 'maquinas', 'gastos'])).toEqual(['atmosferico', 'gastos', 'maquinas', 'municipio']);
  });

  it('sin datos devuelve una lista vacía', () => {
    expect(parseHiddenRoutes(null)).toEqual(['atmosferico', 'municipio']);
    expect(parseHiddenRoutes(undefined)).toEqual(['atmosferico', 'municipio']);
  });
});

describe('módulos que vienen ocultos', () => {
  it('Atmosférico y Municipio arrancan ocultos y se muestran solo si se activaron', () => {
    expect(parseHiddenRoutes([])).toEqual(['atmosferico', 'municipio']);
    expect(parseHiddenRoutes(['show:municipio'])).toEqual(['atmosferico']);
    expect(parseHiddenRoutes(['show:atmosferico', 'show:municipio', 'gastos'])).toEqual(['gastos']);
  });

  it('guardar y volver a leer da lo mismo', () => {
    const cases: RouteId[][] = [['atmosferico', 'municipio'], ['gastos'], ['atmosferico', 'gastos'], []];
    for (const hidden of cases) expect(parseHiddenRoutes(serializeHiddenRoutes(hidden))).toEqual([...hidden].sort());
    expect(serializeHiddenRoutes(['gastos'])).toEqual(['gastos', 'show:atmosferico', 'show:municipio']);
  });
});
