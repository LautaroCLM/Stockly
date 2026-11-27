import { describe, expect, it } from 'vitest';
import { parseTransferQuantity, validateTransfer } from './transferDraft';
import type { StockByWarehouse, TransferLine } from './types';

const stock: StockByWarehouse = new Map([['p', new Map([['A', 5], ['B', 0]])]]);
const line = (quantity: number): TransferLine => ({ productId: 'p', name: 'Taladro', sku: 'T', unit: 'unidad', quantity });

describe('parseTransferQuantity', () => {
  it('acepta coma decimal según la unidad', () => {
    expect(parseTransferQuantity('3', 'unidad')).toBe(3);
    expect(parseTransferQuantity('2,5', 'kg')).toBe(2.5);
    expect(parseTransferQuantity('2,5', 'unidad')).toBeNull();
    expect(parseTransferQuantity('0', 'kg')).toBeNull();
    expect(parseTransferQuantity('abc', 'kg')).toBeNull();
  });
});

describe('validateTransfer', () => {
  it('pide depósitos distintos y productos', () => {
    expect(validateTransfer('', 'B', [line(1)], stock)).toMatch(/origen/);
    expect(validateTransfer('A', 'A', [line(1)], stock)).toMatch(/distintos/);
    expect(validateTransfer('A', 'B', [], stock)).toMatch(/al menos/);
  });
  it('no deja transferir más de lo que hay en el origen', () => {
    expect(validateTransfer('A', 'B', [line(5)], stock)).toBeNull();
    expect(validateTransfer('A', 'B', [line(6)], stock)).toMatch(/hay 5 unidad/);
    expect(validateTransfer('B', 'A', [line(1)], stock)).toMatch(/hay 0/);
  });
});
