import { describe, expect, it } from 'vitest';
import { buildSinglePayment, buildSplitPayments, singlePaymentSummary, splitPaymentSummary } from './checkoutPayments';

describe('pago único', () => {
  it('calcula el vuelto en efectivo sin errores de coma flotante', () => {
    expect(singlePaymentSummary(9000, 'efectivo', '10000')).toMatchObject({ cashChange: 1000, cashInsufficient: false });
    expect(singlePaymentSummary(0.3, 'efectivo', '0.3').cashInsufficient).toBe(false);
  });

  it('rechaza efectivo insuficiente', () => {
    expect(buildSinglePayment(100, 'efectivo', '99.99')).toEqual({
      ok: false,
      error: 'El efectivo entregado es menor al total a pagar.',
    });
  });

  it('con tarjeta no pide efectivo ni calcula vuelto', () => {
    const result = buildSinglePayment(100, 'debito', '0');
    expect(result).toEqual({
      ok: true,
      payments: [{ id: 'pay-single-1', method: 'debito', amount: 100, cashReceived: undefined, cashChange: undefined }],
    });
  });
});

describe('pago dividido', () => {
  const split = (id: string, amount: number) => ({ id, method: 'efectivo' as const, amount });

  it('acepta pagos que suman exactamente el total', () => {
    expect(splitPaymentSummary(100, [split('a', 60.1), split('b', 39.9)]).isExact).toBe(true);
    expect(buildSplitPayments(100, [split('a', 60.1), split('b', 39.9)]).ok).toBe(true);
  });

  it('informa cuánto falta o cuánto excede', () => {
    expect(buildSplitPayments(100, [split('a', 60)])).toMatchObject({ ok: false, error: expect.stringMatching(/Resta cubrir/) });
    expect(buildSplitPayments(100, [split('a', 120)])).toMatchObject({ ok: false, error: expect.stringMatching(/excede/) });
  });

  it('rechaza un medio con importe cero aunque el total cuadre', () => {
    expect(buildSplitPayments(100, [split('a', 100), split('b', 0)])).toMatchObject({ ok: false });
  });
});
