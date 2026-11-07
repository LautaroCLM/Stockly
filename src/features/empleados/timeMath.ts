import type { ScheduleBlock } from './types';

export const WEEKDAYS: { id: number; label: string; short: string }[] = [
  { id: 1, label: 'Lunes', short: 'Lun' },
  { id: 2, label: 'Martes', short: 'Mar' },
  { id: 3, label: 'Miércoles', short: 'Mié' },
  { id: 4, label: 'Jueves', short: 'Jue' },
  { id: 5, label: 'Viernes', short: 'Vie' },
  { id: 6, label: 'Sábado', short: 'Sáb' },
  { id: 7, label: 'Domingo', short: 'Dom' },
];

/** Minutos desde las 00:00 de un texto "HH:MM"; null si no es válido. */
export function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

/** Día ISO de la semana de una fecha: 1 = lunes ... 7 = domingo. */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

export function formatDuration(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Hora local "HH:MM" de un instante ISO. */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Instante ISO (UTC) a partir de un valor de datetime-local; null si está vacío o es inválido. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Minutos de un bloque; 0 si es inválido. */
export function blockMinutes(block: ScheduleBlock): number {
  const start = toMinutes(block.start);
  const end = toMinutes(block.end);
  return start !== null && end !== null && end > start ? end - start : 0;
}

/** Valida los bloques de un horario antes de guardarlo. Devuelve el mensaje de error o null. */
export function validateSchedule(blocks: ScheduleBlock[]): string | null {
  for (const b of blocks) {
    const start = toMinutes(b.start);
    const end = toMinutes(b.end);
    if (start === null || end === null) return 'Completá la hora de entrada y de salida de cada bloque.';
    if (end <= start) return 'Cada bloque tiene que terminar después de empezar (dentro del mismo día).';
  }
  for (const day of WEEKDAYS) {
    const sorted = blocks
      .filter((b) => b.weekday === day.id)
      .map((b) => [toMinutes(b.start) as number, toMinutes(b.end) as number])
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i][0] < sorted[i - 1][1]) return `Los bloques del ${day.label.toLowerCase()} se superponen.`;
    }
  }
  return null;
}

/** Horas semanales previstas por el horario. */
export function weeklyMinutes(blocks: ScheduleBlock[]): number {
  return blocks.reduce((sum, b) => sum + blockMinutes(b), 0);
}

/** Texto corto del horario de un día, por ejemplo "08:00-12:00 · 14:00-18:00"; null si no trabaja ese día. */
export function dayScheduleText(blocks: ScheduleBlock[], weekday: number): string | null {
  const day = blocks
    .filter((b) => b.weekday === weekday)
    .sort((a, b) => (toMinutes(a.start) ?? 0) - (toMinutes(b.start) ?? 0));
  return day.length === 0 ? null : day.map((b) => `${b.start.slice(0, 5)}-${b.end.slice(0, 5)}`).join(' · ');
}
