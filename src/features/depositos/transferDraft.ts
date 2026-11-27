import { parseHundredths, fromHundredths } from '@/lib/decimal';
import type { StockByWarehouse, TransferLine } from './types';

const INDIVISIBLE = ['unidad', 'bulto', 'par'];

/** Cantidad escrita ("3", "2,5") a número; null si no es válida para la unidad. */
export function parseTransferQuantity(text: string, unit: string): number | null {
  const cents = parseHundredths(text.trim());
  if (cents === null || cents <= 0) return null;
  const value = fromHundredths(cents);
  if (INDIVISIBLE.includes(unit) && !Number.isInteger(value)) return null;
  return value;
}

/** Valida la transferencia antes de enviarla. Devuelve el mensaje de error o null. */
export function validateTransfer(fromId: string, toId: string, lines: TransferLine[], stock: StockByWarehouse | null): string | null {
  if (!fromId || !toId) return 'Elegí el depósito de origen y el de destino.';
  if (fromId === toId) return 'El origen y el destino tienen que ser distintos.';
  if (lines.length === 0) return 'Agregá al menos un producto.';
  for (const line of lines) {
    if (!(line.quantity > 0)) return `Indicá cuánto transferir de "${line.name}".`;
    const available = stock?.get(line.productId)?.get(fromId) ?? 0;
    if (line.quantity > available) return `En el origen hay ${available} ${line.unit} de "${line.name}": no alcanza para ${line.quantity}.`;
  }
  return null;
}
