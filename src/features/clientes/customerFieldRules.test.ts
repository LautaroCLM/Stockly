import { describe, expect, it } from 'vitest';
import { emailError, formatTaxIdInput, taxIdError } from './customerFieldRules';

describe('reglas de los campos de cliente', () => {
  it('solo valida y da formato de CUIT a CUIT y CUIL', () => {
    expect(taxIdError('DNI', '123')).toBeNull();
    expect(taxIdError('CUIT', '20-12345678-0')).toMatch(/no es válido/);
    expect(taxIdError('CUIL', '')).toBeNull();
    expect(formatTaxIdInput('DNI', '35123456')).toBe('35123456');
  });

  it('valida el formato del correo y acepta vacío', () => {
    expect(emailError('')).toBeNull();
    expect(emailError('cliente@ejemplo.com')).toBeNull();
    expect(emailError('cliente@')).toMatch(/inválido/);
  });
});
