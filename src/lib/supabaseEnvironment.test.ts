import { describe, expect, it } from 'vitest';
import { describeSupabaseEnvironment } from './supabaseEnvironment';

describe('describeSupabaseEnvironment', () => {
  it('reconoce instancias locales', () => {
    expect(describeSupabaseEnvironment('http://127.0.0.1:54321')).toBe('Supabase local');
    expect(describeSupabaseEnvironment('http://localhost:54450')).toBe('Supabase local');
  });

  it('reconoce el proyecto en la nube', () => {
    expect(describeSupabaseEnvironment('https://abcdefgh.supabase.co')).toBe('Supabase en la nube');
  });

  it('no falla con una URL inválida', () => {
    expect(describeSupabaseEnvironment('no-es-url')).toBe('Supabase (URL inválida)');
  });
});
