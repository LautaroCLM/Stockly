import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import { CertificateError, csrOrganizationName, generateKeyAndCsr, inspectCertificate, signTra } from './certs.ts';

const CUIT = '20329642330';
const NOW = new Date('2026-11-27T12:00:00Z');

/** Simula el certificado que entrega ARCA: firma el pedido con una CA de prueba. */
function issueCertificate(csrPem: string, notAfter: Date): string {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const ca = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = csr.publicKey as forge.pki.rsa.PublicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2026-01-01T00:00:00Z');
  cert.validity.notAfter = notAfter;
  cert.setSubject(csr.subject.attributes);
  cert.setIssuer([{ name: 'commonName', value: 'Computadores Test' }]);
  cert.sign(ca.privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

describe('pedido de certificado', () => {
  it('limpia la razón social a ASCII', () => {
    expect(csrOrganizationName('Ferretería Ñandú S.A. ®')).toBe('Ferreteria Nandu S.A.');
    expect(csrOrganizationName('***')).toBe('Empresa');
  });

  it('genera clave PKCS#8 y un CSR firmado con el CUIT en serialNumber', async () => {
    const { privateKeyPem, csrPem } = await generateKeyAndCsr('Ferretería El Tornillo', CUIT);
    expect(privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
    const csr = forge.pki.certificationRequestFromPem(csrPem);
    expect(csr.verify()).toBe(true);
    expect(csr.subject.getField({ type: '2.5.4.5' })?.value).toBe(`CUIT ${CUIT}`);
    expect(csr.subject.getField('O')?.value).toBe('Ferreteria El Tornillo');
  }, 20000);
});

describe('certificado y firma', async () => {
  const { privateKeyPem, csrPem } = await generateKeyAndCsr('Empresa Test', CUIT);
  const certPem = issueCertificate(csrPem, new Date('2028-11-27T00:00:00Z'));

  it('acepta el certificado de su pedido', () => {
    expect(inspectCertificate(certPem, privateKeyPem, CUIT, NOW)).toEqual({
      expiresAt: '2028-11-27T00:00:00.000Z', subject: `CN=stockly, CUIT ${CUIT}`,
    });
  });

  it('rechaza un certificado de otra clave, de otro CUIT, vencido o inválido', async () => {
    const other = await generateKeyAndCsr('Otra', CUIT);
    expect(() => inspectCertificate(issueCertificate(other.csrPem, new Date('2028-01-01')), privateKeyPem, CUIT, NOW))
      .toThrow(/último pedido/);
    expect(() => inspectCertificate(certPem, privateKeyPem, '30712345671', NOW)).toThrow(/otro CUIT/);
    expect(() => inspectCertificate(issueCertificate(csrPem, new Date('2026-06-01')), privateKeyPem, CUIT, NOW)).toThrow(/vencido/);
    expect(() => inspectCertificate('no es un pem', privateKeyPem, CUIT, NOW)).toThrow(CertificateError);
  });

  it('firma el TRA en CMS con el contenido y el certificado adentro', () => {
    const tra = '<loginTicketRequest version="1.0"><service>wsfe</service></loginTicketRequest>';
    const cms = signTra(tra, certPem, privateKeyPem, NOW);
    const msg = forge.pkcs7.messageFromAsn1(forge.asn1.fromDer(forge.util.decode64(cms))) as forge.pkcs7.PkcsSignedData & {
      rawCapture: { content: forge.asn1.Asn1 };
    };
    expect(msg.certificates).toHaveLength(1);
    const content = forge.asn1.toDer(msg.rawCapture.content).getBytes();
    expect(content).toContain('<service>wsfe</service>');
  });
});
