import { describe, expect, it } from 'vitest';
import { buildNotices } from './buildNotices';
import type { NoticeSources } from './types';

const NOW = new Date('2026-11-10T15:00:00');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

const empty: NoticeSources = {
  restock: [], customerDebts: null, supplierDebts: null, openAttendance: null, openCashSince: undefined, attendanceRoute: 'personal',
};
const sources = (changes: Partial<NoticeSources>): NoticeSources => ({ ...empty, ...changes });

describe('avisos de la campana', () => {
  it('sin nada para avisar, la lista queda vacía', () => {
    expect(buildNotices(empty, NOW)).toEqual([]);
    expect(buildNotices(sources({ customerDebts: [], supplierDebts: [], openAttendance: [], openCashSince: null }), NOW)).toEqual([]);
  });

  it('avisa de los productos a reponer y es urgente si alguno está sin stock', () => {
    const [notice] = buildNotices(sources({ restock: [{ name: 'Tornillo', stock: 2, minStock: 10, unit: 'unidad' }] }), NOW);
    expect(notice?.severity).toBe('warning');
    expect(notice?.route).toBe('inventario');
    const [urgent] = buildNotices(sources({ restock: [{ name: 'Clavo', stock: 0, minStock: 10, unit: 'unidad' }] }), NOW);
    expect(urgent?.severity).toBe('danger');
    expect(urgent?.title).toBe('1 producto para reponer');
  });

  it('las deudas de clientes avisan recién pasados los 30 días y suman exacto', () => {
    const none = buildNotices(sources({ customerDebts: [{ name: 'Ana', balance: 100, oldestOpenSince: daysAgo(10) }] }), NOW);
    expect(none).toEqual([]);
    const [notice] = buildNotices(sources({
      customerDebts: [
        { name: 'Ana', balance: 100.1, oldestOpenSince: daysAgo(40) },
        { name: 'Beto', balance: 200.2, oldestOpenSince: daysAgo(35) },
        { name: 'Cora', balance: 50, oldestOpenSince: daysAgo(5) },
      ],
    }), NOW);
    expect(notice?.severity).toBe('warning');
    expect(notice?.title).toBe('2 clientes con deuda de más de 30 días');
    expect(notice?.detail).toContain('300,30');
    expect(notice?.detail).not.toContain('Cora');
  });

  it('una deuda de más de 60 días es urgente', () => {
    const [notice] = buildNotices(sources({ customerDebts: [{ name: 'Ana', balance: 100, oldestOpenSince: daysAgo(70) }] }), NOW);
    expect(notice?.severity).toBe('danger');
  });

  it('las deudas con proveedores usan su propio texto', () => {
    const [notice] = buildNotices(sources({ supplierDebts: [{ name: 'Acme', balance: 500, oldestOpenSince: daysAgo(45) }] }), NOW);
    expect(notice?.title).toBe('1 proveedor con deuda de más de 30 días');
    expect(notice?.detail.startsWith('Les debés')).toBe(true);
  });

  it('ignora saldos a favor y fuentes sin permiso', () => {
    expect(buildNotices(sources({ customerDebts: [{ name: 'Ana', balance: -50, oldestOpenSince: daysAgo(90) }] }), NOW)).toEqual([]);
    expect(buildNotices(sources({ customerDebts: null, supplierDebts: null }), NOW)).toEqual([]);
  });

  it('avisa de entradas sin salida con más de 12 horas', () => {
    expect(buildNotices(sources({ openAttendance: [{ employeeName: 'Juan', checkIn: hoursAgo(3) }] }), NOW)).toEqual([]);
    const [notice] = buildNotices(sources({ openAttendance: [{ employeeName: 'Juan', checkIn: hoursAgo(20) }], attendanceRoute: 'fichaje' }), NOW);
    expect(notice?.title).toBe('1 entrada sin salida');
    expect(notice?.route).toBe('fichaje');
  });

  it('avisa si la caja quedó abierta de un día anterior, no si es de hoy', () => {
    expect(buildNotices(sources({ openCashSince: new Date('2026-11-10T08:00:00').toISOString() }), NOW)).toEqual([]);
    const [notice] = buildNotices(sources({ openCashSince: new Date('2026-11-09T18:00:00').toISOString() }), NOW);
    expect(notice?.route).toBe('caja');
  });

  it('ordena de lo más urgente a lo menos', () => {
    const notices = buildNotices(sources({
      restock: [{ name: 'Tornillo', stock: 2, minStock: 10, unit: 'unidad' }],
      customerDebts: [{ name: 'Ana', balance: 100, oldestOpenSince: daysAgo(90) }],
    }), NOW);
    expect(notices.map((n) => n.id)).toEqual(['customer-debts', 'restock']);
  });

  it('con muchos nombres, resume con "y N más"', () => {
    const restock = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, stock: 1, minStock: 5, unit: 'unidad' }));
    const [notice] = buildNotices(sources({ restock }), NOW);
    expect(notice?.detail).toContain('A, B, C y 2 más');
  });
});
