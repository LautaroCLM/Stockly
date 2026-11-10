import { describe, expect, it } from 'vitest';
import { atLeast, effectiveLevel, isRouteVisible } from './access';
import { DEFAULT_LEVELS, PERMISSION_TEMPLATES } from './types';
import type { ModuleLevels } from './types';

const withLevels = (changes: Partial<ModuleLevels>): ModuleLevels => ({ ...DEFAULT_LEVELS, ...changes });

describe('permisos por módulo', () => {
  it('el administrador siempre opera, aunque no haya configuración', () => {
    expect(effectiveLevel(true, null, 'finanzas')).toBe('operate');
    expect(effectiveLevel(true, withLevels({ finanzas: 'none' }), 'finanzas')).toBe('operate');
  });

  it('el empleado, sin configuración, solo ficha', () => {
    expect(effectiveLevel(false, null, 'compras')).toBe('none');
    expect(effectiveLevel(false, null, 'fichaje')).toBe('operate');
  });

  it('compara niveles: ver no alcanza para operar', () => {
    expect(atLeast('view', 'view')).toBe(true);
    expect(atLeast('view', 'operate')).toBe(false);
    expect(atLeast('operate', 'view')).toBe(true);
    expect(atLeast('none', 'view')).toBe(false);
  });

  it('el menú del empleado muestra solo lo permitido', () => {
    const levels = withLevels({ compras: 'view', gastos: 'operate' });
    expect(isRouteVisible('compras', false, levels)).toBe(true);
    expect(isRouteVisible('gastos', false, levels)).toBe(true);
    expect(isRouteVisible('finanzas', false, levels)).toBe(false);
    expect(isRouteVisible('fichaje', false, levels)).toBe(true);
  });

  it('el administrador ve todo menos la pantalla simplificada de fichaje; Permisos es solo suya', () => {
    expect(isRouteVisible('finanzas', true, null)).toBe(true);
    expect(isRouteVisible('fichaje', true, null)).toBe(false);
    expect(isRouteVisible('config-permisos', true, null)).toBe(true);
    expect(isRouteVisible('config-permisos', false, withLevels({}))).toBe(false);
  });

  it('las pantallas sin módulo configurable siguen visibles', () => {
    expect(isRouteVisible('inventario', false, null)).toBe(true);
    expect(isRouteVisible('dashboard', false, null)).toBe(true);
  });

  it('la plantilla básica equivale al valor por defecto', () => {
    expect(PERMISSION_TEMPLATES[0]?.levels).toEqual(DEFAULT_LEVELS);
  });
});
