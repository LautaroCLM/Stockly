import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { localDateInputValue } from '@/lib/localDate';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';

const SELECT =
  'px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50';
const LABEL = 'block text-xs font-semibold text-text-secondary mb-1';

interface PurchaseHeaderFieldsProps {
  suppliers: Supplier[];
  supplierId: string;
  purchaseDate: string;
  invoiceNumber: string;
  disabled: boolean;
  onSupplierChange: (id: string) => void;
  onDateChange: (date: string) => void;
  onInvoiceChange: (value: string) => void;
}

/** Proveedor, fecha y número de factura o remito. */
export const PurchaseHeaderFields: React.FC<PurchaseHeaderFieldsProps> = (props) => (
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
    <div>
      <label htmlFor="purchase-supplier" className={LABEL}>Proveedor <span className="text-danger">*</span></label>
      <select id="purchase-supplier" value={props.supplierId} onChange={(e) => props.onSupplierChange(e.target.value)}
        disabled={props.disabled} className={`w-full ${SELECT}`}>
        <option value="">Seleccione un proveedor...</option>
        {props.suppliers.map((s) => (
          <option key={s.id} value={s.id}>{s.name} {s.taxId ? `(CUIT: ${s.taxId})` : ''}</option>
        ))}
      </select>
      {props.suppliers.length === 0 && (
        <p className="mt-1 text-[11px] text-warning">No hay proveedores activos. Creá uno en la sección Proveedores para poder registrar compras.</p>
      )}
    </div>
    <div>
      <label htmlFor="purchase-date" className={LABEL}>Fecha de Compra</label>
      <Input id="purchase-date" type="date" value={props.purchaseDate} max={localDateInputValue()}
        onChange={(e) => props.onDateChange(e.target.value)} disabled={props.disabled} />
    </div>
    <div>
      <label htmlFor="purchase-invoice" className={LABEL}>Nro. Factura / Remito</label>
      <Input id="purchase-invoice" placeholder="Ej. FC-0001-00004523" value={props.invoiceNumber} maxLength={100}
        onChange={(e) => props.onInvoiceChange(e.target.value)} disabled={props.disabled} />
    </div>
  </div>
);

interface ProductAdderProps {
  products: Product[];
  selectedProductId: string;
  disabled: boolean;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

/** Selector de producto activo para sumarlo a la compra. */
export const ProductAdder: React.FC<ProductAdderProps> = ({ products, selectedProductId, disabled, onSelect, onAdd }) => (
  <div>
    <label htmlFor="purchase-product" className={`${LABEL} mb-1.5`}>Agregar Productos</label>
    <div className="flex gap-2">
      <select id="purchase-product" value={selectedProductId} onChange={(e) => onSelect(e.target.value)} disabled={disabled}
        className={`flex-1 ${SELECT}`}>
        <option value="">Seleccionar producto para ingresar...</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku}) — Stock actual: {p.stock} {p.unit || 'u'}</option>
        ))}
      </select>
      <Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={!selectedProductId || disabled}
        className="flex items-center gap-1.5 shrink-0">
        <Plus size={14} /> Agregar
      </Button>
    </div>
  </div>
);
