import React, { useRef, useState } from 'react';
import { CheckCircle2, Download, FileKey2, Loader2, PlugZap, Upload, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatDateShort, formatDateTime } from '@/lib/formatters';
import { useArcaConnection } from '../hooks/useArcaConnection';
import { csrFilename, downloadTextFile, readCertificateFile } from '../certificateFiles';
import { ARCA_ENVIRONMENT_LABELS, type ArcaFunctionAction } from '../types';
import { ArcaCertificateHelp } from './ArcaCertificateHelp';

interface Props {
  companyId: string;
  cuit: string;
  isMasterAdmin: boolean;
}

type Notice = { ok: boolean; message: string } | null;

const Spinner: React.FC<{ show: boolean }> = ({ show }) => (show ? <Loader2 size={14} className="animate-spin" /> : null);

/** Certificado digital y prueba de conexión con ARCA. Solo el Master Admin puede operar. */
export const ArcaCertificateSection: React.FC<Props> = ({ companyId, cuit, isMasterAdmin }) => {
  const arca = useArcaConnection(companyId);
  const { status } = arca;
  const [notice, setNotice] = useState<Notice>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = arca.busyAction !== null;
  const isBusy = (action: ArcaFunctionAction) => arca.busyAction === action;

  const downloadCsr = (pem: string) => downloadTextFile(csrFilename(cuit, status.environment), pem);

  const generate = async () => {
    if (status.hasCertificate && !window.confirm('Generar un pedido nuevo anula el certificado cargado. ¿Seguir?')) return;
    setNotice(null);
    const result = await arca.generateCsr();
    const pem = result.ok ? result.data?.csrPem : undefined;
    if (result.ok && typeof pem === 'string') {
      downloadCsr(pem);
      setNotice({ ok: true, message: 'Pedido generado y descargado. Seguí los pasos en ARCA.' });
    } else setNotice({ ok: false, message: result.ok ? 'No llegó el pedido. Probá de nuevo.' : result.message });
  };

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    const read = await readCertificateFile(file);
    if (!read.ok) return setNotice({ ok: false, message: read.message });
    const result = await arca.uploadCertificate(read.text);
    setNotice(result.ok ? { ok: true, message: 'Certificado cargado. Ahora probá la conexión.' } : { ok: false, message: result.message });
  };

  const test = async () => {
    setNotice(null);
    const result = await arca.testConnection();
    if (!result.ok) setNotice({ ok: false, message: result.message });
  };

  const certText = status.hasCertificate
    ? `Cargado, vence el ${status.certificateExpiresAt ? formatDateShort(status.certificateExpiresAt) : '—'}`
    : status.hasCsr ? 'Pedido generado, falta cargar el certificado' : 'Sin certificado';

  return (
    <div className="space-y-3 border-t border-border/60 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-text-primary flex items-center gap-1.5"><FileKey2 size={14} /> Certificado digital</h3>
        <span className="text-[11px] text-text-muted">Ambiente: {ARCA_ENVIRONMENT_LABELS[status.environment]}</span>
      </div>
      {arca.error && <p role="alert" className="text-xs text-danger">{arca.error}</p>}
      <p className="text-xs text-text-secondary">{certText}</p>

      {status.lastTestAt && (
        <div className={`p-2.5 rounded-lg border text-[11px] flex items-start gap-2 ${status.lastTestOk ? 'bg-success/10 border-success/30 text-success' : 'bg-danger/10 border-danger/30 text-danger'}`}>
          {status.lastTestOk ? <CheckCircle2 size={14} className="shrink-0" /> : <XCircle size={14} className="shrink-0" />}
          <span>{status.lastTestMessage} <span className="opacity-70">({formatDateTime(status.lastTestAt)})</span></span>
        </div>
      )}
      {notice && (
        <p role="status" className={`text-[11px] ${notice.ok ? 'text-success' : 'text-danger'}`}>{notice.message}</p>
      )}

      {isMasterAdmin && (
        <>
          <ArcaCertificateHelp environment={status.environment} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy || !arca.isLoaded} onClick={() => void generate()}>
              <Spinner show={isBusy('generate_csr')} /><FileKey2 size={14} />
              <span>{status.hasCsr ? 'Generar pedido nuevo' : 'Generar pedido de certificado'}</span>
            </Button>
            {status.csrPem && (
              <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy} onClick={() => downloadCsr(status.csrPem ?? '')}>
                <Download size={14} /><span>Descargar pedido</span>
              </Button>
            )}
            <Button variant="secondary" size="sm" className="gap-1.5" disabled={busy || !status.hasCsr} onClick={() => fileRef.current?.click()}>
              <Spinner show={isBusy('upload_certificate')} /><Upload size={14} /><span>Cargar certificado</span>
            </Button>
            <input ref={fileRef} type="file" accept=".crt,.pem,.cer,.txt" className="hidden" aria-label="Archivo del certificado" onChange={(e) => void upload(e)} />
            <Button variant="primary" size="sm" className="gap-1.5" disabled={busy || !arca.isLoaded} onClick={() => void test()}>
              <Spinner show={isBusy('test_connection')} /><PlugZap size={14} /><span>Probar conexión</span>
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
