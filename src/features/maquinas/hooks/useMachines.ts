import { useCallback, useEffect, useRef, useState } from 'react';
import { toUserMessage } from '@/lib/errorMessages';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import type { DataTable } from '@/features/realtime/changeBus';
import { fetchMachineCosts, fetchMachines, saveMachineRpc } from '../api/machinesApi';
import type { Machine, MachineActionResult, MachineCost, MachineInput } from '../types';

const REALTIME_TABLES: readonly DataTable[] = ['machines', 'expenses'];

/** Máquinas y sus costos del período, en vivo. Solo se consulta si el usuario es administrador. */
export function useMachines(companyId: string, enabled: boolean, from: string, to: string) {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [costs, setCosts] = useState<MachineCost[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!enabled || !companyId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const [list, summary] = await Promise.all([fetchMachines(companyId), fetchMachineCosts(companyId, from, to)]);
      if (requestId !== requestIdRef.current) return;
      setMachines(list);
      setCosts(summary);
    } catch (err) {
      // Se conservan los datos ya visibles ante un corte breve
      if (requestId === requestIdRef.current) setError(toUserMessage(err, 'No se pudieron cargar las máquinas.'));
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [companyId, enabled, from, to]);

  useEffect(() => {
    setMachines(null);
    setCosts([]);
  }, [companyId]);

  useEffect(() => {
    void load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  useOnDataChange(REALTIME_TABLES, () => {
    void load();
  });

  const saveMachine = useCallback(
    async (input: MachineInput): Promise<MachineActionResult> => {
      const result = await saveMachineRpc(companyId, input);
      // También tras un resultado incierto: puede haberse guardado igual
      if (result.ok || result.uncertain) await load();
      return result;
    },
    [companyId, load]
  );

  return { machines, costs, isLoading, error, reload: load, saveMachine };
}
