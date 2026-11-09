import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingCart, X, FileText, Truck, Hash } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatDateShort } from '@/lib/formatters';
import { formatCuit } from '@/features/companies/utils/cuitValidator';
import type { Purchase } from '../types';
import { AnimatePresence, m } from 'motion/react';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';

interface PurchaseDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: Purchase | null;
}

const PurchaseDetailModalBody: React.FC<PurchaseDetailModalProps> = ({
  isOpen,
  onClose,
  purchase,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !purchase) return null;

  const items = purchase.items || [];

  const modalContent = (
    <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div
        className="fixed inset-0 -z-10"
        onClick={onClose}
        aria-hidden="true"
      />

      <m.div variants={modalPanelVariants}
        className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <ShoppingCart size={18} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold text-text-primary">
                  Compra {purchase.purchaseNumber}
                </h2>
                <Badge variant={purchase.status === 'completed' ? 'success' : 'danger'} size="sm">
                  {purchase.status === 'completed' ? 'Completada' : 'Cancelada'}
                </Badge>
              </div>
              <p className="text-[11px] text-text-muted">
                Registrada el {formatDateShort(purchase.purchaseDate || purchase.createdAt)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Info Grid */}
        <div className="p-4 sm:p-5 border-b border-border/60 bg-surface/50 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="flex items-start gap-2">
            <Truck size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <span className="text-text-muted block text-[11px]">Proveedor:</span>
              <span className="font-semibold text-text-primary">
                {purchase.supplier?.name || 'Proveedor no disponible'}
              </span>
              {purchase.supplier?.taxId && (
                <span className="text-[11px] text-text-muted block">
                  CUIT: {formatCuit(purchase.supplier.taxId)}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <FileText size={16} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <span className="text-text-muted block text-[11px]">Comprobante / Factura:</span>
              <span className="font-semibold text-text-primary font-mono">
                {purchase.invoiceNumber || 'Sin número de factura'}
              </span>
            </div>
          </div>

          {purchase.notes && (
            <div className="sm:col-span-2 bg-surface-2/40 p-2.5 rounded-lg border border-border/50 text-[11px] text-text-secondary">
              <span className="font-semibold text-text-primary">Notas: </span>
              {purchase.notes}
            </div>
          )}
        </div>

        {/* Table of items */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <Hash size={14} /> Detalle de Productos Comprados ({items.length})
          </h3>

          <div className="border border-border rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2/70 border-b border-border text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Producto</th>
                  <th className="py-2.5 px-3 text-right">Cantidad</th>
                  <th className="py-2.5 px-3 text-right">Costo Unit.</th>
                  <th className="py-2.5 px-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-text-muted">
                      No se encontraron líneas asociadas a esta compra.
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-surface-2/30 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-medium text-text-primary">
                          {item.product?.name || 'Producto'}
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">
                          SKU: {item.product?.sku || 'N/A'}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-medium text-text-primary whitespace-nowrap">
                        {item.quantity} {item.product?.unit || 'u'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-text-secondary font-mono whitespace-nowrap">
                        {formatCurrency(item.unitCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-text-primary font-mono whitespace-nowrap">
                        {formatCurrency(item.subtotal)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with totals */}
        <div className="shrink-0 p-4 sm:p-5 border-t border-border bg-surface-2/40 flex items-center justify-between">
          <div>
            <span className="text-[11px] text-text-muted block">Total de la Compra</span>
            <span className="text-lg font-bold text-primary font-mono">
              {formatCurrency(purchase.totalAmount)}
            </span>
          </div>
          <Button variant="secondary" onClick={onClose} size="sm">
            Cerrar
          </Button>
        </div>
      </m.div>
    </m.div>
  );

  return createPortal(modalContent, document.body);
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <PurchaseDetailModalBody {...props} />}</AnimatePresence>
);
