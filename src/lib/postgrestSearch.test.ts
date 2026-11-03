import { describe, expect, it } from 'vitest';
import { buildSearchOrFilter, MAX_SEARCH_IDS, quoteSearchTerm } from './postgrestSearch';

describe('quoteSearchTerm', () => {
  it('envuelve el término con comodines y comillas', () => {
    expect(quoteSearchTerm('R-0021')).toBe('"*R-0021*"');
  });

  it('escapa comillas y barras, y conserva comas y paréntesis dentro de las comillas', () => {
    expect(quoteSearchTerm('a "b" \\ (c), d')).toBe('"*a \\"b\\" \\\\ (c), d*"');
  });

  it('descarta el comodín * del usuario', () => {
    expect(quoteSearchTerm('*abc*')).toBe('"*abc*"');
  });
});

describe('buildSearchOrFilter', () => {
  it('devuelve null sin texto de búsqueda', () => {
    expect(buildSearchOrFilter('  ', ['notes'])).toBeNull();
    expect(buildSearchOrFilter('***', ['notes'])).toBeNull();
  });

  it('combina columnas de texto e ids', () => {
    expect(
      buildSearchOrFilter('tornillo', ['reference_doc', 'notes'], { column: 'product_id', ids: ['a', 'b'] })
    ).toBe('reference_doc.ilike."*tornillo*",notes.ilike."*tornillo*",product_id.in.(a,b)');
  });

  it('omite el filtro de ids si no hay coincidencias', () => {
    expect(buildSearchOrFilter('x', ['notes'], { column: 'product_id', ids: [] })).toBe('notes.ilike."*x*"');
  });

  it('acota la cantidad de ids', () => {
    const ids = Array.from({ length: MAX_SEARCH_IDS + 50 }, (_, i) => `id${i}`);
    const filter = buildSearchOrFilter('x', [], { column: 'product_id', ids });
    expect(filter?.split(',').length).toBe(MAX_SEARCH_IDS);
  });
});
