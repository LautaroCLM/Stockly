import { describe, expect, it } from 'vitest';
import { csvNumber, toCsv } from './csv';

describe('csv', () => {
  it('usa coma decimal', () => {
    expect(csvNumber(1234.5)).toBe('1234,5');
    expect(csvNumber(-3)).toBe('-3');
  });

  it('separa con punto y coma, con BOM y saltos de línea de Windows', () => {
    expect(toCsv(['A', 'B'], [['1', '2']])).toBe('﻿A;B\r\n1;2\r\n');
  });

  it('escapa comillas, separadores y saltos de línea', () => {
    expect(toCsv(['X'], [['a;b'], ['dice "hola"'], ['l1\nl2']])).toBe('﻿X\r\n"a;b"\r\n"dice ""hola"""\r\n"l1\nl2"\r\n');
  });

  it('neutraliza fórmulas pero deja pasar números negativos', () => {
    expect(toCsv(['X'], [['=SUMA(A1)'], ['+1'], ['@x'], ['-cmd'], ['-5,5']])).toBe(
      "﻿X\r\n'=SUMA(A1)\r\n'+1\r\n'@x\r\n'-cmd\r\n-5,5\r\n"
    );
  });
});
