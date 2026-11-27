import { escapeXml, readAllTags, readSoapFault, readTag, unescapeXml } from './xml.ts';

const WSFE_NS = 'http://ar.gov.afip.dif.FEV1/';

export interface WsfeAuth {
  token: string;
  sign: string;
  cuit: string;
}

export function wsfeAction(method: string): string {
  return `${WSFE_NS}${method}`;
}

function envelope(body: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ar="${WSFE_NS}">` +
    `<soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`
  );
}

function authXml(auth: WsfeAuth): string {
  return (
    `<ar:Auth><ar:Token>${escapeXml(auth.token)}</ar:Token><ar:Sign>${escapeXml(auth.sign)}</ar:Sign>` +
    `<ar:Cuit>${auth.cuit}</ar:Cuit></ar:Auth>`
  );
}

export function buildDummyEnvelope(): string {
  return envelope('<ar:FEDummy/>');
}

export function buildLastAuthorizedEnvelope(auth: WsfeAuth, pointOfSale: number, invoiceType: number): string {
  return envelope(
    `<ar:FECompUltimoAutorizado>${authXml(auth)}<ar:PtoVta>${pointOfSale}</ar:PtoVta>` +
      `<ar:CbteTipo>${invoiceType}</ar:CbteTipo></ar:FECompUltimoAutorizado>`
  );
}

export interface ServerStatus {
  app: string;
  db: string;
  auth: string;
}

export type DummyResult = { ok: true; status: ServerStatus } | { ok: false; message: string };

/** Estado de los servidores de factura electrónica (FEDummy no requiere acceso). */
export function parseDummyResponse(xml: string): DummyResult {
  const fault = readSoapFault(xml);
  if (fault !== null) return { ok: false, message: `ARCA respondió con un error: ${fault}` };
  const app = readTag(xml, 'AppServer');
  const db = readTag(xml, 'DbServer');
  const auth = readTag(xml, 'AuthServer');
  if (app === null || db === null || auth === null) {
    return { ok: false, message: 'ARCA devolvió una respuesta inesperada al consultar el estado.' };
  }
  return { ok: true, status: { app, db, auth } };
}

export function serversAreUp(status: ServerStatus): boolean {
  return status.app === 'OK' && status.db === 'OK' && status.auth === 'OK';
}

/** Errores de negocio de WSFE: <Errors><Err><Code/><Msg/></Err></Errors>. */
export function readWsfeErrors(xml: string): string[] {
  const block = readTag(xml, 'Errors');
  if (block === null) return [];
  return readAllTags(block, 'Err').map((err) => {
    const code = readTag(err, 'Code') ?? '?';
    const msg = unescapeXml(readTag(err, 'Msg') ?? 'Error sin descripción');
    return `${code}: ${msg}`;
  });
}

export type LastAuthorizedResult = { ok: true; number: number } | { ok: false; message: string };

export function parseLastAuthorizedResponse(xml: string): LastAuthorizedResult {
  const fault = readSoapFault(xml);
  if (fault !== null) return { ok: false, message: `ARCA respondió con un error: ${fault}` };
  const errors = readWsfeErrors(xml);
  if (errors.length > 0) return { ok: false, message: `ARCA rechazó la consulta (${errors.join(' | ')})` };
  const raw = readTag(xml, 'CbteNro');
  const number = raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(number) || number < 0) {
    return { ok: false, message: 'ARCA no devolvió el último número de comprobante.' };
  }
  return { ok: true, number };
}
