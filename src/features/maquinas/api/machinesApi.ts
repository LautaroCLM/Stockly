import { supabase } from '@/lib/supabase';
import { isNetworkOrUncertainError, toUserMessage } from '@/lib/errorMessages';
import { parseYear } from '../machineForm';
import { MACHINE_STATUSES, MACHINE_TYPES } from '../types';
import type { Machine, MachineActionResult, MachineCost, MachineInput, MachineStatus, MachineType } from '../types';

const UNCERTAIN_MESSAGE =
  'No pudimos confirmar si se guardó por un problema de conexión. Revisá la lista antes de reintentar para no duplicarla.';

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();
const num = (value: unknown): number => Number(value ?? 0);
const asType = (v: string): MachineType => ((MACHINE_TYPES as readonly string[]).includes(v) ? (v as MachineType) : 'otro');
const asStatus = (v: string): MachineStatus => ((MACHINE_STATUSES as readonly string[]).includes(v) ? (v as MachineStatus) : 'active');

export async function fetchMachines(companyId: string): Promise<Machine[]> {
  const { data, error } = await supabase
    .from('machines')
    .select('id, name, machine_type, identifier, brand, model, model_year, status, notes')
    .eq('company_id', companyId)
    .order('name');
  if (error) throw new Error('No se pudieron cargar las máquinas.');
  return (data ?? []).map((m) => ({
    id: m.id, name: m.name, type: asType(m.machine_type), identifier: m.identifier, brand: m.brand, model: m.model,
    year: m.model_year, status: asStatus(m.status), notes: m.notes,
  }));
}

export async function fetchMachineCosts(companyId: string, from: string, to: string): Promise<MachineCost[]> {
  const { data, error } = await supabase.rpc('machine_costs', { p_company_id: companyId, p_from: from, p_to: to });
  if (error) throw new Error(toUserMessage(error, 'No se pudieron calcular los costos de las máquinas.'));
  return (data ?? []).map((r) => ({
    machineId: r.machine_id, name: r.machine_name, type: asType(r.machine_type), status: asStatus(r.status),
    expensesCount: num(r.expenses_count), fuelTotal: num(r.fuel_total), maintenanceTotal: num(r.maintenance_total),
    otherTotal: num(r.other_total), total: num(r.total),
  }));
}

export async function saveMachineRpc(companyId: string, input: MachineInput): Promise<MachineActionResult> {
  try {
    const { error } = await supabase.rpc('upsert_machine', {
      p_company_id: companyId,
      p_machine_id: input.machineId as string,
      p_name: input.name.trim(),
      p_machine_type: input.type,
      p_identifier: input.identifier.trim(),
      p_brand: input.brand.trim(),
      p_model: input.model.trim(),
      p_model_year: parseYear(input.year) as number,
      p_status: input.status,
      p_notes: input.notes.trim(),
    });
    if (!error) return { ok: true };
    // Alta repetida tras un corte: el nombre ya existe y el mensaje lo explica
    if (isNetworkOrUncertainError(error.message)) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: cleanMessage(error.message) };
  } catch (err) {
    if (isNetworkOrUncertainError(err instanceof Error ? err.message : '')) return { ok: false, message: UNCERTAIN_MESSAGE, uncertain: true };
    return { ok: false, message: 'No se pudo guardar la máquina. Intentá de nuevo.' };
  }
}
