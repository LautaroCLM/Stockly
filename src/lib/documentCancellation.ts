import { isNetworkOrUncertainError } from './errorMessages';

/** Resultado de anular una venta o una compra (RPC cancel_sale / cancel_purchase). */
export type CancelDocumentResult =
  | { status: 'cancelled'; alreadyCancelled: boolean }
  | { status: 'uncertain'; message: string }
  | { status: 'failed'; message: string };

const UNCERTAIN: CancelDocumentResult = {
  status: 'uncertain',
  message:
    'No pudimos confirmar la anulación por un problema de conexión. Reintentá: si ya se aplicó, no se va a repetir.',
};

const cleanMessage = (message: string) => message.replace(/^(P0001|error):\s*/i, '').trim();

/**
 * Traduce la respuesta de la RPC de anulación. Las RPC son idempotentes (si el documento
 * ya estaba anulado no repiten efectos), así que un corte de red se reintenta sin riesgo.
 */
export function toCancelResult(
  data: unknown,
  error: { message: string } | null
): CancelDocumentResult {
  if (error) {
    return isNetworkOrUncertainError(error.message) ? UNCERTAIN : { status: 'failed', message: cleanMessage(error.message) };
  }
  const payload = data as { already_cancelled?: boolean } | null;
  return { status: 'cancelled', alreadyCancelled: Boolean(payload?.already_cancelled) };
}

export function cancelExceptionResult(err: unknown, fallback: string): CancelDocumentResult {
  if (isNetworkOrUncertainError(err)) return UNCERTAIN;
  return { status: 'failed', message: err instanceof Error ? cleanMessage(err.message) : fallback };
}
