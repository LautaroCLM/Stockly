import type { Company } from '@/types';
import type { DocumentItem, DocumentRecord, DocumentSettings } from '../types';

/** Todo lo que hace falta para dibujar un documento imprimible. */
export interface PrintableDocument {
  doc: DocumentRecord;
  items: DocumentItem[];
  company: Company;
  settings: DocumentSettings;
}
