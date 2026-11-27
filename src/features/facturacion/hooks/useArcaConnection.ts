import { useCallback, useEffect, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { fetchArcaStatus, invokeArca, type ArcaFunctionResult } from '../api/arcaConnectionApi';
import { EMPTY_ARCA_STATUS, type ArcaFunctionAction, type ArcaStatus } from '../types';

/** Estado del certificado y acciones contra ARCA (generar pedido, cargar certificado, probar). */
export function useArcaConnection(companyId: string) {
  const [status, setStatus] = useState<ArcaStatus>(EMPTY_ARCA_STATUS);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ArcaFunctionAction | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setStatus(await fetchArcaStatus(companyId));
      setIsLoaded(true);
      setError(null);
    } catch (err) {
      setError(toUserMessage(err, 'No se pudo cargar el estado de la conexión con ARCA.'));
    }
  }, [companyId]);

  useEffect(() => {
    setIsLoaded(false);
    setStatus(EMPTY_ARCA_STATUS);
    void load();
  }, [load]);

  const run = useCallback(
    async (action: ArcaFunctionAction, extra?: Record<string, string>): Promise<ArcaFunctionResult> => {
      setBusyAction(action);
      try {
        const result = await invokeArca(action, companyId, extra);
        await load();
        return result;
      } finally {
        setBusyAction(null);
      }
    },
    [companyId, load]
  );

  return {
    status, isLoaded, error, busyAction, reload: load,
    generateCsr: () => run('generate_csr'),
    uploadCertificate: (certificatePem: string) => run('upload_certificate', { certificatePem }),
    testConnection: () => run('test_connection'),
  };
}
