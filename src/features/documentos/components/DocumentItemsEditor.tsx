import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { CASH_FIELD_CLASS } from '@/features/caja/components/CashModalShell';
import type { Product } from '@/features/inventario/types';
import { newItem } from '../documentForm';
import { formatCurrencyInput } from '../formatInput';
import type { DocType, ItemFormValues } from '../types';

interface DocumentItemsEditorProps {
  type: DocType;
  items: ItemFormValues[];
  products: Product[];
  showPrices: boolean;
  disabled: boolean;
  onChange: (items: ItemFormValues[]) => void;
}

const LIST_ID = 'document-product-options';

/** Líneas del documento: se elige un producto del inventario o se escribe una descripción libre. */
export const DocumentItemsEditor: React.FC<DocumentItemsEditorProps> = ({ type, items, products, showPrices, disabled, onChange }) => {
  const active = products.filter((p) => p.isActive !== false);

  const update = (key: string, patch: Partial<ItemFormValues>) =>
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  // Si el texto coincide con un producto, se enlaza y se sugiere su precio
  const changeDescription = (item: ItemFormValues, text: string) => {
    const match = active.find((p) => p.name.toLowerCase() === text.trim().toLowerCase());
    if (match) {
      update(item.key, {
        description: match.name, productId: match.id,
        unitPrice: showPrices && item.unitPrice === '' ? formatCurrencyInput(match.salePrice) : item.unitPrice,
      });
    } else {
      update(item.key, { description: text, productId: '' });
    }
  };

  return (
    <div className="space-y-2">
      <datalist id={LIST_ID}>{active.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <div className="flex items-center justify-between">
        <span className="font-semibold text-text-secondary">Ítems <span className="text-danger">*</span></span>
        <Button type="button" variant="secondary" size="sm" disabled={disabled || items.length >= 200}
          onClick={() => onChange([...items, newItem()])} className="gap-1.5">
          <Plus size={14} /><span>Agregar ítem</span>
        </Button>
      </div>

      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={item.key} className="p-2.5 rounded-xl bg-surface-2/40 border border-border space-y-2">
            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-12 sm:col-span-6">
                <input aria-label={`Descripción del ítem ${index + 1}`} list={LIST_ID} value={item.description} disabled={disabled}
                  maxLength={200} placeholder="Producto del inventario o descripción libre"
                  onChange={(e) => changeDescription(item, e.target.value)} className={CASH_FIELD_CLASS} />
              </div>
              <div className={showPrices ? 'col-span-4 sm:col-span-2' : 'col-span-10 sm:col-span-5'}>
                <input aria-label={`Cantidad del ítem ${index + 1}`} inputMode="decimal" value={item.quantity} disabled={disabled}
                  placeholder="Cant." onChange={(e) => update(item.key, { quantity: e.target.value })} className={CASH_FIELD_CLASS} />
              </div>
              {showPrices && (
                <div className="col-span-7 sm:col-span-3">
                  <input aria-label={`Precio unitario del ítem ${index + 1}`} inputMode="decimal" value={item.unitPrice} disabled={disabled}
                    placeholder="Precio unit." onChange={(e) => update(item.key, { unitPrice: e.target.value })} className={CASH_FIELD_CLASS} />
                </div>
              )}
              <div className="col-span-1 flex justify-end">
                <button type="button" aria-label={`Quitar el ítem ${index + 1}`} disabled={disabled || items.length === 1}
                  onClick={() => onChange(items.filter((i) => i.key !== item.key))}
                  className="p-2 rounded-lg text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            {type === 'garantia' && (
              <input aria-label={`Número de serie del ítem ${index + 1}`} value={item.serialNumber} disabled={disabled} maxLength={80}
                placeholder="Número de serie (opcional)" onChange={(e) => update(item.key, { serialNumber: e.target.value })}
                className={CASH_FIELD_CLASS} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
