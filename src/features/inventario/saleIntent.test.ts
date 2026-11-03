import { describe, expect, it } from 'vitest';
import { isIdempotencyMismatchError, markSaleIntentUncertain, resolveSaleIntent } from './saleIntent';

function keyGenerator() {
  let n = 0;
  return () => `key-${++n}`;
}

describe('resolveSaleIntent', () => {
  it('genera una clave para el primer intento', () => {
    const intent = resolveSaleIntent(null, 'company-a', 'fp1', keyGenerator());
    expect(intent).toEqual({ companyId: 'company-a', key: 'key-1', fingerprint: 'fp1', uncertain: false });
  });

  it('reutiliza la clave si el pedido es idéntico', () => {
    const gen = keyGenerator();
    const first = resolveSaleIntent(null, 'company-a', 'fp1', gen);
    expect(resolveSaleIntent(first, 'company-a', 'fp1', gen).key).toBe('key-1');
  });

  it('genera una clave nueva si el pedido cambió y no hubo incertidumbre', () => {
    const gen = keyGenerator();
    const first = resolveSaleIntent(null, 'company-a', 'fp1', gen);
    expect(resolveSaleIntent(first, 'company-a', 'fp2', gen).key).toBe('key-2');
  });

  it('conserva la clave tras un corte de red aunque el pedido cambie', () => {
    const gen = keyGenerator();
    const uncertain = markSaleIntentUncertain(resolveSaleIntent(null, 'company-a', 'fp1', gen));
    expect(resolveSaleIntent(uncertain, 'company-a', 'fp2', gen).key).toBe('key-1');
  });

  it('genera una clave nueva al cambiar de empresa', () => {
    const gen = keyGenerator();
    const uncertain = markSaleIntentUncertain(resolveSaleIntent(null, 'company-a', 'fp1', gen));
    const next = resolveSaleIntent(uncertain, 'company-b', 'fp1', gen);
    expect(next.key).toBe('key-2');
    expect(next.uncertain).toBe(false);
  });
});

describe('markSaleIntentUncertain', () => {
  it('no crea una intención si no había ninguna', () => {
    expect(markSaleIntentUncertain(null)).toBeNull();
  });
});

describe('isIdempotencyMismatchError', () => {
  it('reconoce el error de process_sale', () => {
    expect(
      isIdempotencyMismatchError('Idempotency key mismatch: clave de venta reutilizada con distintos parámetros.')
    ).toBe(true);
    expect(isIdempotencyMismatchError('Stock insuficiente')).toBe(false);
  });
});
