// Edge Function `arca`: única pieza de Stockly que habla con ARCA (ex AFIP).
// Acciones: certificado y conexión (solo el Master Admin) y autorizar facturas (permiso de facturación).
// La clave privada nunca sale de acá.
import { createClient } from '@supabase/supabase-js';
import { generateCsr, testConnection, uploadCertificate } from './lib/actions.ts';
import { ArcaUnavailableError } from './lib/arcaClient.ts';
import { authorizeInvoice } from './lib/authorize.ts';
import { CertificateError } from './lib/certs.ts';
import { CredentialsStore, ForbiddenError, getAdminContext } from './lib/db.ts';
import { InvoiceStore, getInvoiceContext } from './lib/invoiceStore.ts';
import { BadRequestError, parseArcaRequest, type ArcaResponse } from './lib/request.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(body: ArcaResponse, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}

/** Mensaje para el usuario: los errores esperados se muestran tal cual; el resto, genérico. */
function userMessage(err: unknown): string {
  if (err instanceof BadRequestError || err instanceof ForbiddenError || err instanceof CertificateError || err instanceof ArcaUnavailableError) {
    return err.message;
  }
  console.error('arca: error inesperado', err);
  return 'Ocurrió un error inesperado al hablar con ARCA. Probá de nuevo.';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return reply({ ok: false, message: 'Método no permitido.' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return reply({ ok: false, message: 'Sesión no válida. Volvé a iniciar sesión.' }, 401);

  try {
    const request = parseArcaRequest(await req.json().catch(() => null));
    const url = env('SUPABASE_URL');
    const userClient = createClient(url, env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const serviceClient = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

    if (request.action === 'authorize_invoice') {
      const invoiceCtx = await getInvoiceContext(userClient, request.companyId, request.invoiceId);
      const creds = new CredentialsStore(serviceClient, request.companyId, invoiceCtx.environment);
      return reply(await authorizeInvoice(invoiceCtx, creds, new InvoiceStore(serviceClient, request.invoiceId)));
    }

    const ctx = await getAdminContext(userClient, request.companyId);
    const store = new CredentialsStore(serviceClient, request.companyId, ctx.environment);

    switch (request.action) {
      case 'generate_csr':
        return reply(await generateCsr(ctx, store));
      case 'upload_certificate':
        return reply(await uploadCertificate(ctx, store, request.certificatePem));
      case 'test_connection':
        return reply(await testConnection(ctx, store));
    }
  } catch (err) {
    return reply({ ok: false, message: userMessage(err) });
  }
});
