import { describe, expect, it } from 'vitest';
import { buildCommandGroups, normalize, saleNumberFromQuery, type CommandSources } from './commandResults';

const sources = (over: Partial<CommandSources> = {}): CommandSources => ({
  routes: [
    { id: 'maquinas', label: 'Máquinas', path: '/maquinas', iconName: 'Tractor' },
    { id: 'clientes', label: 'Clientes', path: '/clientes', iconName: 'Users' },
  ],
  products: [
    { id: 'p1', name: 'Taladro percutor', sku: 'TAL-1', barcode: '7790001' },
    { id: 'p2', name: 'Martillo', sku: 'MAR-1', barcode: '', isActive: false },
  ],
  customers: [{ id: 'c1', name: 'Municipalidad de Pilar', taxId: '30-12345678-9' }],
  actions: [{ action: 'open-cart', label: 'Abrir el carrito', icon: 'ShoppingCart' }],
  canSeeSales: true,
  ...over,
});

const titles = (q: string, over?: Partial<CommandSources>) => buildCommandGroups(q, sources(over)).map((g) => g.title);
const labels = (q: string) => buildCommandGroups(q, sources()).flatMap((g) => g.items.map((i) => i.label));

describe('normalize', () => {
  it('ignora mayúsculas y tildes', () => expect(normalize('  Máquinas ')).toBe('maquinas'));
});

describe('saleNumberFromQuery', () => {
  it('arma el número de venta', () => {
    expect(saleNumberFromQuery('5')).toBe('VTA-00000005');
    expect(saleNumberFromQuery('vta 12')).toBe('VTA-00000012');
    expect(saleNumberFromQuery('VTA-00000005')).toBe('VTA-00000005');
    expect(saleNumberFromQuery('taladro')).toBeNull();
  });
});

describe('buildCommandGroups', () => {
  it('sin texto muestra acciones y pantallas', () => {
    expect(titles('')).toEqual(['Acciones', 'Ir a']);
  });

  it('encuentra pantallas sin tildes y productos activos por nombre, SKU o código', () => {
    expect(labels('maquinas')).toContain('Máquinas');
    expect(labels('tal-1')).toContain('Taladro percutor');
    expect(labels('7790001')).toContain('Taladro percutor');
    expect(labels('martillo')).not.toContain('Martillo');
  });

  it('encuentra clientes por nombre o CUIT', () => {
    expect(labels('pilar')).toContain('Municipalidad de Pilar');
    expect(labels('12345678')).toContain('Municipalidad de Pilar');
  });

  it('ofrece buscar una venta por número solo si puede verlas', () => {
    expect(labels('5')).toContain('Buscar la venta VTA-00000005');
    expect(titles('5', { canSeeSales: false })).not.toContain('Ventas');
  });
});
