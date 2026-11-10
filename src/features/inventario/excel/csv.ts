/** Separador más probable de un CSV: el que más aparece en la primera línea, fuera de comillas. */
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  if ((counts[';'] ?? 0) >= (counts[','] ?? 0) && (counts[';'] ?? 0) >= (counts['\t'] ?? 0) && (counts[';'] ?? 0) > 0) return ';';
  if ((counts['\t'] ?? 0) > (counts[','] ?? 0)) return '\t';
  return ',';
}

/** Lee un CSV (comillas, comillas dobles escapadas y saltos de línea dentro de una celda). */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (source[i + 1] === '\n') i += 1;
      endRow();
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) endRow();
  return rows;
}
