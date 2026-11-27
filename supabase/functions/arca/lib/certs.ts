import forge from 'node-forge';

/** serialNumber del sujeto: ARCA espera "CUIT 20123456789". */
const SERIAL_NUMBER_OID = '2.5.4.5';
const CSR_COMMON_NAME = 'stockly';

export class CertificateError extends Error {}

function bytesToPem(bytes: Uint8Array, label: string): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = forge.util.encode64(binary).replace(/(.{64})/g, '$1\n').trim();
  return `-----BEGIN ${label}-----\n${base64}\n-----END ${label}-----\n`;
}

/** Razón social en ASCII (sin acentos ni símbolos raros), como la aceptan los pedidos de ARCA. */
export function csrOrganizationName(companyName: string): string {
  const ascii = companyName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 .,&-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (ascii || 'Empresa').slice(0, 64);
}

/**
 * Clave RSA 2048 nueva y su pedido de certificado (CSR).
 * La clave se genera con WebCrypto (nativo y rápido) y el pedido se arma con forge.
 */
export async function generateKeyAndCsr(companyName: string, cuit: string): Promise<{ privateKeyPem: string; csrPem: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const privateKeyPem = bytesToPem(pkcs8, 'PRIVATE KEY');

  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(privateKey.n, privateKey.e);
  csr.setSubject([
    { name: 'countryName', value: 'AR' },
    { name: 'organizationName', value: csrOrganizationName(companyName) },
    { name: 'commonName', value: CSR_COMMON_NAME },
    { type: SERIAL_NUMBER_OID, value: `CUIT ${cuit}` },
  ]);
  csr.sign(privateKey, forge.md.sha256.create());
  return { privateKeyPem, csrPem: forge.pki.certificationRequestToPem(csr) };
}

export interface CertificateInfo {
  expiresAt: string;
  subject: string;
}

/**
 * Valida el certificado que devolvió ARCA: que sea de la clave del último pedido,
 * del CUIT de la empresa y que no esté vencido.
 */
export function inspectCertificate(certificatePem: string, privateKeyPem: string, cuit: string, now: Date): CertificateInfo {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificatePem.trim());
  } catch {
    throw new CertificateError('El archivo no es un certificado válido. Subí el .crt o .pem que descargaste de ARCA.');
  }
  const key = forge.pki.privateKeyFromPem(privateKeyPem);
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  if (!publicKey.n || publicKey.n.compareTo(key.n) !== 0) {
    throw new CertificateError('Este certificado no corresponde al último pedido generado en Stockly.');
  }
  const serial = String(cert.subject.getField({ type: SERIAL_NUMBER_OID })?.value ?? '');
  if (!serial.replace(/\D/g, '').includes(cuit)) {
    throw new CertificateError(`El certificado es de otro CUIT (${serial || 'sin CUIT'}).`);
  }
  if (cert.validity.notAfter.getTime() <= now.getTime()) {
    throw new CertificateError('El certificado está vencido. Generá un pedido nuevo.');
  }
  const commonName = String(cert.subject.getField('CN')?.value ?? '');
  return { expiresAt: cert.validity.notAfter.toISOString(), subject: `CN=${commonName}, ${serial}` };
}

/** Firma el pedido de acceso (TRA) en CMS/PKCS#7 con el certificado incluido, en base64, como lo pide WSAA. */
export function signTra(tra: string, certificatePem: string, privateKeyPem: string, now: Date): string {
  const cert = forge.pki.certificateFromPem(certificatePem.trim());
  const key = forge.pki.privateKeyFromPem(privateKeyPem);
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(tra, 'utf8');
  p7.addCertificate(cert);
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      // forge acepta un Date para signingTime aunque sus tipos declaren string
      { type: forge.pki.oids.signingTime, value: now as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
