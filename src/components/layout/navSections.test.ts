import { describe, expect, it } from 'vitest';
import { NAV_SECTIONS, withCartBadge } from './navSections';

const inventoryItem = (sections: typeof NAV_SECTIONS) =>
  sections.flatMap((s) => s.items).find((i) => i.id === 'inventario');

describe('withCartBadge', () => {
  it('no muestra badge con el carrito vacío', () => {
    expect(inventoryItem(withCartBadge(NAV_SECTIONS, 0))?.badge).toBeUndefined();
  });

  it('muestra la cantidad del carrito en Inventario', () => {
    expect(inventoryItem(withCartBadge(NAV_SECTIONS, 3))?.badge).toBe('Carrito: 3');
  });

  it('no modifica las secciones originales', () => {
    withCartBadge(NAV_SECTIONS, 2);
    expect(inventoryItem(NAV_SECTIONS)?.badge).toBeUndefined();
  });
});
