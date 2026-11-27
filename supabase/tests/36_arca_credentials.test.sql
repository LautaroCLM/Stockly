-- ============================================================================
-- SUITE DE PRUEBAS (pgTAP) - FACTURA ELECTRÓNICA: CERTIFICADO Y CONEXIÓN (TANDA 2)
-- Módulo: arca_credentials, arca_tokens (Vault, solo service_role) y get_arca_status
-- Estado: SUITE AISLADA E INDEPENDIENTE (Transacción con ROLLBACK)
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(18);

DO $$
DECLARE
  r RECORD;
  v_schema TEXT;
BEGIN
  SELECT n.nspname INTO v_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'pgtap';

  IF v_schema IS NOT NULL THEN
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO authenticated;', v_schema);
  END IF;

  FOR r IN
    SELECT n.nspname AS schema_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_depend d ON d.objid = p.oid
    JOIN pg_catalog.pg_extension e ON e.oid = d.refobjid
    WHERE e.extname = 'pgtap'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated;', r.schema_name, r.proname, r.args);
  END LOOP;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('aaaa0036-0000-0000-0000-000000000001', 'admin_cert_a@stockly.local'),
  ('aaaa0036-0000-0000-0000-000000000002', 'empleado_cert_a@stockly.local'),
  ('aaaa0036-0000-0000-0000-000000000003', 'admin_cert_b@stockly.local');

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000001';
SELECT public.create_company('Empresa CERT Alpha', NULL) AS comp_a \gset
SELECT public.invite_user_to_company(:'comp_a', 'empleado_cert_a@stockly.local', 'employee') AS tok_emp \gset
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000002';
SELECT public.accept_company_invitation(:'tok_emp');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000003';
SELECT public.create_company('Empresa CERT Beta', NULL) AS comp_b \gset
RESET ROLE;

-- 1-2. El admin obtiene su contexto; el empleado no
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000001';
SELECT is(public.arca_admin_context(:'comp_a') ->> 'environment', 'homologacion', 'T-01 el admin obtiene el contexto; el ambiente arranca en homologación');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000002';
SELECT throws_like(format($q$SELECT public.arca_admin_context(%L)$q$, :'comp_a'), '%', 'T-02 un empleado no obtiene el contexto de admin');

-- 3-5. Los usuarios no tocan credenciales ni tokens
SELECT throws_like($q$SELECT * FROM public.arca_credentials$q$, '%permission denied%', 'T-03 nadie lee arca_credentials desde el navegador');
SELECT throws_like($q$SELECT * FROM public.arca_tokens$q$, '%permission denied%', 'T-04 nadie lee arca_tokens desde el navegador');
SELECT throws_like(format($q$SELECT public.arca_get_credentials(%L, 'homologacion')$q$, :'comp_a'), '%permission denied%', 'T-05 un usuario no puede leer la clave privada');

-- 6. Estado sin pedido
SELECT is((public.get_arca_status(:'comp_a') ->> 'hasCsr')::BOOLEAN, false, 'T-06 sin pedido, el estado lo dice');

-- 7-11. service_role: guarda clave en Vault y pedido; la clave vuelve descifrada
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT lives_ok(format($q$SELECT public.arca_store_csr(%L, 'homologacion', '-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----', '-----BEGIN CERTIFICATE REQUEST-----\nBBB\n-----END CERTIFICATE REQUEST-----', 'aaaa0036-0000-0000-0000-000000000001')$q$, :'comp_a'), 'T-07 la función guarda clave y pedido');
SELECT is(public.arca_get_credentials(:'comp_a', 'homologacion') ->> 'privateKeyPem', '-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----', 'T-08 la clave vuelve descifrada desde Vault');
RESET ROLE;
SELECT is((SELECT count(*) FROM vault.secrets WHERE id = (SELECT key_secret_id FROM public.arca_credentials WHERE company_id = :'comp_a')), 1::BIGINT, 'T-09 la clave quedó en Vault');
SELECT ok((SELECT key_secret_id FROM public.arca_credentials WHERE company_id = :'comp_a') IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.arca_credentials WHERE csr_pem LIKE '%PRIVATE KEY%'), 'T-10 la tabla no guarda la clave en texto');
SELECT id AS old_secret FROM vault.secrets WHERE id = (SELECT key_secret_id FROM public.arca_credentials WHERE company_id = :'comp_a') \gset
SET LOCAL ROLE service_role;
SELECT public.arca_store_csr(:'comp_a', 'homologacion', '-----BEGIN PRIVATE KEY-----\nCCC\n-----END PRIVATE KEY-----', '-----BEGIN CERTIFICATE REQUEST-----\nDDD\n-----END CERTIFICATE REQUEST-----', 'aaaa0036-0000-0000-0000-000000000001');
RESET ROLE;
SELECT is((SELECT count(*) FROM vault.secrets WHERE id = :'old_secret'), 0::BIGINT, 'T-11 un pedido nuevo borra la clave anterior de Vault');

-- 12-13. Certificado y token
SET LOCAL ROLE service_role;
SELECT public.arca_store_token(:'comp_a', 'homologacion', 'wsfe', 'tok', 'sig', now() + interval '12 hours');
SELECT is(public.arca_get_token(:'comp_a', 'homologacion', 'wsfe') ->> 'token', 'tok', 'T-12 el token vigente se reutiliza');
SELECT public.arca_store_certificate(:'comp_a', 'homologacion', '-----BEGIN CERTIFICATE-----\nEEE\n-----END CERTIFICATE-----', now() + interval '2 years', 'CN=stockly', 'aaaa0036-0000-0000-0000-000000000001');
SELECT is(public.arca_get_token(:'comp_a', 'homologacion', 'wsfe'), NULL, 'T-13 un certificado nuevo descarta el token anterior');
SELECT throws_like(format($q$SELECT public.arca_store_certificate(%L, 'homologacion', '-----BEGIN CERTIFICATE-----', now(), 'x', NULL)$q$, :'comp_b'), '%pedido de certificado%', 'T-14 no se carga un certificado sin pedido');
SELECT public.arca_store_test_result(:'comp_a', 'homologacion', true, 'Conexión correcta');
RESET ROLE;

-- 15-16. Estado: el admin ve el pedido, el empleado no
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000001';
SELECT ok((public.get_arca_status(:'comp_a') ->> 'hasCertificate')::BOOLEAN AND (public.get_arca_status(:'comp_a') ->> 'lastTestOk')::BOOLEAN, 'T-15 el admin ve certificado cargado y prueba correcta');
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000002';
SELECT is(public.get_arca_status(:'comp_a') ->> 'csrPem', NULL, 'T-16 el empleado ve el estado pero no el pedido');

-- 17-18. Aislamiento entre empresas
SET LOCAL "request.jwt.claim.sub" = 'aaaa0036-0000-0000-0000-000000000003';
SELECT throws_like(format($q$SELECT public.get_arca_status(%L)$q$, :'comp_a'), '%Acceso denegado%', 'T-17 otra empresa no ve el estado ajeno');
SELECT throws_like(format($q$SELECT public.arca_admin_context(%L)$q$, :'comp_a'), '%', 'T-18 un admin de otra empresa no obtiene el contexto ajeno');

SELECT * FROM finish();
ROLLBACK;
