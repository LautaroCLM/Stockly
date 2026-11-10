import React from 'react';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { formatDocumentNumber } from '../documentMath';
import { DOC_TYPE_LABELS } from '../types';
import type { DocumentRecord } from '../types';

interface DocumentsTableProps {
  documents: DocumentRecord[];
  onOpen: (doc: DocumentRecord) => void;
}

/** Lista de documentos emitidos; tocar una fila abre la vista previa. */
export const DocumentsTable: React.FC<DocumentsTableProps> = ({ documents, onOpen }) => (
  <div className="rounded-2xl border border-border overflow-hidden bg-surface">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-text-muted bg-surface-2/60 border-b border-border">
          <th className="p-3 font-semibold">Documento</th>
          <th className="p-3 font-semibold">Fecha</th>
          <th className="p-3 font-semibold">Cliente</th>
          <th className="p-3 font-semibold text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {documents.map((doc) => (
          <tr key={doc.id} className={`border-b border-border/60 last:border-0 hover:bg-surface-2/40 ${doc.status === 'voided' ? 'opacity-60' : ''}`}>
            <td className="p-3">
              <button onClick={() => onOpen(doc)} className="text-left focus:outline-none focus-visible:underline">
                <span className="font-semibold text-text-primary">{DOC_TYPE_LABELS[doc.type]}</span>{' '}
                <span className="text-text-secondary tabular-nums">{formatDocumentNumber(doc.pointOfSale, doc.number)}</span>
                {doc.status === 'voided' && <span className="ml-2 px-1.5 py-0.5 rounded bg-danger/10 border border-danger/25 text-danger text-[10px] font-bold">ANULADO</span>}
              </button>
            </td>
            <td className="p-3 text-text-secondary">{formatDateShort(doc.issueDate)}</td>
            <td className="p-3 text-text-primary break-words">{doc.customerName}</td>
            <td className="p-3 text-right tabular-nums text-text-primary">{doc.showPrices && doc.type !== 'garantia' ? formatCurrency(doc.total) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
