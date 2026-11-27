import { readSoapFault, readTag, unescapeXml } from './xml.ts';

/** Fecha con la zona de Argentina (UTC-3, sin horario de verano), como la espera WSAA. */
export function toArgentinaIso(date: Date): string {
  const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${local.toISOString().slice(0, 19)}-03:00`;
}

/**
 * Pedido de acceso (TRA) para un servicio de ARCA. Vale 20 minutos: 10 antes y 10 después de ahora,
 * para tolerar diferencias de reloj con ARCA.
 */
export function buildTra(service: string, now: Date): string {
  const generation = new Date(now.getTime() - 10 * 60 * 1000);
  const expiration = new Date(now.getTime() + 10 * 60 * 1000);
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<loginTicketRequest version="1.0"><header>' +
    `<uniqueId>${Math.floor(now.getTime() / 1000)}</uniqueId>` +
    `<generationTime>${toArgentinaIso(generation)}</generationTime>` +
    `<expirationTime>${toArgentinaIso(expiration)}</expirationTime>` +
    `</header><service>${service}</service></loginTicketRequest>`
  );
}

export function buildLoginCmsEnvelope(cmsBase64: string): string {
  return (
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ' +
    'xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov"><soapenv:Header/><soapenv:Body>' +
    `<wsaa:loginCms><wsaa:in0>${cmsBase64}</wsaa:in0></wsaa:loginCms>` +
    '</soapenv:Body></soapenv:Envelope>'
  );
}

export interface AccessTicket {
  token: string;
  sign: string;
  expiresAt: string;
}

export type LoginResult = { ok: true; ticket: AccessTicket } | { ok: false; message: string; alreadyAuthenticated: boolean };

/** Lee la respuesta de loginCms: el ticket de acceso o el motivo del rechazo. */
export function parseLoginCmsResponse(xml: string): LoginResult {
  const fault = readSoapFault(xml);
  if (fault !== null) {
    return {
      ok: false,
      message: friendlyWsaaFault(fault),
      alreadyAuthenticated: /ya posee un TA valido/i.test(fault),
    };
  }
  const inner = readTag(xml, 'loginCmsReturn');
  if (inner === null) return { ok: false, message: 'ARCA devolvió una respuesta inesperada al iniciar sesión.', alreadyAuthenticated: false };
  const ticketXml = unescapeXml(inner);
  const token = readTag(ticketXml, 'token');
  const sign = readTag(ticketXml, 'sign');
  const expiresAt = readTag(ticketXml, 'expirationTime');
  if (!token || !sign || !expiresAt || Number.isNaN(Date.parse(expiresAt))) {
    return { ok: false, message: 'ARCA no devolvió un acceso completo.', alreadyAuthenticated: false };
  }
  return { ok: true, ticket: { token, sign, expiresAt: new Date(expiresAt).toISOString() } };
}

/** Traduce los errores más comunes de WSAA a algo que se entienda. */
export function friendlyWsaaFault(fault: string): string {
  if (/ya posee un TA valido/i.test(fault)) {
    return 'ARCA ya entregó un acceso hace menos de 12 horas que Stockly no tiene guardado. Probá de nuevo más tarde.';
  }
  if (/Computador no autorizado/i.test(fault) || /no autorizado a acceder/i.test(fault)) {
    return 'El certificado no está autorizado para factura electrónica (servicio wsfe). Autorizalo en ARCA y probá de nuevo.';
  }
  if (/expirado|expired/i.test(fault)) return 'El certificado está vencido. Generá uno nuevo.';
  if (/Certificado bloqueado|no emitido por AC de confianza|certificado no confiable/i.test(fault)) {
    return 'ARCA no reconoce este certificado: tiene que ser el que descargaste de ARCA para este pedido y este ambiente.';
  }
  if (/Firma inv[aá]lida|cms\.sign|cms\.cert/i.test(fault)) {
    return 'ARCA no reconoce la firma: revisá que el certificado sea del ambiente correcto (homologación o producción).';
  }
  return `ARCA rechazó el inicio de sesión: ${fault}`;
}
