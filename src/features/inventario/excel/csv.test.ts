import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv';

describe('CSV', () => {
  it('detecta el separador que usa Excel en español (punto y coma)', () => {
    expect(detectDelimiter('SKU;Producto;Precio\nA;B;1,5')).toBe(';');
    expect(detectDelimiter('SKU,Producto,Precio')).toBe(',');
    expect(detectDelimiter('SKU\tProducto\tPrecio')).toBe('\t');
  });

  it('lee filas simples con coma decimal sin confundirla con el separador', () => {
    expect(parseCsv('SKU;Producto;Precio\nA-1;Milanesa;1.234,50\nA-2;Papa;10,5')).toEqual([
      ['SKU', 'Producto', 'Precio'], ['A-1', 'Milanesa', '1.234,50'], ['A-2', 'Papa', '10,5'],
    ]);
  });

  it('respeta comillas, comillas dobles y saltos de línea dentro de una celda', () => {
    expect(parseCsv('a,b\n"uno, dos","dice ""hola"""\n"línea\nnueva",x')).toEqual([
      ['a', 'b'], ['uno, dos', 'dice "hola"'], ['línea\nnueva', 'x'],
    ]);
  });

  it('acepta saltos de línea de Windows, BOM y última línea sin salto', () => {
    expect(parseCsv('﻿a;b\r\n1;2\r\n3;4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('conserva las celdas vacías', () => {
    expect(parseCsv('a;b;c\n1;;3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });
});
