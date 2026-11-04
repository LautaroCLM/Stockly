import { describe, expect, it } from 'vitest';
import { emailFieldError, initialSupplierValues, toSupplierInput, validateSupplierForm } from './supplierForm';

describe('formulario de proveedor', () => {
  const values = { ...initialSupplierValues(null), name: '  Distribuidora QA  ' };

  it('exige nombre y valida el correo', () => {
    expect(validateSupplierForm({ ...values, name: ' ' })).toMatch(/obligatorio/);
    expect(validateSupplierForm({ ...values, email: 'no-es-correo' })).toMatch(/correo/);
    expect(validateSupplierForm(values)).toBeNull();
  });

  it('acepta campos opcionales vacíos', () => {
    expect(emailFieldError('')).toBeNull();
    expect(emailFieldError('ventas@proveedor.com')).toBeNull();
  });

  it('limpia espacios, guiones del CUIT y opcionales vacíos', () => {
    expect(toSupplierInput({ ...values, taxId: '30-71234567-1', phone: ' ' }, 's1')).toMatchObject({
      supplierId: 's1',
      name: 'Distribuidora QA',
      taxId: '30712345671',
      phone: undefined,
      isActive: true,
    });
  });
});
