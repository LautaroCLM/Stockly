/** Número para CSV en formato es-AR (coma decimal), sin separador de miles. */
export function csvNumber(value: number): string {
  return String(value).replace('.', ',');
}

function escapeCell(cell: string): string {
  // Se neutraliza el inicio de fórmula para que Excel no ejecute texto cargado por usuarios
  const safe = /^[=+@\t\r]/.test(cell) || /^-[^0-9]/.test(cell) ? `'${cell}` : cell;
  return /[;"\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Texto CSV con ';' como separador (el que abre bien Excel en es-AR) y BOM UTF-8. */
export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((line) => line.map(escapeCell).join(';'));
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
