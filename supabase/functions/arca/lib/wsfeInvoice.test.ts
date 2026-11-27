import { describe, expect, it } from 'vitest';
import {
  buildCaeRequestEnvelope, buildConsultEnvelope, consultMatches, fromArcaDate, parseCaeResponse, parseConsultResponse,
  toArcaDate, type InvoiceData,
} from './wsfeInvoice.ts';

const AUTH = { token: 'T', sign: 'S', cuit: '20329642330' };
const B: InvoiceData = {
  id: 'i1', invoiceType: 6, pointOfSale: 3, issueDate: '2026-11-27', receiverDocType: 99, receiverDocNumber: '0',
  receiverVatConditionId: 5, netAmount: 1080, vatAmount: 207.9, totalAmount: 1287.9, status: 'pending', attemptNumber: null,
  vatLines: [{ arcaVatId: 4, base: 180, amount: 18.9 }, { arcaVatId: 5, base: 900, amount: 189 }],
};

describe('FECAESolicitar', () => {
  it('arma la Factura B con IVA por alícuota y la condición del receptor', () => {
    const xml = buildCaeRequestEnvelope(AUTH, B, 16);
    expect(xml).toContain('<ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo>');
    expect(xml).toContain('<ar:CbteDesde>16</ar:CbteDesde><ar:CbteHasta>16</ar:CbteHasta><ar:CbteFch>20261127</ar:CbteFch>');
    expect(xml).toContain('<ar:ImpTotal>1287.90</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc><ar:ImpNeto>1080.00</ar:ImpNeto>');
    expect(xml).toContain('<ar:ImpIVA>207.90</ar:ImpIVA>');
    expect(xml).toContain('<ar:CondicionIVAReceptorId>5</ar:CondicionIVAReceptorId><ar:Iva>');
    expect(xml).toContain('<ar:AlicIva><ar:Id>4</ar:Id><ar:BaseImp>180.00</ar:BaseImp><ar:Importe>18.90</ar:Importe></ar:AlicIva>');
  });

  it('la Factura C no lleva IVA', () => {
    const xml = buildCaeRequestEnvelope(AUTH, { ...B, invoiceType: 11, netAmount: 1287.9, vatAmount: 0, vatLines: [] }, 1);
    expect(xml).toContain('<ar:ImpIVA>0.00</ar:ImpIVA>');
    expect(xml).not.toContain('<ar:Iva>');
  });

  it('lee una factura autorizada con observaciones', () => {
    const xml = '<FECAESolicitarResult><FeCabResp><Resultado>A</Resultado></FeCabResp><FeDetResp><FECAEDetResponse>' +
      '<CbteDesde>16</CbteDesde><Resultado>A</Resultado><Observaciones><Obs><Code>10217</Code><Msg>Aviso</Msg></Obs></Observaciones>' +
      '<CAE>76123456789012</CAE><CAEFchVto>20261207</CAEFchVto></FECAEDetResponse></FeDetResp></FECAESolicitarResult>';
    expect(parseCaeResponse(xml)).toEqual({
      status: 'authorized', cae: '76123456789012', caeExpiresAt: '2026-12-07', observations: '10217: Aviso',
    });
  });

  it('lee un rechazo con errores y observaciones', () => {
    const xml = '<FECAESolicitarResult><FeDetResp><FECAEDetResponse><Resultado>R</Resultado><Observaciones><Obs><Code>10015</Code>' +
      '<Msg>Falta el documento</Msg></Obs></Observaciones><CAE></CAE></FECAEDetResponse></FeDetResp>' +
      '<Errors><Err><Code>10016</Code><Msg>Fecha fuera de rango</Msg></Err></Errors></FECAESolicitarResult>';
    const result = parseCaeResponse(xml);
    expect(result.status).toBe('rejected');
    expect(result.status === 'rejected' && result.message).toContain('10016: Fecha fuera de rango | 10015: Falta el documento');
  });
});

describe('FECompConsultar', () => {
  it('arma la consulta por tipo, número y punto de venta', () => {
    expect(buildConsultEnvelope(AUTH, 3, 6, 16)).toContain('<ar:CbteTipo>6</ar:CbteTipo><ar:CbteNro>16</ar:CbteNro><ar:PtoVta>3</ar:PtoVta>');
  });

  it('reconoce que el número ya se usó para esta misma factura', () => {
    const xml = '<ResultGet><DocNro>0</DocNro><CbteFch>20261127</CbteFch><ImpTotal>1287.9</ImpTotal>' +
      '<CodAutorizacion>76123456789012</CodAutorizacion><FchVto>20261207</FchVto></ResultGet>';
    const result = parseConsultResponse(xml);
    expect('found' in result && result.found && consultMatches(B, result)).toBe(true);
    const other = parseConsultResponse(xml.replace('1287.9', '500'));
    expect('found' in other && other.found && consultMatches(B, other)).toBe(false);
  });

  it('602 significa que el comprobante no existe', () => {
    expect(parseConsultResponse('<Errors><Err><Code>602</Code><Msg>Sin Resultados</Msg></Err></Errors>')).toEqual({ found: false });
    expect(parseConsultResponse('<Errors><Err><Code>600</Code><Msg>Token</Msg></Err></Errors>')).toHaveProperty('error');
  });
});

describe('fechas', () => {
  it('convierte entre ISO y el formato de ARCA', () => {
    expect(toArcaDate('2026-11-27')).toBe('20261127');
    expect(fromArcaDate('20261207')).toBe('2026-12-07');
  });
});
