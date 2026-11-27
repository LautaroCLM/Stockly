import { describe, expect, it } from 'vitest';
import { toArcaStatus } from './api/arcaConnectionApi';
import { certificateTextError, csrFilename } from './certificateFiles';

describe('archivos del certificado', () => {
  it('arma el nombre del pedido con el CUIT y el ambiente', () => {
    expect(csrFilename('30-71234567-1', 'homologacion')).toBe('stockly-30712345671-homologacion.csr');
    expect(csrFilename('', 'produccion')).toBe('stockly-empresa-produccion.csr');
  });
  it('acepta solo certificados PEM de tamaño razonable', () => {
    expect(certificateTextError('-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----')).toBeNull();
    expect(certificateTextError('binario')).toMatch(/formato/);
    expect(certificateTextError(`-----BEGIN CERTIFICATE-----${'A'.repeat(20_001)}`)).toMatch(/grande/);
  });
});

describe('toArcaStatus', () => {
  it('valida cada campo de la respuesta', () => {
    const status = toArcaStatus({ environment: 'produccion', hasCsr: true, csrPem: '', lastTestOk: 'sí', lastTestMessage: 'x' });
    expect(status).toMatchObject({ environment: 'produccion', hasCsr: true, csrPem: null, hasCertificate: false, lastTestOk: null, lastTestMessage: 'x' });
  });
  it('ante una respuesta vacía devuelve el estado inicial', () => {
    expect(toArcaStatus(null).hasCsr).toBe(false);
    expect(toArcaStatus({ environment: 'otro' }).environment).toBe('homologacion');
  });
});
