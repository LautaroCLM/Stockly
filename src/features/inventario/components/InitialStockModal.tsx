import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, PackagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { toUserMessage } from '@/lib/errorMessages';
import type { Product, InitialStockBatchData, InitialStockResult } from '../types';
import { fetchProductsWithMovements } from '../api/initialStockApi';
import { toBatchPayload, validateBatchDraft, type BatchDraftLine } from '../initialStockForm';
import { InitialStockProductPicker } from './InitialStockProductPicker';
import { InitialStockBatchList } from './InitialStockBatchList';
import { InitialStockError, InitialStockExplanation, InitialStockRestricted, InitialStockSuccess } from './InitialStockNotices';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { AnimatePresence } from 'motion/react';

interface InitialStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  products: Product[];
  isMasterAdmin?: boolean;
  onSubmit: (data: InitialStockBatchData) => Promise<InitialStockResult>;
}

/** Carga inicial de existencias y costos para productos en cero y sin movimientos. */
const InitialStockModalBody: React.FC<InitialStockModalProps> = ({
  isOpen,
  onClose,
  companyId,
  companyName,
  products,
  isMasterAdmin = true,
  onSubmit,
}) => {
  const [productsWithMovements, setProductsWithMovements] = useState<Set<string>>(new Set());
  const [isCheckingEligibility, setIsCheckingEligibility] = useState(false);
  const [items, setItems] = useState<BatchDraftLine[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ count: number; syncWarning?: string } | null>(null);
  // Misma clave mientras el lote no cambie: reintentar tras un corte no duplica la carga
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const lastPayloadRef = useRef<string>('');

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedProductIds = useMemo(() => new Set(items.map((it) => it.productId)), [items]);

  useEffect(() => {
    if (!isOpen || !companyId) return;
    setIsCheckingEligibility(true);
    // Solo los productos en cero pueden recibir carga inicial: son los únicos a verificar
    const zeroStockIds = products.filter((p) => p.stock === 0).map((p) => p.id);
    fetchProductsWithMovements(companyId, zeroStockIds)
      .then(setProductsWithMovements)
      .finally(() => setIsCheckingEligibility(false));
    setItems([]);
    setSubmitError(null);
    setIsUncertain(false);
    setSuccessInfo(null);
    idempotencyKeyRef.current = crypto.randomUUID();
    lastPayloadRef.current = '';
    // Sin `products` en las dependencias a propósito: se evalúa al abrir y una recarga
    // en vivo del catálogo no debe reiniciar el lote que el usuario está armando.
  }, [isOpen, companyId]);

  if (!isOpen) return null;

  // Cualquier cambio del lote es una intención nueva: nueva clave
  const editBatch = (update: (prev: BatchDraftLine[]) => BatchDraftLine[]) => {
    idempotencyKeyRef.current = crypto.randomUUID();
    setIsUncertain(false);
    setSubmitError(null);
    setItems(update);
  };

  const handleSelectProduct = (product: Product) => {
    if (selectedProductIds.has(product.id)) return;
    editBatch((prev) => [
      ...prev,
      { productId: product.id, quantity: '1', unitCost: product.costPrice != null ? String(product.costPrice) : '0' },
    ]);
  };

  const handleSubmit = async () => {
    if (!isMasterAdmin) return setSubmitError('Acceso denegado: solo el Administrador puede registrar la carga inicial.');
    const invalid = validateBatchDraft(items, productMap);
    if (invalid) return setSubmitError(invalid);

    const payload = toBatchPayload(items);
    const serialized = JSON.stringify(payload);
    if (serialized !== lastPayloadRef.current && !isUncertain) idempotencyKeyRef.current = crypto.randomUUID();
    lastPayloadRef.current = serialized;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await onSubmit({ idempotencyKey: idempotencyKeyRef.current, items: payload });
      if (result.success) {
        setSuccessInfo({ count: result.itemsCount, syncWarning: result.syncWarning });
      } else {
        setSubmitError(result.error || 'Error al ejecutar la carga inicial.');
        if (result.status === 'uncertain') setIsUncertain(true);
      }
    } catch (err) {
      setSubmitError(toUserMessage(err, 'Error inesperado durante la carga inicial.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalFrame ariaLabel="Stock inicial" onBackdropClick={() => !isSubmitting && onClose()} panelClassName="max-w-2xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
            <PackagePlus size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-text-primary">Carga Inicial de Inventario</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">{companyName}</span>
            </div>
            <p className="text-xs text-text-muted mt-0.5">Existencias y costos de apertura para productos nuevos sin movimientos previos.</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting} aria-label="Cerrar" className="h-8 w-8 p-0 text-text-muted hover:text-text-primary">
          <X size={16} />
        </Button>
      </div>

      <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        <InitialStockExplanation />
        {!isMasterAdmin && <InitialStockRestricted />}
        {successInfo ? (
          <InitialStockSuccess count={successInfo.count} syncWarning={successInfo.syncWarning} onClose={onClose} />
        ) : (
          <>
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-2">1. Seleccionar productos aptos del catálogo</label>
              <InitialStockProductPicker products={products} productsWithMovements={productsWithMovements}
                selectedProductIds={selectedProductIds} isCheckingEligibility={isCheckingEligibility} onSelectProduct={handleSelectProduct} />
            </div>
            <div className="pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-text-primary mb-2">2. Lote a importar (cantidades y costos unitarios)</label>
              <InitialStockBatchList items={items} productMap={productMap}
                onUpdateItem={(index, field, value) =>
                  editBatch((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)))
                }
                onRemoveItem={(index) => editBatch((prev) => prev.filter((_, i) => i !== index))} />
            </div>
            {submitError && (
              <InitialStockError message={submitError} isUncertain={isUncertain} isBusy={isSubmitting} onRetry={() => void handleSubmit()} />
            )}
          </>
        )}
      </div>

      {!successInfo && (
        <div className="p-4 px-6 border-t border-border flex items-center justify-between bg-surface-2/40">
          <span className="text-[11px] text-text-muted">{items.length > 0 ? `${items.length} producto(s) en lote` : 'Sin productos'}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="button" variant="primary" size="md" disabled={isSubmitting || items.length === 0 || !isMasterAdmin}
              onClick={() => void handleSubmit()} className="gap-2 shadow-lg shadow-primary/20">
              {isSubmitting ? (<><Loader2 size={15} className="animate-spin" /><span>Registrando...</span></>) : <span>Confirmar Carga Inicial</span>}
            </Button>
          </div>
        </div>
      )}
    </ModalFrame>
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const InitialStockModal: React.FC<InitialStockModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <InitialStockModalBody {...props} />}</AnimatePresence>
);
