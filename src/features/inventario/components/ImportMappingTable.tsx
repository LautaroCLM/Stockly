import React from 'react';
import { FIELD_INFO, IMPORT_FIELDS } from '../excel/columns';
import type { ColumnMapping, ImportField } from '../excel/columns';
import { cellText } from '../excel/values';

const SELECT_CLASS =
  'h-8 px-2 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary cursor-pointer w-full';

interface ImportMappingTableProps {
  table: unknown[][];
  mapping: ColumnMapping;
  disabled?: boolean;
  onAssign: (column: number, field: ImportField | null) => void;
}

/** Cada columna del archivo con unos ejemplos y a qué dato del producto va (o "No importar"). */
export const ImportMappingTable: React.FC<ImportMappingTableProps> = ({ table, mapping, disabled, onAssign }) => {
  const headers = table[0] ?? [];
  const fieldOfColumn = new Map<number, ImportField>();
  for (const field of IMPORT_FIELDS) {
    const index = mapping[field];
    if (index !== undefined) fieldOfColumn.set(index, field);
  }
  const samples = (column: number) =>
    table
      .slice(1)
      .map((row) => cellText(row[column]))
      .filter((value) => value !== '')
      .slice(0, 3);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-text-muted bg-surface-2/60 border-b border-border">
            <th className="p-2.5 font-semibold">Columna del archivo</th>
            <th className="p-2.5 font-semibold hidden sm:table-cell">Ejemplos</th>
            <th className="p-2.5 font-semibold w-[46%] sm:w-[34%]">Importar como</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header, column) => {
            const current = fieldOfColumn.get(column) ?? '';
            return (
              <tr key={column} className={`border-b border-border/60 last:border-0 ${current ? '' : 'opacity-70'}`}>
                <td className="p-2.5 text-text-primary font-medium break-words">{cellText(header) || `Columna ${column + 1}`}</td>
                <td className="p-2.5 text-text-muted hidden sm:table-cell break-words">{samples(column).join(' · ') || '—'}</td>
                <td className="p-2.5">
                  <select aria-label={`Destino de la columna ${cellText(header) || column + 1}`} value={current} disabled={disabled} className={SELECT_CLASS}
                    onChange={(e) => onAssign(column, (e.target.value || null) as ImportField | null)}>
                    <option value="">No importar</option>
                    {IMPORT_FIELDS.map((field) => <option key={field} value={field}>{FIELD_INFO[field].label}</option>)}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
