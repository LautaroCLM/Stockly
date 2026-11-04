import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, Plus, AlertCircle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/formatters';
import { localDateInputValue } from '@/lib/localDate';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';
import type { CreatePurchaseInput, PurchaseActionResult, PurchaseDraftItem } from '../types';
import { PurchaseDraftTable } from './PurchaseDraftTable';

interface PurchaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  products: Product[];
  onSavePurchase: (input: CreatePurchaseInput) => Promise<PurchaseActionResult>;
  onSuccess?: () => void;
}

export const PurchaseFormModal: React.FC<PurchaseFormModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  products,
  onSavePurchase,
  onSuccess,
}) => {
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<PurchaseDraftItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clave de idempotencia única por sesión de formulario (se renueva al abrir)
  const idempotencyKeyRef = useRef<string>('');

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);
  const activeProducts = useMemo(() => products.filter((p) => p.isActive !== false), [products]);

  const totalAmount = useMemo(
    () => draftItems.reduce((acc, item) => acc + item.subtotal, 0),
    [draftItems]
  );

  useEffect(() => {
    if (isOpen) {
      setSupplierId('');
      setInvoiceNumber('');
      setPurchaseDate(localDateInputValue());
      setNotes('');
      setDraftItems([]);
      setSelectedProductId('');
      setErrorMsg(null);
      setIsSubmitting(false);
      idempotencyKeyRef.current = crypto.randomUUID();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleAddProduct = () => {
    if (!selectedProductId) return;
    const prod = activeProducts.find((p) => p.id === selectedProductId);
    if (!prod) return;

    if (draftItems.some((it) => it.productId === prod.id)) {
      setErrorMsg(`El producto "${prod.name}" ya está en la lista de compra.`);
      return;
    }

    const initialCost = prod.costPrice && prod.costPrice > 0 ? prod.costPrice : 0;
    const initialQty = 1;
    const initialSubtotal = Math.round(initialQty * initialCost * 100) / 100;

    setDraftItems((prev) => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        sku: prod.sku,
        unit: prod.unit || 'unidad',
        quantity: initialQty,
        unitCost: initialCost,
        subtotal: initialSubtotal,
      },
    ]);
    setSelectedProductId('');
    setErrorMsg(null);
  };

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const subtotal = Math.round(quantity * item.unitCost * 100) / 100;
        return { ...item, quantity, subtotal };
      })
    );
  };

  const handleUpdateUnitCost = (productId: string, unitCost: number) => {
    setDraftItems((prev) =>
      prev.map((item) => {
        if (item.productId !== productId) return item;
        const subtotal = Math.round(item.quantity * unitCost * 100) / 100;
        return { ...item, unitCost, subtotal };
      })
    );
  };

  const handleRemoveItem = (productId: string) => {
    setDraftItems((prev) => prev.filter((it) => it.productId !== productId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!supplierId) {
      setErrorMsg('Debe seleccionar un proveedor activo.');
      return;
    }

    if (draftItems.length === 0) {
      setErrorMsg('Debe agregar al menos un producto a la compra.');
      return;
    }

    // Validar cantidades y costos
    for (const item of draftItems) {
      if (item.quantity <= 0) {
        setErrorMsg(`La cantidad para "${item.productName}" debe ser mayor a 0.`);
        return;
      }
      const isIndivisible = ['unidad', 'bulto', 'par'].includes(item.unit.toLowerCase());
      if (isIndivisible && !Number.isInteger(item.quantity)) {
        setErrorMsg(`El producto "${item.productName}" se mide en ${item.unit} y no admite cantidades fraccionadas.`);
        return;
      }
      if (item.unitCost < 0) {
        setErrorMsg(`El costo unitario para "${item.productName}" no puede ser negativo.`);
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const res = await onSavePurchase({
        supplierId,
        invoiceNumber: invoiceNumber.trim() || undefined,
        purchaseDate: purchaseDate || undefined,
        notes: notes.trim() || undefined,
        items: draftItems.map((it) => ({
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
        })),
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (res.success) {
        onSuccess?.();
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al procesar la compra.');
      }
    } catch {
      setErrorMsg('Error de comunicación con el servidor al registrar la compra.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="fixed inset-0 -z-10" onClick={() => !isSubmitting && onClose()} aria-hidden="true" />
      <div
        className="relative w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[92vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShoppingCart size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">Registrar Compra a Proveedor</h2>
              <p className="text-[11px] text-text-muted">Ingreso formal de stock con costos congelados</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">
                Proveedor <span className="text-danger">*</span>
              </label>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              >
                <option value="">Seleccione un proveedor...</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.taxId ? `(CUIT: ${s.taxId})` : ''}
                  </option>
                ))}
              </select>
              {activeSuppliers.length === 0 && (
                <p className="mt-1 text-[11px] text-warning">
                  No hay proveedores activos. Creá uno en la sección Proveedores para poder registrar compras.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Fecha de Compra</label>
              <Input
                type="date"
                value={purchaseDate}
                max={localDateInputValue()}
                onChange={(e) => setPurchaseDate(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-secondary mb-1">Nro. Factura / Remito</label>
              <Input
                placeholder="Ej. FC-0001-00004523"
                value={invoiceNumber}
                maxLength={100}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1.5">Agregar Productos</label>
            <div className="flex gap-2">
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
              >
                <option value="">Seleccionar producto para ingresar...</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (SKU: {p.sku}) — Stock actual: {p.stock} {p.unit || 'u'}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddProduct}
                disabled={!selectedProductId || isSubmitting}
                className="flex items-center gap-1.5 shrink-0"
              >
                <Plus size={14} /> Agregar
              </Button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-text-secondary">
                Líneas de Compra ({draftItems.length})
              </span>
              <span className="text-xs text-text-muted">Cantidades y costos de reposición</span>
            </div>
            <PurchaseDraftTable
              items={draftItems}
              onUpdateQuantity={handleUpdateQuantity}
              onUpdateUnitCost={handleUpdateUnitCost}
              onRemoveItem={handleRemoveItem}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-secondary mb-1">Observaciones / Notas</label>
            <textarea
              value={notes}
              maxLength={1000}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre entrega, pago acordado o remito..."
              rows={2}
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 resize-none"
            />
          </div>
        </form>

        <div className="shrink-0 p-4 sm:p-5 border-t border-border bg-surface-2/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-text-muted block">Total a Pagar / Asentar</span>
            <span className="text-lg font-bold text-primary font-mono">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || draftItems.length === 0}
              className="flex items-center gap-1.5"
            >
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
              <span>{isSubmitting ? 'Registrando...' : 'Confirmar Compra'}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
