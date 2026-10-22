/**
 * Validador algorítmico de CUIT argentino (Módulo 11).
 * Espeja la lógica estricta de la función SQL public.validate_cuit().
 */
export function validateCuit(cuit: string | null | undefined): boolean {
  if (!cuit || cuit.trim() === '') {
    return true; // CUIT es opcional
  }

  const trimmed = cuit.trim();

  // Debe coincidir con exactamente 11 dígitos numéricos o formato XX-XXXXXXXX-X
  if (!/^\d{11}$/.test(trimmed) && !/^\d{2}-\d{8}-\d$/.test(trimmed)) {
    return false;
  }

  const clean = trimmed.replace(/-/g, '');
  if (clean.length !== 11) {
    return false;
  }

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;

  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean[i], 10) * multipliers[i];
  }

  let verifier = 11 - (sum % 11);
  if (verifier === 11) {
    verifier = 0;
  } else if (verifier === 10) {
    verifier = 9;
  }

  return verifier === parseInt(clean[10], 10);
}

/**
 * Formatea una cadena de 11 dígitos a formato estándar XX-XXXXXXXX-X
 */
export function formatCuit(cuit: string): string {
  const clean = cuit.replace(/\D/g, '').substring(0, 11);
  if (clean.length <= 2) return clean;
  if (clean.length <= 10) return `${clean.substring(0, 2)}-${clean.substring(2)}`;
  return `${clean.substring(0, 2)}-${clean.substring(2, 10)}-${clean.substring(10, 11)}`;
}
