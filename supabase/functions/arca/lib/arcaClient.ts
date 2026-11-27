import { ARCA_URLS, type ArcaEnvironment } from './endpoints.ts';
import { buildLoginCmsEnvelope, parseLoginCmsResponse, type LoginResult } from './wsaaMessages.ts';
import {
  buildDummyEnvelope, buildLastAuthorizedEnvelope, parseDummyResponse, parseLastAuthorizedResponse, wsfeAction,
  type DummyResult, type LastAuthorizedResult, type WsfeAuth,
} from './wsfeMessages.ts';
import {
  buildCaeRequestEnvelope, buildConsultEnvelope, parseCaeResponse, parseConsultResponse,
  type CaeResult, type ConsultResult, type InvoiceData,
} from './wsfeInvoice.ts';

const TIMEOUT_MS = 25_000;

export class ArcaUnavailableError extends Error {}

/** POST SOAP a ARCA. Devuelve el cuerpo también en errores HTTP: los SOAP Fault llegan con 500. */
async function soapPost(url: string, soapAction: string, body: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: soapAction },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err instanceof Error && err.name === 'TimeoutError' ? 'no respondió a tiempo' : 'no se pudo conectar';
    throw new ArcaUnavailableError(`ARCA ${reason}. Puede estar caído: probá de nuevo en unos minutos.`);
  }
  const text = await response.text();
  if (!response.ok && !/Fault/.test(text)) {
    throw new ArcaUnavailableError(`ARCA respondió con un error ${response.status}. Probá de nuevo en unos minutos.`);
  }
  return text;
}

export async function wsaaLogin(environment: ArcaEnvironment, cmsBase64: string): Promise<LoginResult> {
  const xml = await soapPost(ARCA_URLS[environment].wsaa, '', buildLoginCmsEnvelope(cmsBase64));
  return parseLoginCmsResponse(xml);
}

export async function wsfeDummy(environment: ArcaEnvironment): Promise<DummyResult> {
  const xml = await soapPost(ARCA_URLS[environment].wsfe, wsfeAction('FEDummy'), buildDummyEnvelope());
  return parseDummyResponse(xml);
}

export async function wsfeLastAuthorized(
  environment: ArcaEnvironment, auth: WsfeAuth, pointOfSale: number, invoiceType: number
): Promise<LastAuthorizedResult> {
  const xml = await soapPost(
    ARCA_URLS[environment].wsfe,
    wsfeAction('FECompUltimoAutorizado'),
    buildLastAuthorizedEnvelope(auth, pointOfSale, invoiceType)
  );
  return parseLastAuthorizedResponse(xml);
}

/** Pide el CAE. Si ARCA no responde, tira ArcaUnavailableError: el resultado queda incierto. */
export async function wsfeCaeRequest(
  environment: ArcaEnvironment, auth: WsfeAuth, invoice: InvoiceData, number: number
): Promise<CaeResult> {
  const xml = await soapPost(ARCA_URLS[environment].wsfe, wsfeAction('FECAESolicitar'), buildCaeRequestEnvelope(auth, invoice, number));
  return parseCaeResponse(xml);
}

export async function wsfeConsult(
  environment: ArcaEnvironment, auth: WsfeAuth, pointOfSale: number, invoiceType: number, number: number
): Promise<ConsultResult> {
  const xml = await soapPost(
    ARCA_URLS[environment].wsfe, wsfeAction('FECompConsultar'), buildConsultEnvelope(auth, pointOfSale, invoiceType, number)
  );
  return parseConsultResponse(xml);
}
