/**
 * Fecha local (AAAA-MM-DD) para campos <input type="date">.
 *
 * new Date().toISOString() devuelve la fecha en UTC: en Argentina (UTC-3), después de las
 * 21:00 ya es "mañana". Esta función usa el calendario local del dispositivo.
 */
export function localDateInputValue(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
