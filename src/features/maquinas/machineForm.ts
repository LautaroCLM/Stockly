import type { Machine, MachineInput } from './types';

export const EMPTY_MACHINE: MachineInput = {
  machineId: null, name: '', type: 'retroexcavadora', identifier: '', brand: '', model: '', year: '', status: 'active', notes: '',
};

export function machineToInput(machine: Machine): MachineInput {
  return {
    machineId: machine.id,
    name: machine.name,
    type: machine.type,
    identifier: machine.identifier ?? '',
    brand: machine.brand ?? '',
    model: machine.model ?? '',
    year: machine.year === null ? '' : String(machine.year),
    status: machine.status,
    notes: machine.notes ?? '',
  };
}

/** Año del modelo como número, o null si está vacío o no es válido. */
export function parseYear(value: string): number | null {
  const clean = value.trim();
  if (!/^\d{4}$/.test(clean)) return null;
  const year = Number(clean);
  return year >= 1950 && year <= 2100 ? year : null;
}

/** Valida antes de guardar. Devuelve el mensaje de error o null. */
export function validateMachine(input: MachineInput): string | null {
  if (!input.name.trim()) return 'Indicá el nombre de la máquina.';
  if (input.name.trim().length > 100) return 'El nombre no puede superar los 100 caracteres.';
  if (input.year.trim() && parseYear(input.year) === null) return 'El año debe tener 4 dígitos (entre 1950 y 2100).';
  if (input.notes.length > 500) return 'Las notas no pueden superar los 500 caracteres.';
  return null;
}
