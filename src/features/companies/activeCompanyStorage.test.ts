import { describe, expect, it } from 'vitest';
import { pickActiveCompany } from './activeCompanyStorage';
import type { Company } from '@/types';

const company = (id: string) => ({ id, name: id }) as Company;
const list = [company('a'), company('b'), company('c')];

describe('pickActiveCompany', () => {
  it('prioriza la empresa preferida, después la guardada y si no la primera', () => {
    expect(pickActiveCompany(list, 'c', 'b')?.id).toBe('c');
    expect(pickActiveCompany(list, undefined, 'b')?.id).toBe('b');
    expect(pickActiveCompany(list)?.id).toBe('a');
  });

  it('ignora ids que el servidor no confirmó para el usuario', () => {
    expect(pickActiveCompany(list, 'ajena', 'otra-ajena')?.id).toBe('a');
  });

  it('devuelve null si el usuario no tiene empresas', () => {
    expect(pickActiveCompany([], 'a')).toBeNull();
  });
});
