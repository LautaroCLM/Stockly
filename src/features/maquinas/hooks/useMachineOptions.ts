import { useEffect, useState } from 'react';
import { useOnDataChange } from '@/features/realtime/hooks/useOnDataChange';
import { fetchMachines } from '../api/machinesApi';
import type { Machine } from '../types';

/** Lista liviana de máquinas para elegir en otros módulos (por ejemplo, al registrar un gasto). */
export function useMachineOptions(companyId: string, enabled: boolean): Machine[] {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [version, setVersion] = useState(0);

  useOnDataChange(['machines'], () => setVersion((v) => v + 1));

  useEffect(() => {
    let cancelled = false;
    setMachines([]);
    if (!enabled || !companyId) return;
    fetchMachines(companyId)
      .then((list) => {
        if (!cancelled) setMachines(list);
      })
      .catch(() => {
        // Sin la lista, el gasto se registra igual (la máquina es opcional)
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, enabled, version]);

  return machines;
}
