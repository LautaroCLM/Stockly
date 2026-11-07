export const MACHINE_TYPES = [
  'retroexcavadora', 'excavadora', 'pala_cargadora', 'camion', 'atmosferico',
  'motoniveladora', 'topadora', 'compactadora', 'grua', 'vehiculo', 'herramienta', 'otro',
] as const;
export type MachineType = (typeof MACHINE_TYPES)[number];

export const MACHINE_TYPE_LABELS: Record<MachineType, string> = {
  retroexcavadora: 'Retroexcavadora',
  excavadora: 'Excavadora',
  pala_cargadora: 'Pala cargadora',
  camion: 'Camión',
  atmosferico: 'Atmosférico',
  motoniveladora: 'Motoniveladora',
  topadora: 'Topadora',
  compactadora: 'Compactadora',
  grua: 'Grúa',
  vehiculo: 'Vehículo',
  herramienta: 'Herramienta / equipo',
  otro: 'Otro',
};

export const MACHINE_STATUSES = ['active', 'in_repair', 'inactive'] as const;
export type MachineStatus = (typeof MACHINE_STATUSES)[number];

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  active: 'Operativa',
  in_repair: 'En reparación',
  inactive: 'Inactiva',
};

export interface Machine {
  id: string;
  name: string;
  type: MachineType;
  identifier: string | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  status: MachineStatus;
  notes: string | null;
}

export interface MachineInput {
  machineId: string | null;
  name: string;
  type: MachineType;
  identifier: string;
  brand: string;
  model: string;
  year: string;
  status: MachineStatus;
  notes: string;
}

/** Lo gastado en una máquina durante un período. */
export interface MachineCost {
  machineId: string;
  name: string;
  type: MachineType;
  status: MachineStatus;
  expensesCount: number;
  fuelTotal: number;
  maintenanceTotal: number;
  otherTotal: number;
  total: number;
}

export type MachineActionResult = { ok: true } | { ok: false; message: string; uncertain?: boolean };
