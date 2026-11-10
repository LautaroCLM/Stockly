import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchDocumentById, fetchDocumentItems } from '../api/documentsApi';
import type { DocumentItem, DocumentRecord } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['documents'];

/** Un documento con sus ítems (para verlo, imprimirlo o anularlo). Se actualiza si lo anulan desde otra PC. */
export function useDocumentDetail(companyId: string, documentId: string) {
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [record, lines] = await Promise.all([fetchDocumentById(companyId, documentId), fetchDocumentItems(companyId, documentId)]);
      setDoc(record);
      setItems(lines);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo cargar el documento.'));
    }
  }, [companyId, documentId]);

  useEffect(() => {
    setDoc(null);
    void load();
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  return { doc, items, error, reload: load };
}
