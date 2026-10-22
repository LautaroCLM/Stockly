-- ============================================================================
-- PROPUESTA TANDA 2.0: ENDURECIMIENTO BASE, ESQUEMA PRIVADO Y PRIVILEGIOS
-- Módulo: Seguridad Base, Aislamiento de PostgREST y Configuración de Privilegios
-- Proyecto: Stockly (SaaS Multiempresa Pooled)
-- Estado: PROPUESTA TÉCNICA AISLADA (No desplegada en producción)
-- ============================================================================

-- 1. EXTENSIONES REQUERIDAS DE PRODUCCIÓN
-- pgcrypto se utiliza para generación de tokens criptográficos aleatorios y hashes SHA-256
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. ESQUEMA PRIVADO (PRIVATE)
-- Esquema no expuesto a la API REST de PostgREST para rutinas internas de autorización
CREATE SCHEMA IF NOT EXISTS private;
COMMENT ON SCHEMA private IS 'Esquema interno aislado para funciones de autorización RLS y procedimientos del sistema.';

-- Revocación absoluta de acceso al esquema private para roles web
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;

-- El propietario de private es postgres / service_role
GRANT USAGE ON SCHEMA private TO postgres;
GRANT USAGE ON SCHEMA private TO service_role;

-- 3. BLINDAJE DE ACCESO ANÓNIMO EN ESQUEMA PUBLIC (Principio de Mínimo Privilegio)
-- El rol anónimo (anon) no tiene acceso a datos, rutinas ni secuencias de la aplicación
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Revocación de privilegios heredados a PUBLIC sobre rutinas existentes en public
-- para evitar que funciones recién creadas o de plataforma queden expuestas sin autenticación
REVOKE EXECUTE ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

-- Subsanar advertencia específica del linter de Supabase sobre rls_auto_enable()
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO postgres, service_role;';
  END IF;
END $$;

-- 4. PRIVILEGIOS PREDETERMINADOS (ALTER DEFAULT PRIVILEGES)
-- Garantiza que cualquier objeto creado a futuro nazca blindado por omisión

-- Blindaje para objetos creados por el rol actual (postgres / superusuario)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON ROUTINES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- M-04: Revocación global de EXECUTE para evitar que funciones nuevas en cualquier esquema hereden ejecución a PUBLIC
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON ROUTINES FROM PUBLIC;

-- Revocar privilegios automáticos que Supabase concede por omisión al rol authenticated sobre tablas futuras
-- (Las tablas autorizadas deberán conceder permisos SELECT explícitamente en su migración correspondiente)
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;

-- En esquema private, ningún rol web hereda permisos sobre objetos nuevos
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON ROUTINES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA private REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated;
