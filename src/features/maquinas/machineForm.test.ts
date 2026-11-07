import { describe, expect, it } from 'vitest';
import { EMPTY_MACHINE, machineToInput, parseYear, validateMachine } from './machineForm';
import type { Machine } from './types';

describe('machineForm', () => {
  it('exige nombre', () => {
    expect(validateMachine(EMPTY_MACHINE)).toBe('Indicá el nombre de la máquina.');
    expect(validateMachine({ ...EMPTY_MACHINE, name: '  Retro 01 ' })).toBeNull();
  });

  it('valida el año', () => {
    expect(parseYear('2019')).toBe(2019);
    expect(parseYear('')).toBeNull();
    expect(parseYear('19')).toBeNull();
    expect(parseYear('1900')).toBeNull();
    expect(validateMachine({ ...EMPTY_MACHINE, name: 'X', year: '20x9' })).toContain('año');
    expect(validateMachine({ ...EMPTY_MACHINE, name: 'X', year: '' })).toBeNull();
  });

  it('convierte una máquina a datos de formulario', () => {
    const machine: Machine = {
      id: 'm1', name: 'Atmosférico 1', type: 'atmosferico', identifier: null, brand: 'Iveco', model: null,
      year: 2015, status: 'in_repair', notes: null,
    };
    expect(machineToInput(machine)).toEqual({
      machineId: 'm1', name: 'Atmosférico 1', type: 'atmosferico', identifier: '', brand: 'Iveco', model: '',
      year: '2015', status: 'in_repair', notes: '',
    });
  });
});
