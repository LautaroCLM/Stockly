import { escapeXml, readAllTags, readSoapFault, readTag, unescapeXml } from './xml.ts';
import { readWsfeErrors, type WsfeAuth } from './wsfeMessages.ts';

/** Factura tal como la guarda la base (arca_get_invoice). */
export interface InvoiceData {
  id: string;
  invoiceType: number;
  pointOfSale: number;
  issueDate: string;
  receiverDocType: number;
  receiverDocNumber: string;
  receiverVatConditionId: number;
  netAmount: number;
  vatAmount: number;
  totalAmount: number;
  status: 'pending' | 'authorized' | 'rejected';
  attemptNumber: number | null;
  vatLines: { arcaVatId: number; base: number; amount: number }[];
}

const money = (n: number) => n.toFixed(2);
/** 2026-11-27 → 20261127 */
export const toArcaDate = (iso: string) => iso.slice(0, 10).replace(/-/g, '');
/** 20261207 → 2026-12-07 */
export const fromArcaDate = (raw: string) => `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;

const NS = 'http://ar.gov.afip.dif.FEV1/';
const envelope = (body: string) =>
  `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${NS}"><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;
const authXml = (a: WsfeAuth) =>
  `<ar:Auth><ar:Token>${escapeXml(a.token)}</ar:Token><ar:Sign>${escapeXml(a.sign)}</ar:Sign><ar:Cuit>${a.cuit}</ar:Cuit></ar:Auth>`;

/** FECAESolicitar: el orden de los campos es el del WSDL de ARCA. Concepto 1 = productos. */
export function buildCaeRequestEnvelope(auth: WsfeAuth, inv: InvoiceData, number: number): string {
  const isC = inv.invoiceType === 11;
  const iva = isC || inv.vatLines.length === 0 ? '' :
    `<ar:Iva>${inv.vatLines.map((l) =>
      `<ar:AlicIva><ar:Id>${l.arcaVatId}</ar:Id><ar:BaseImp>${money(l.base)}</ar:BaseImp><ar:Importe>${money(l.amount)}</ar:Importe></ar:AlicIva>`
    ).join('')}</ar:Iva>`;
  const detail =
    '<ar:Concepto>1</ar:Concepto>' +
    `<ar:DocTipo>${inv.receiverDocType}</ar:DocTipo><ar:DocNro>${inv.receiverDocNumber}</ar:DocNro>` +
    `<ar:CbteDesde>${number}</ar:CbteDesde><ar:CbteHasta>${number}</ar:CbteHasta>` +
    `<ar:CbteFch>${toArcaDate(inv.issueDate)}</ar:CbteFch>` +
    `<ar:ImpTotal>${money(inv.totalAmount)}</ar:ImpTotal><ar:ImpTotConc>0.00</ar:ImpTotConc>` +
    `<ar:ImpNeto>${money(inv.netAmount)}</ar:ImpNeto><ar:ImpOpEx>0.00</ar:ImpOpEx><ar:ImpTrib>0.00</ar:ImpTrib>` +
    `<ar:ImpIVA>${money(isC ? 0 : inv.vatAmount)}</ar:ImpIVA>` +
    '<ar:MonId>PES</ar:MonId><ar:MonCotiz>1</ar:MonCotiz>' +
    `<ar:CondicionIVAReceptorId>${inv.receiverVatConditionId}</ar:CondicionIVAReceptorId>` +
    iva;
  return envelope(
    `<ar:FECAESolicitar>${authXml(auth)}<ar:FeCAEReq>` +
      `<ar:FeCabReq><ar:CantReg>1</ar:CantReg><ar:PtoVta>${inv.pointOfSale}</ar:PtoVta><ar:CbteTipo>${inv.invoiceType}</ar:CbteTipo></ar:FeCabReq>` +
      `<ar:FeDetReq><ar:FECAEDetRequest>${detail}</ar:FECAEDetRequest></ar:FeDetReq>` +
      '</ar:FeCAEReq></ar:FECAESolicitar>'
  );
}

export function buildConsultEnvelope(auth: WsfeAuth, pointOfSale: number, invoiceType: number, number: number): string {
  return envelope(
    `<ar:FECompConsultar>${authXml(auth)}<ar:FeCompConsReq><ar:CbteTipo>${invoiceType}</ar:CbteTipo>` +
      `<ar:CbteNro>${number}</ar:CbteNro><ar:PtoVta>${pointOfSale}</ar:PtoVta></ar:FeCompConsReq></ar:FECompConsultar>`
  );
}

export type CaeResult =
  | { status: 'authorized'; cae: string; caeExpiresAt: string; observations: string }
  | { status: 'rejected'; message: string };

const observations = (xml: string) =>
  readAllTags(xml, 'Obs')
    .map((o) => `${readTag(o, 'Code') ?? '?'}: ${unescapeXml(readTag(o, 'Msg') ?? '')}`)
    .join(' | ');

export function parseCaeResponse(xml: string): CaeResult {
  const fault = readSoapFault(xml);
  if (fault !== null) return { status: 'rejected', message: `ARCA respondió con un error: ${fault}` };
  const detail = readTag(xml, 'FECAEDetResponse') ?? '';
  const result = readTag(detail, 'Resultado');
  const cae = readTag(detail, 'CAE');
  const expires = readTag(detail, 'CAEFchVto');
  if (result === 'A' && cae && /^\d{14}$/.test(cae) && expires && /^\d{8}$/.test(expires)) {
    return { status: 'authorized', cae, caeExpiresAt: fromArcaDate(expires), observations: observations(detail) };
  }
  const reasons = [...readWsfeErrors(xml), observations(detail)].filter((r) => r !== '');
  return { status: 'rejected', message: `ARCA rechazó la factura${reasons.length ? ` (${reasons.join(' | ')})` : ''}.` };
}

export type ConsultResult =
  | { found: true; cae: string; caeExpiresAt: string; total: number; docNumber: string; date: string }
  | { found: false }
  | { error: string };

/** Comprobante ya emitido (para no duplicar al reintentar). 602 = no existe. */
export function parseConsultResponse(xml: string): ConsultResult {
  const fault = readSoapFault(xml);
  if (fault !== null) return { error: `ARCA respondió con un error: ${fault}` };
  const get = readTag(xml, 'ResultGet');
  if (get !== null) {
    const cae = readTag(get, 'CodAutorizacion') ?? '';
    const expires = readTag(get, 'FchVto') ?? '';
    return {
      found: true, cae, caeExpiresAt: /^\d{8}$/.test(expires) ? fromArcaDate(expires) : '',
      total: Number(readTag(get, 'ImpTotal') ?? Number.NaN), docNumber: readTag(get, 'DocNro') ?? '',
      date: readTag(get, 'CbteFch') ?? '',
    };
  }
  const errors = readWsfeErrors(xml);
  if (errors.some((e) => e.startsWith('602:'))) return { found: false };
  return { error: errors.length ? `ARCA rechazó la consulta (${errors.join(' | ')})` : 'Respuesta inesperada de ARCA.' };
}

/** El comprobante que ARCA ya tiene con ese número, ¿es esta factura? */
export function consultMatches(inv: InvoiceData, c: Extract<ConsultResult, { found: true }>): boolean {
  return Math.abs(c.total - inv.totalAmount) < 0.005 && c.docNumber === inv.receiverDocNumber &&
    c.date === toArcaDate(inv.issueDate) && /^\d{14}$/.test(c.cae) && c.caeExpiresAt !== '';
}
