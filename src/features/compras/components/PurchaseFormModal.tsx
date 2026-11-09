import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, ShoppingCart, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatCurrency } from '@/lib/formatters';
import { localDateInputValue } from '@/lib/localDate';
import type { Supplier } from '@/features/proveedores/types';
import type { Product } from '@/features/inventario/types';
import type { CreatePurchaseInput, PurchaseActionResult, PurchaseDraftItem } from '../types';
import { draftTotal, newDraftItem, validatePurchaseDraft, withQuantity, withUnitCost } from '../purchaseDraft';
import { PurchaseDraftTable } from './PurchaseDraftTable';
import { ProductAdder, PurchaseHeaderFields } from './PurchaseFormFields';
import { AnimatePresence, m } from 'motion/react';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';

interface PurchaseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  products: Product[];
  onSavePurchase: (input: CreatePurchaseInput) => Promise<PurchaseActionResult>;
  onSuccess?: () => void;
}

/** Registro de una compra a proveedor: datos del comprobante, productos, cantidades y costos. */
const PurchaseFormModalBody: React.FC<PurchaseFormModalProps> = ({ isOpen, onClose, suppliers, products, onSavePurchase, onSuccess }) => {
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');
  const [draftItems, setDraftItems] = useState<PurchaseDraftItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Una clave por formulario abierto: reintentar no duplica la compra
  const idempotencyKeyRef = useRef<string>('');

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);
  const activeProducts = useMemo(() => products.filter((p) => p.isActive !== false), [products]);
  const totalAmount = useMemo(() => draftTotal(draftItems), [draftItems]);

  useEffect(() => {
    if (!isOpen) return;
    setSupplierId('');
    setInvoiceNumber('');
    setPurchaseDate(localDateInputValue());
    setNotes('');
    setDraftItems([]);
    setSelectedProductId('');
    setErrorMsg(null);
    setIsSubmitting(false);
    idempotencyKeyRef.current = crypto.randomUUID();
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

  const updateItem = (productId: string, update: (item: PurchaseDraftItem) => PurchaseDraftItem) =>
    setDraftItems((prev) => prev.map((item) => (item.productId === productId ? update(item) : item)));

  const handleAddProduct = () => {
    const prod = activeProducts.find((p) => p.id === selectedProductId);
    if (!prod) return;
    if (draftItems.some((it) => it.productId === prod.id)) {
      setErrorMsg(`El producto "${prod.name}" ya está en la lista de compra.`);
      return;
    }
    setDraftItems((prev) => [...prev, newDraftItem(prod)]);
    setSelectedProductId('');
    setErrorMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const invalid = validatePurchaseDraft(supplierId, draftItems);
    if (invalid) return setErrorMsg(invalid);

    try {
      setIsSubmitting(true);
      const res = await onSavePurchase({
        supplierId,
        invoiceNumber: invoiceNumber.trim() || undefined,
        purchaseDate: purchaseDate || undefined,
        notes: notes.trim() || undefined,
        items: draftItems.map((it) => ({ productId: it.productId, quantity: it.quantity, unitCost: it.unitCost })),
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
    <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="fixed inset-0 -z-10" onClick={() => !isSubmitting && onClose()} aria-hidden="true" />
      <m.div variants={modalPanelVariants} className="relative w-full max-w-3xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[92vh] my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
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
          <button type="button" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {errorMsg && (
            <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          <PurchaseHeaderFields suppliers={activeSuppliers} supplierId={supplierId} purchaseDate={purchaseDate}
            invoiceNumber={invoiceNumber} disabled={isSubmitting} onSupplierChange={setSupplierId}
            onDateChange={setPurchaseDate} onInvoiceChange={setInvoiceNumber} />
          <ProductAdder products={activeProducts} selectedProductId={selectedProductId} disabled={isSubmitting}
            onSelect={setSelectedProductId} onAdd={handleAddProduct} />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-text-secondary">Líneas de Compra ({draftItems.length})</span>
              <span className="text-xs text-text-muted">Cantidades y costos de reposición</span>
            </div>
            <PurchaseDraftTable items={draftItems} disabled={isSubmitting}
              onUpdateQuantity={(id, quantity) => updateItem(id, (item) => withQuantity(item, quantity))}
              onUpdateUnitCost={(id, unitCost) => updateItem(id, (item) => withUnitCost(item, unitCost))}
              onRemoveItem={(id) => setDraftItems((prev) => prev.filter((it) => it.productId !== id))} />
          </div>
          <div>
            <label htmlFor="purchase-notes" className="block text-xs font-semibold text-text-secondary mb-1">Observaciones / Notas</label>
            <textarea id="purchase-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Detalles sobre entrega, pago acordado o remito..." disabled={isSubmitting}
              className="w-full px-3 py-2 text-xs bg-surface border border-border rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50 resize-none" />
          </div>
        </form>

        <div className="shrink-0 p-4 sm:p-5 border-t border-border bg-surface-2/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-text-muted block">Total a Pagar / Asentar</span>
            <span className="text-lg font-bold text-primary font-mono">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isSubmitting} size="sm">Cancelar</Button>
            <Button type="submit" variant="primary" size="sm" onClick={handleSubmit} disabled={isSubmitting || draftItems.length === 0}
              className="flex items-center gap-1.5">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
              <span>{isSubmitting ? 'Registrando...' : 'Confirmar Compra'}</span>
            </Button>
          </div>
        </div>
      </m.div>
    </m.div>
  );

  return createPortal(modalContent, document.body);
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const PurchaseFormModal: React.FC<PurchaseFormModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <PurchaseFormModalBody {...props} />}</AnimatePresence>
);
