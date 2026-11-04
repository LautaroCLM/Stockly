import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { marginSummary, type ProductFormValues } from '../productForm';

type Change = <K extends keyof ProductFormValues>(field: K, value: ProductFormValues[K]) => void;

const FIELD = 'w-full h-9 px-3 text-xs bg-surface-2 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none';
const LABEL = 'text-xs font-semibold text-text-secondary';
const Required = () => <span className="text-danger">*</span>;

const UNITS: [string, string][] = [
  ['unidad', 'Unidad (unidad)'],
  ['bulto', 'Bulto / Caja (bulto)'],
  ['par', 'Par (par)'],
  ['kg', 'Kilogramo (kg)'],
  ['litro', 'Litro (litro)'],
  ['metro', 'Metro (metro)'],
];

/** Nombre, SKU, código de barras y categoría. */
export const ProductIdentityFields: React.FC<{ values: ProductFormValues; categories: string[]; onChange: Change }> = ({
  values,
  categories,
  onChange,
}) => (
  <>
    <div className="space-y-1">
      <label htmlFor="product-name" className={LABEL}>Nombre del Producto <Required /></label>
      <input id="product-name" type="text" required value={values.name} onChange={(e) => onChange('name', e.target.value)}
        placeholder="Ej. Taladro Percutor Bosch 650W" className={FIELD} />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="space-y-1">
        <label htmlFor="product-sku" className={LABEL}>Código SKU <Required /></label>
        <input id="product-sku" type="text" required value={values.sku} onChange={(e) => onChange('sku', e.target.value.toUpperCase())}
          placeholder="Ej. FER-1108" className={`${FIELD} font-mono uppercase`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="product-barcode" className={LABEL}>
          Código de Barras <span className="text-text-muted text-[11px]">(Opcional)</span>
        </label>
        <input id="product-barcode" type="text" value={values.barcode} onChange={(e) => onChange('barcode', e.target.value)}
          placeholder="Ej. 7791234567890" className={`${FIELD} font-mono`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="product-category" className={LABEL}>Categoría <Required /></label>
        {categories.length > 0 ? (
          <select id="product-category" value={values.category} onChange={(e) => onChange('category', e.target.value)} className={`${FIELD} cursor-pointer`}>
            <option value="" disabled>Seleccione una categoría...</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : (
          <div className="p-2 bg-warning/10 border border-warning/30 rounded-lg text-[11px] text-warning leading-snug">
            No hay categorías registradas. Debe crear una desde el botón &quot;Categorías&quot;.
          </div>
        )}
        <p className="text-[10px] text-text-muted">Para crear o editar categorías, use el módulo &quot;Categorías&quot; del inventario.</p>
      </div>
    </div>
  </>
);

/** Costo (solo administradores), precio, stock mínimo y unidad. */
export const ProductPricingFields: React.FC<{
  values: ProductFormValues;
  canManageCosts: boolean;
  costPlaceholder: string;
  onChange: Change;
}> = ({ values, canManageCosts, costPlaceholder, onChange }) => {
  const numeric = `${FIELD} text-right tabular-nums`;
  return (
    <div className={`grid grid-cols-1 ${canManageCosts ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-3`}>
      {canManageCosts && (
        <div className="space-y-1">
          <label htmlFor="product-cost" className={LABEL}>Costo Compra ($)</label>
          <input id="product-cost" type="number" min="0" step="0.01" value={values.costPrice} placeholder={costPlaceholder}
            onChange={(e) => onChange('costPrice', e.target.value)} className={`${numeric} font-semibold`} />
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor="product-price" className={LABEL}>Precio Venta ($) <Required /></label>
        <input id="product-price" type="number" min="0" step="0.01" required value={values.salePrice}
          onChange={(e) => onChange('salePrice', e.target.value)} className={`${numeric} font-bold`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="product-min-stock" className={LABEL}>Stock Mínimo</label>
        <input id="product-min-stock" type="number" min="0" step="0.01" value={values.minStock}
          onChange={(e) => onChange('minStock', e.target.value)} className={`${numeric} font-semibold`} />
      </div>
      <div className="space-y-1">
        <label htmlFor="product-unit" className={LABEL}>Unidad</label>
        <select id="product-unit" value={values.unit} onChange={(e) => onChange('unit', e.target.value)} className={FIELD}>
          {UNITS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  );
};

/** Ganancia y margen estimados en tiempo real. */
export const MarginBox: React.FC<{ costPrice: string; salePrice: string }> = ({ costPrice, salePrice }) => {
  const { grossProfit, margin, isNegativeMargin } = marginSummary(costPrice, salePrice);
  const profitClass = grossProfit === null ? 'text-text-muted font-normal' : grossProfit >= 0 ? 'text-emerald-400' : 'text-danger';
  const marginClass =
    margin === null ? 'text-text-muted font-normal' : margin >= 20 ? 'text-emerald-400' : margin >= 0 ? 'text-amber-400' : 'text-danger';
  return (
    <div className="bg-surface-2/60 border border-border rounded-xl p-3.5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Ganancia bruta estimada:</span>
        <span className={`font-bold tabular-nums ${profitClass}`}>
          {grossProfit !== null ? `${grossProfit >= 0 ? '+' : ''}${formatCurrency(grossProfit)}` : 'No disponible (sin costo asignado)'}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-text-muted">Margen sobre precio de venta:</span>
        <span className={`font-bold tabular-nums ${marginClass}`}>
          {margin !== null ? `${margin.toFixed(1)}%` : grossProfit === null ? 'No disponible (sin costo asignado)' : 'No calculable (Precio $0)'}
        </span>
      </div>
      {isNegativeMargin && (
        <div className="pt-2 border-t border-border/50 text-[11px] text-amber-400 flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          <span>Atención: El costo de compra supera el precio de venta (Margen negativo).</span>
        </div>
      )}
    </div>
  );
};
