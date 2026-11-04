import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Product, InitialStockBatchData, InitialStockResult } from '../types';
import { fetchProductsWithMovements } from '../api/initialStockApi';
import { InitialStockProductPicker } from './InitialStockProductPicker';
import { InitialStockBatchList, type BatchDraftItem } from './InitialStockBatchList';
import { Button } from '@/components/ui/Button';
import { X, PackagePlus, AlertTriangle, AlertCircle, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';

interface InitialStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  products: Product[];
  isMasterAdmin?: boolean;
  onSubmit: (data: InitialStockBatchData) => Promise<InitialStockResult>;
}

export const InitialStockModal: React.FC<InitialStockModalProps> = ({
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
  const [items, setItems] = useState<BatchDraftItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isUncertain, setIsUncertain] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ count: number; syncWarning?: string } | null>(null);

  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());
  const lastPayloadSerializedRef = useRef<string>('');

  const productMap = useMemo(() => {
    return new Map(products.map((p) => [p.id, p]));
  }, [products]);

  const selectedProductIds = useMemo(() => {
    return new Set(items.map((it) => it.productId));
  }, [items]);

  useEffect(() => {
    if (isOpen && companyId) {
      setIsCheckingEligibility(true);
      // Solo los productos en cero pueden recibir carga inicial: son los únicos a verificar
      const zeroStockIds = products.filter((p) => p.stock === 0).map((p) => p.id);
      fetchProductsWithMovements(companyId, zeroStockIds)
        .then((set) => {
          setProductsWithMovements(set);
        })
        .finally(() => {
          setIsCheckingEligibility(false);
        });
      // Reset form state on fresh modal open
      setItems([]);
      setSubmitError(null);
      setIsUncertain(false);
      setSuccessInfo(null);
      idempotencyKeyRef.current = crypto.randomUUID();
      lastPayloadSerializedRef.current = '';
    }
  }, [isOpen, companyId]);

  if (!isOpen) return null;

  const handleSelectProduct = (product: Product) => {
    if (selectedProductIds.has(product.id)) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    setIsUncertain(false);
    setSubmitError(null);
    setItems((prev) => [
      ...prev,
      {
        productId: product.id,
        quantity: '1',
        unitCost: product.costPrice != null ? String(product.costPrice) : '0',
      },
    ]);
  };

  const handleUpdateItem = (index: number, field: 'quantity' | 'unitCost', value: string) => {
    idempotencyKeyRef.current = crypto.randomUUID();
    setIsUncertain(false);
    setSubmitError(null);
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveItem = (index: number) => {
    idempotencyKeyRef.current = crypto.randomUUID();
    setIsUncertain(false);
    setSubmitError(null);
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!isMasterAdmin) {
      setSubmitError('Acceso denegado: solo el Administrador (master_admin) puede registrar la carga inicial.');
      return;
    }

    if (items.length === 0) {
      setSubmitError('Debe agregar al menos un producto al lote.');
      return;
    }

    // Validate inputs
    for (const item of items) {
      const prod = productMap.get(item.productId);
      const qty = parseFloat(item.quantity);
      const cost = parseFloat(item.unitCost);

      if (Number.isNaN(qty) || qty <= 0) {
        setSubmitError(`La cantidad para el producto "${prod?.name || item.productId}" debe ser mayor a cero.`);
        return;
      }

      if (prod && ['unidad', 'bulto', 'par'].includes(prod.unit) && !Number.isInteger(qty)) {
        setSubmitError(`El producto "${prod.name}" tiene unidad indivisible (${prod.unit}) y no admite decimales.`);
        return;
      }

      if (Number.isNaN(cost) || cost < 0) {
        setSubmitError(`El costo unitario para "${prod?.name || item.productId}" debe ser un número mayor o igual a cero.`);
        return;
      }
    }

    const payload = items.map((it) => ({
      productId: it.productId,
      quantity: parseFloat(it.quantity),
      unitCost: parseFloat(it.unitCost),
    }));

    const currentPayloadSerialized = JSON.stringify(payload);
    if (currentPayloadSerialized !== lastPayloadSerializedRef.current && !isUncertain) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    lastPayloadSerializedRef.current = currentPayloadSerialized;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await onSubmit({
        idempotencyKey: idempotencyKeyRef.current,
        items: payload,
      });

      if (result.success) {
        setSuccessInfo({
          count: result.itemsCount,
          syncWarning: result.syncWarning,
        });
      } else {
        setSubmitError(result.error || 'Error al ejecutar la carga inicial.');
        if (result.status === 'uncertain') {
          setIsUncertain(true);
        }
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Error inesperado durante la carga inicial.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={() => {
          if (!isSubmitting) onClose();
        }}
      />

      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary">
              <PackagePlus size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-text-primary">
                  Carga Inicial de Inventario
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-surface-2 text-text-muted border border-border">
                  {companyName}
                </span>
              </div>
              <p className="text-xs text-text-muted mt-0.5">
                Apertura atómica de existencias y costos unitarios para productos nuevos sin movimientos previos.
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 w-8 p-0 text-text-muted hover:text-text-primary"
          >
            <X size={16} />
          </Button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Explanation Alert */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs text-text-secondary flex items-start gap-2.5">
            <AlertCircle size={16} className="text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-text-primary">Diferencia con ajustes ordinarios:</p>
              <p className="text-text-muted leading-relaxed">
                Esta función establece el saldo de apertura de cada producto.
                Solo admite productos con stock en 0 y sin historial previo. Si un producto ya posee movimientos registrados, debe regularizarse mediante <strong>Ajuste de Stock</strong>.
              </p>
            </div>
          </div>

          {/* Role Restriction Banner */}
          {!isMasterAdmin && (
            <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>Operación restringida: se requiere rol de Administrador (master_admin) para registrar carga inicial.</span>
            </div>
          )}

          {/* Success Banner */}
          {successInfo ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <CheckCircle2 size={16} />
                <span>Carga inicial confirmada con éxito ({successInfo.count} productos registrados)</span>
              </div>
              {successInfo.syncWarning && (
                <p className="text-amber-400 text-[11px]">{successInfo.syncWarning}</p>
              )}
              <div className="pt-2 flex justify-end">
                <Button variant="primary" size="sm" onClick={onClose}>
                  Cerrar
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Product Picker */}
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-2">
                  1. Seleccionar productos aptos del catálogo
                </label>
                <InitialStockProductPicker
                  products={products}
                  productsWithMovements={productsWithMovements}
                  selectedProductIds={selectedProductIds}
                  isCheckingEligibility={isCheckingEligibility}
                  onSelectProduct={handleSelectProduct}
                />
              </div>

              {/* Batch Items List */}
              <div className="pt-2 border-t border-border">
                <label className="block text-xs font-semibold text-text-primary mb-2">
                  2. Lote a importar (cantidades y costos unitarios)
                </label>
                <InitialStockBatchList
                  items={items}
                  productMap={productMap}
                  onUpdateItem={handleUpdateItem}
                  onRemoveItem={handleRemoveItem}
                />
              </div>

              {/* Error Alert */}
              {submitError && (
                <div className="p-3 bg-danger/10 border border-danger/30 rounded-xl text-xs text-danger flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle size={15} className="shrink-0" />
                    <span>{submitError}</span>
                  </div>
                  {isUncertain && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                      className="h-7 text-xs border-danger/40 text-danger hover:bg-danger/20 shrink-0 gap-1.5"
                    >
                      <RotateCcw size={13} />
                      Reintentar misma clave
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!successInfo && (
          <div className="p-4 px-6 border-t border-border flex items-center justify-between bg-surface-2/40">
            <span className="text-[11px] text-text-muted">
              {items.length > 0 ? `${items.length} producto(s) en lote` : 'Sin productos'}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="md"
                disabled={isSubmitting || items.length === 0 || !isMasterAdmin}
                onClick={handleSubmit}
                className="gap-2 shadow-lg shadow-primary/20"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <span>Confirmar Carga Inicial</span>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
