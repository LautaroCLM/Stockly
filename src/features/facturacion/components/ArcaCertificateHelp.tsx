import React from 'react';
import type { ArcaEnvironment } from '../types';

/** Pasos que hay que hacer en la web de ARCA con clave fiscal (Stockly no puede hacerlos). */
export const ArcaCertificateHelp: React.FC<{ environment: ArcaEnvironment }> = ({ environment }) => (
  <details className="rounded-lg border border-border bg-surface-2/40 text-[11px] text-text-secondary">
    <summary className="cursor-pointer select-none p-2.5 font-semibold text-text-primary">
      Cómo obtener el certificado en ARCA
    </summary>
    <ol className="list-decimal space-y-1.5 px-6 pb-3 leading-relaxed">
      <li>Generá el pedido acá abajo y descargalo (archivo <strong>.csr</strong>).</li>
      {environment === 'homologacion' ? (
        <>
          <li>Entrá a ARCA con la clave fiscal del CUIT de la empresa y abrí el servicio <strong>WSASS – Autogestión Certificados Homologación</strong> (si no aparece, adheríte desde el Administrador de Relaciones).</li>
          <li>En <strong>Nuevo Certificado</strong>, poné como nombre <strong>stockly</strong>, pegá el contenido del .csr y creá el certificado. Copiá el resultado y guardalo como <strong>stockly.crt</strong>.</li>
          <li>En <strong>Crear autorización a servicio</strong>, elegí el certificado <strong>stockly</strong> y el servicio <strong>wsfe</strong> (Facturación Electrónica).</li>
        </>
      ) : (
        <>
          <li>Entrá a ARCA con clave fiscal y abrí <strong>Administración de Certificados Digitales</strong>. Agregá el alias <strong>stockly</strong>, subí el .csr y descargá el certificado (.crt).</li>
          <li>En el <strong>Administrador de Relaciones</strong>, autorizá a ese certificado para el servicio <strong>wsfe</strong> (Facturación Electrónica).</li>
        </>
      )}
      <li>Volvé acá, cargá el archivo .crt y tocá <strong>Probar conexión</strong>.</li>
    </ol>
  </details>
);
