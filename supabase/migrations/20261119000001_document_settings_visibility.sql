-- ============================================================================
-- MIGRACIÓN: DATOS DE LA EMPRESA PARA COMPROBANTES, VISIBLES PARA TODO EL EQUIPO
--
-- Domicilio, teléfono, email, condición frente al IVA, punto de venta y pie salen
-- impresos en el ticket de venta y en los documentos. Cualquier miembro que imprime
-- un ticket necesita leerlos, aunque no tenga acceso al módulo Documentos.
-- Siguen siendo editables solo por el Master Admin (save_document_settings).
-- ============================================================================
DROP POLICY IF EXISTS "document_settings_select" ON public.document_settings;
CREATE POLICY "document_settings_select"
  ON public.document_settings FOR SELECT TO authenticated
  USING (company_id IN (SELECT private.my_accessible_company_ids()));
