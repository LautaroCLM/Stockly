import { describe, expect, it } from 'vitest';
import { validateCategoryName } from './categoryValidation';
import type { Category } from './types';

const categories: Category[] = [{ id: 'c1', companyId: 'e1', name: 'Pinturas', createdAt: '2026-11-01' }];

describe('validateCategoryName', () => {
  it('exige nombre y limita el largo', () => {
    expect(validateCategoryName('  ', categories)).toMatch(/obligatorio/);
    expect(validateCategoryName('x'.repeat(101), categories)).toMatch(/100 caracteres/);
  });

  it('no permite repetir un nombre, sin importar mayúsculas ni espacios', () => {
    expect(validateCategoryName(' pinturas ', categories)).toMatch(/Ya existe/);
  });

  it('al renombrar, la propia categoría no cuenta como repetida', () => {
    expect(validateCategoryName('Pinturas', categories, 'c1')).toBeNull();
    expect(validateCategoryName('Herramientas', categories)).toBeNull();
  });
});
