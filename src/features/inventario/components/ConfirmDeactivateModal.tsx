import React, { useEffect } from 'react';
import { Product } from '../types';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, X, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/formatters';
import { AnimatePresence, m } from 'motion/react';
import { modalPanelVariants, overlayVariants } from '@/lib/motion';

interface ConfirmDeactivateModalProps {
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmDeactivateModalBody: React.FC<ConfirmDeactivateModalProps> = ({
  isOpen,
  product,
  onClose,
  onConfirm,
}) => {
  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !product) return null;

  return (
    <m.div variants={overlayVariants} initial="hidden" animate="visible" exit="exit" className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="min-h-full flex items-center justify-center p-4">
        <m.div variants={modalPanelVariants} className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="p-4 px-5 border-b border-border flex items-center justify-between bg-surface-2/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-danger/10 border border-danger/30 flex items-center justify-center text-danger">
                <AlertTriangle size={17} />
              </div>
              <h2 className="text-sm font-bold text-text-primary">
                ¿Desactivar producto?
              </h2>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors"
              title="Cerrar (Escape)"
            >
              <X size={17} />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            {/* Product Card Summary */}
            <div className="bg-surface-2/70 border border-border/80 rounded-xl p-3 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-text-primary block line-clamp-1">
                    {product.name}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-[10px] text-text-muted">
                      SKU: {product.sku}
                    </span>
                    <span className="text-[10px] text-text-muted">•</span>
                    <span className="text-[10px] text-text-muted">
                      {product.category}
                    </span>
                  </div>
                </div>
                <span className="text-xs font-semibold text-text-primary tabular-nums shrink-0">
                  {formatCurrency(product.salePrice)}
                </span>
              </div>

              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[11px] text-text-secondary">
                <span>Stock actual en almacén:</span>
                <span className="font-mono font-semibold text-text-primary">
                  {product.stock} {product.unit}
                </span>
              </div>
            </div>

            {/* Explanation & Guarantees */}
            <div className="space-y-2.5 text-xs text-text-secondary">
              <p>
                Al desactivar este producto, sucederá lo siguiente:
              </p>

              <div className="space-y-2 bg-surface-3/40 border border-border/60 rounded-xl p-3 text-[11px]">
                <div className="flex items-start gap-2">
                  <ShieldAlert size={14} className="text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Ventas bloqueadas:</strong> No estará disponible para nuevas ventas ni se podrá agregar al carrito.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Historial preservado:</strong> El stock físico ({product.stock} {product.unit}), el libro mayor de movimientos y los comprobantes de ventas anteriores permanecen intactos.
                  </span>
                </div>

                <div className="flex items-start gap-2">
                  <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Reversible:</strong> Podrás reactivarlo en cualquier momento cambiando el filtro a &ldquo;Inactivos&rdquo;.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-4 px-5 border-t border-border bg-surface-2/40 flex items-center justify-end gap-2.5">
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
              className="text-xs"
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              size="md"
              onClick={onConfirm}
              className="text-xs gap-1.5 shadow-md shadow-danger/20"
            >
              <AlertTriangle size={14} />
              <span>Sí, desactivar producto</span>
            </Button>
          </div>
        </m.div>
      </div>
    </m.div>
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const ConfirmDeactivateModal: React.FC<ConfirmDeactivateModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <ConfirmDeactivateModalBody {...props} />}</AnimatePresence>
);
