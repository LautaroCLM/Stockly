import { describe, expect, it } from 'vitest';
import { describeRecord, diffAuditData, tableLabel } from './auditDescribe';

describe('diffAuditData', () => {
  it('lista solo los campos que cambiaron, con nombre en español', () => {
    const changes = diffAuditData(
      { name: 'Latex', selling_price: 40, updated_at: '2026-11-03' },
      { name: 'Latex', selling_price: 45, updated_at: '2026-11-04' }
    );
    expect(changes).toEqual([{ field: 'precio de venta', before: '40', after: '45' }]);
  });

  it('traduce booleanos y valores vacíos', () => {
    const changes = diffAuditData({ is_active: true, tax_id: null }, { is_active: false, tax_id: '30-1' });
    expect(changes).toEqual([
      { field: 'activo', before: 'sí', after: 'no' },
      { field: 'CUIT', before: '—', after: '30-1' },
    ]);
  });

  it('no compara altas ni bajas', () => {
    expect(diffAuditData(null, { name: 'x' })).toEqual([]);
    expect(diffAuditData({ name: 'x' }, null)).toEqual([]);
  });
});

describe('describeRecord', () => {
  it('usa el nombre o el número de documento', () => {
    expect(describeRecord({ newData: { name: 'Proveedor A' }, oldData: null })).toBe('Proveedor A');
    expect(describeRecord({ newData: { sale_number: 'VTA-00000001' }, oldData: null })).toBe('VTA-00000001');
  });

  it('usa los datos anteriores en una baja', () => {
    expect(describeRecord({ newData: null, oldData: { name: 'Borrado' } })).toBe('Borrado');
  });
});

describe('tableLabel', () => {
  it('traduce tablas conocidas y deja las demás igual', () => {
    expect(tableLabel('products')).toBe('Producto');
    expect(tableLabel('otra_tabla')).toBe('otra_tabla');
  });
});
