import { describe, expect, it } from 'vitest';
import { debtReminderMessage } from './debtReminder';
import type { AccountBalance } from './types';

const account: AccountBalance = {
  partyId: 'c1', partyName: 'Municipalidad', chargedTotal: 150000, settledTotal: 30000, balance: 120000,
  lastActivity: '2026-11-20T12:00:00Z', oldestOpenSince: '2026-10-05T12:00:00Z',
};

describe('debtReminderMessage', () => {
  it('incluye negocio, saldo en negrita y desde cuándo está pendiente', () => {
    const text = debtReminderMessage('Ferretería El Tornillo', account);
    expect(text).toContain('Hola Municipalidad');
    expect(text).toContain('*Ferretería El Tornillo*');
    expect(text).toMatch(/Saldo pendiente: \*\$\s?120\.000,00\* \(pendiente desde el 05\/10\/2026\)\./);
  });

  it('sin fecha de deuda no muestra el "desde"', () => {
    expect(debtReminderMessage('X', { ...account, oldestOpenSince: null })).not.toContain('desde el');
  });
});
