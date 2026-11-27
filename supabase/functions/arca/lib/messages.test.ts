import { describe, expect, it } from 'vitest';
import { cuitDigits, lettersForTaxCondition, toEnvironment } from './endpoints.ts';
import { escapeXml, readAllTags, readTag, unescapeXml } from './xml.ts';
import { buildTra, parseLoginCmsResponse, toArgentinaIso } from './wsaaMessages.ts';
import {
  buildLastAuthorizedEnvelope, parseDummyResponse, parseLastAuthorizedResponse, serversAreUp,
} from './wsfeMessages.ts';

describe('endpoints', () => {
  it('deja el CUIT solo con dígitos', () => {
    expect(cuitDigits('30-71234567-1')).toBe('30712345671');
    expect(cuitDigits('123')).toBeNull();
    expect(cuitDigits(null)).toBeNull();
  });
  it('elige las facturas según la condición de IVA', () => {
    expect(lettersForTaxCondition('responsable_inscripto')).toEqual(['A', 'B']);
    expect(lettersForTaxCondition('monotributo')).toEqual(['C']);
    expect(lettersForTaxCondition('no_responsable')).toEqual([]);
  });
  it('cualquier ambiente desconocido es homologación', () => {
    expect(toEnvironment('produccion')).toBe('produccion');
    expect(toEnvironment('otro')).toBe('homologacion');
  });
});

describe('xml', () => {
  it('lee etiquetas con o sin prefijo', () => {
    expect(readTag('<a:Token>abc</a:Token>', 'Token')).toBe('abc');
    expect(readTag('<Token attr="1"> x </Token>', 'Token')).toBe('x');
    expect(readAllTags('<Err>1</Err><Err>2</Err>', 'Err')).toEqual(['1', '2']);
    expect(readTag('<TokenX>no</TokenX>', 'Token')).toBeNull();
  });
  it('escapa y desescapa', () => {
    expect(escapeXml('a<b&"c"')).toBe('a&lt;b&amp;&quot;c&quot;');
    expect(unescapeXml('&lt;t&gt;&amp;lt;&#65;')).toBe('<t>&lt;A');
  });
});

describe('WSAA', () => {
  it('arma el TRA con la hora de Argentina y 10 minutos de margen', () => {
    const tra = buildTra('wsfe', new Date('2026-11-27T15:00:00Z'));
    expect(tra).toContain('<generationTime>2026-11-27T11:50:00-03:00</generationTime>');
    expect(tra).toContain('<expirationTime>2026-11-27T12:10:00-03:00</expirationTime>');
    expect(tra).toContain('<service>wsfe</service>');
    expect(toArgentinaIso(new Date('2026-01-01T02:00:00Z'))).toBe('2025-12-31T23:00:00-03:00');
  });
  it('lee el ticket de acceso escapado dentro de loginCmsReturn', () => {
    const inner = '<loginTicketResponse><header><expirationTime>2026-11-28T03:00:00.000-03:00</expirationTime></header>' +
      '<credentials><token>TOK+/=</token><sign>SIG==</sign></credentials></loginTicketResponse>';
    const xml = `<soap:Envelope><soap:Body><loginCmsResponse><loginCmsReturn>${escapeXml(inner)}</loginCmsReturn></loginCmsResponse></soap:Body></soap:Envelope>`;
    expect(parseLoginCmsResponse(xml)).toEqual({
      ok: true, ticket: { token: 'TOK+/=', sign: 'SIG==', expiresAt: '2026-11-28T06:00:00.000Z' },
    });
  });
  it('reconoce el error de acceso ya vigente', () => {
    const xml = '<soapenv:Fault><faultcode>ns1:coe.alreadyAuthenticated</faultcode><faultstring>El CEE ya posee un TA valido para el acceso al WSN solicitado</faultstring></soapenv:Fault>';
    const result = parseLoginCmsResponse(xml);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.alreadyAuthenticated).toBe(true);
  });
  it('traduce el certificado que ARCA no emitió', () => {
    const result = parseLoginCmsResponse('<Fault><faultstring>Certificado bloqueado</faultstring></Fault>');
    expect(result.ok === false && result.message).toMatch(/no reconoce este certificado/);
  });
  it('traduce el certificado no autorizado', () => {
    const xml = '<Fault><faultstring>Computador no autorizado a acceder al servicio</faultstring></Fault>';
    const result = parseLoginCmsResponse(xml);
    expect(result.ok === false && result.message).toMatch(/wsfe/);
  });
});

describe('WSFE', () => {
  it('lee el estado de los servidores', () => {
    const xml = '<FEDummyResult><AppServer>OK</AppServer><DbServer>OK</DbServer><AuthServer>OK</AuthServer></FEDummyResult>';
    const result = parseDummyResponse(xml);
    expect(result.ok && serversAreUp(result.status)).toBe(true);
    const down = parseDummyResponse(xml.replace('<DbServer>OK', '<DbServer>NO'));
    expect(down.ok && serversAreUp(down.status)).toBe(false);
  });
  it('lee el último número autorizado', () => {
    expect(parseLastAuthorizedResponse('<FECompUltimoAutorizadoResult><PtoVta>3</PtoVta><CbteTipo>6</CbteTipo><CbteNro>41</CbteNro></FECompUltimoAutorizadoResult>'))
      .toEqual({ ok: true, number: 41 });
  });
  it('informa los errores de negocio con código y mensaje', () => {
    const xml = '<Errors><Err><Code>600</Code><Msg>ValidacionDeToken: No aparecio CUIT en lista de relaciones</Msg></Err></Errors>';
    const result = parseLastAuthorizedResponse(xml);
    expect(result.ok === false && result.message).toContain('600: ValidacionDeToken');
  });
  it('escapa el token y firma en el pedido', () => {
    const xml = buildLastAuthorizedEnvelope({ token: 'a<b', sign: 's&', cuit: '20329642330' }, 3, 6);
    expect(xml).toContain('<ar:Token>a&lt;b</ar:Token>');
    expect(xml).toContain('<ar:PtoVta>3</ar:PtoVta><ar:CbteTipo>6</ar:CbteTipo>');
  });
});
