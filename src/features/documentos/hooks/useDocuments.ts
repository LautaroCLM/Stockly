import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { createDocumentRpc, fetchDocuments, voidDocumentRpc } from '../api/documentsApi';
import type { CreatedDocument, DocumentActionResult, DocumentFilters, DocumentPayload, DocumentRecord } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['documents'];

/** Lista de documentos de la empresa (con filtros), en vivo. */
export function useDocuments(companyId: string, enabled: boolean, filters: DocumentFilters) {
  const [documents, setDocuments] = useState<DocumentRecord[] | null>(null);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const { type, query, includeVoided } = filters;

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchDocuments(companyId, { type, query, includeVoided });
      if (requestId === requestIdRef.current) setDocuments(list);
    } catch (err) {
      // Se conservan los datos ya visibles ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar los documentos.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled, type, query, includeVoided]);

  useEffect(() => {
    setDocuments(null);
  }, [companyId]);

  useEffect(() => {
    // Con pausa corta al escribir en el buscador, para no consultar en cada tecla
    const timer = setTimeout(() => void load(), query === '' ? 0 : 250);
    return () => {
      clearTimeout(timer);
      requestIdRef.current += 1;
    };
  }, [load, query]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const createDocument = useCallback(
    async (payload: DocumentPayload, idempotencyKey: string): Promise<DocumentActionResult<CreatedDocument>> => {
      const result = await createDocumentRpc(companyId, payload, idempotencyKey);
      // También tras un resultado incierto: puede haberse emitido igual
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [companyId, load]
  );

  const voidDocument = useCallback(
    async (documentId: string, reason: string): Promise<DocumentActionResult> => {
      const result = await voidDocumentRpc(companyId, documentId, reason);
      if (result.ok) await load();
      return result;
    },
    [companyId, load]
  );

  return { documents, isLoading, error, reload: load, createDocument, voidDocument };
}
