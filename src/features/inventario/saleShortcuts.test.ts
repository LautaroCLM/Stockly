import { describe, expect, it } from 'vitest';
import type { Product } from './types';
import { isCheckoutKey, isMinusKey, isPlusKey, isSearchKey, moveSelection, pickProductForQuery } from './saleShortcuts';

const product = (id: string, sku: string, barcode: string, name: string, isActive = true): Product => ({
  id, sku, barcode, name, category: 'General', salePrice: 100, vatRate: 21, costPrice: null, stock: 5, minStock: 1, unit: 'u', status: 'normal', isActive,
});

const tornillo = product('1', 'TOR-01', '7790001', 'Tornillo 6mm');
const tuerca = product('2', 'TUE-01', '7790002', 'Tuerca 6mm');
const viejo = product('3', 'VIE-01', '7790003', 'Taladro viejo', false);
const all = [tornillo, tuerca, viejo];

describe('pickProductForQuery', () => {
  it('elige por código de barras exacto aunque los filtros muestren varios', () => {
    expect(pickProductForQuery('7790002', all, all)).toBe(tuerca);
  });

  it('elige por SKU exacto sin importar mayúsculas ni espacios', () => {
    expect(pickProductForQuery('  tor-01 ', all, all)).toBe(tornillo);
  });

  it('no agrega productos desactivados aunque el código coincida', () => {
    expect(pickProductForQuery('7790003', [viejo], all)).toBeNull();
  });

  it('sin coincidencia exacta, usa el único producto activo que quedó filtrado', () => {
    expect(pickProductForQuery('tuer', [tuerca], all)).toBe(tuerca);
  });

  it('no elige nada si quedan varios productos o el texto está vacío', () => {
    expect(pickProductForQuery('6mm', [tornillo, tuerca], all)).toBeNull();
    expect(pickProductForQuery('   ', all, all)).toBeNull();
  });
});

describe('moveSelection', () => {
  it('arranca por el primero al bajar y por el último al subir', () => {
    expect(moveSelection(-1, 3, 1)).toBe(0);
    expect(moveSelection(-1, 3, -1)).toBe(2);
  });

  it('no se sale de los bordes', () => {
    expect(moveSelection(2, 3, 1)).toBe(2);
    expect(moveSelection(0, 3, -1)).toBe(0);
  });

  it('devuelve -1 con la lista vacía', () => {
    expect(moveSelection(0, 0, 1)).toBe(-1);
  });
});

describe('teclas', () => {
  it('reconoce + y − del teclado principal y del numérico', () => {
    expect(isPlusKey({ key: '+' })).toBe(true);
    expect(isPlusKey({ key: 'Add' })).toBe(true);
    expect(isMinusKey({ key: '-' })).toBe(true);
    expect(isMinusKey({ key: '-', ctrlKey: true })).toBe(false);
  });

  it('F2 busca en Inventario (Ctrl+K es la búsqueda global); F4 cobra', () => {
    expect(isSearchKey({ key: 'F2' })).toBe(true);
    expect(isSearchKey({ key: 'K', ctrlKey: true })).toBe(false);
    expect(isSearchKey({ key: 'k' })).toBe(false);
    expect(isCheckoutKey({ key: 'F4' })).toBe(true);
  });
});
