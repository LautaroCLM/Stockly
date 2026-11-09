import React, { useState, useEffect } from 'react';
import { AlertCircle, Banknote, CheckCircle2, X } from 'lucide-react';
import type { Customer } from '@/features/clientes/types';
import { formatCurrency } from '@/lib/formatters';
import { toUserMessage } from '@/lib/errorMessages';
import { Button } from '@/components/ui/Button';
import type { PaymentEntry, PaymentMethod } from '../types';
import { buildSinglePayment, buildSplitPayments, singlePaymentSummary, splitPaymentSummary } from '../checkoutPayments';
import { CustomerSelector } from './CustomerSelector';
import { SinglePaymentPanel, SplitPaymentPanel } from './PaymentPanels';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { AnimatePresence } from 'motion/react';

type SaleResult = { success: boolean; error?: string };

interface CheckoutModalProps {
  isOpen: boolean;
  total: number;
  customers?: Customer[];
  onClose: () => void;
  onConfirmSale: (clientName: string, payments: PaymentEntry[], customerId?: string | null) => SaleResult | Promise<SaleResult> | void;
}

const MODE_BUTTON = 'py-2 text-xs font-semibold rounded-lg transition-all';

/** Cobro de la venta: cliente, medio de pago (único o dividido) y confirmación. */
const CheckoutModalBody: React.FC<CheckoutModalProps> = ({ isOpen, total, customers = [], onClose, onConfirmSale }) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [clientName, setClientName] = useState('Consumidor Final');
  const [paymentMode, setPaymentMode] = useState<'single' | 'split'>('single');
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>('efectivo');
  const [cashReceived, setCashReceived] = useState<string>(total.toString());
  const [splits, setSplits] = useState<PaymentEntry[]>([{ id: 'split-1', method: 'efectivo', amount: total }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cada apertura (o cambio de total) arranca un cobro limpio
  useEffect(() => {
    setCashReceived(total.toString());
    setSplits([{ id: 'split-1', method: 'efectivo', amount: total }]);
    setErrorMessage(null);
    setIsSubmitting(false);
    setSelectedCustomer(null);
    setClientName('Consumidor Final');
  }, [total, isOpen]);

  // Sin cliente no hay cuenta corriente: si ya estaba elegida, vuelve a efectivo
  useEffect(() => {
    if (selectedCustomer) return;
    setSingleMethod((m) => (m === 'cuenta_corriente' ? 'efectivo' : m));
    setSplits((prev) => prev.map((p) => (p.method === 'cuenta_corriente' ? { ...p, method: 'efectivo' } : p)));
  }, [selectedCustomer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const cashInsufficient = singlePaymentSummary(total, singleMethod, cashReceived).cashInsufficient;
  const splitSummary = splitPaymentSummary(total, splits);

  const switchMode = (mode: 'single' | 'split') => {
    setPaymentMode(mode);
    setErrorMessage(null);
  };

  const fail = (message: string) => {
    setIsSubmitting(false);
    setErrorMessage(message);
  };

  const handleSubmit = () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    const built =
      paymentMode === 'single' ? buildSinglePayment(total, singleMethod, cashReceived) : buildSplitPayments(total, splits);
    if (!built.ok) {
      setErrorMessage(built.error);
      return;
    }

    setIsSubmitting(true);
    try {
      const name = selectedCustomer ? selectedCustomer.name : clientName.trim() || 'Consumidor Final';
      const result = onConfirmSale(name, built.payments, selectedCustomer ? selectedCustomer.id : null);
      if (result && typeof (result as Promise<SaleResult>).then === 'function') {
        (result as Promise<SaleResult>)
          .then((res) => {
            if (res && !res.success) fail(res.error || 'Ocurrió un error al procesar la venta.');
          })
          .catch((err) => fail(toUserMessage(err, 'Error inesperado al procesar la venta.')));
      } else if (result && !(result as SaleResult).success) {
        fail((result as SaleResult).error || 'Ocurrió un error al procesar la venta.');
      }
    } catch (err) {
      fail(toUserMessage(err, 'Ocurrió un error al procesar la venta.'));
    }
  };

  return (
    <ModalFrame ariaLabel="Finalizar venta y cobro" onBackdropClick={() => !isSubmitting && onClose()} panelClassName="max-w-xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
            <Banknote size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Finalizar Venta y Cobro</h2>
            <span className="text-xs text-text-muted">
              Total a cobrar: <strong className="text-primary font-bold">{formatCurrency(total)}</strong>
            </span>
          </div>
        </div>
        <button onClick={onClose} disabled={isSubmitting} aria-label="Cerrar"
          className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50">
          <X size={18} />
        </button>
      </div>

      <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
        <CustomerSelector
          customers={customers}
          selectedCustomerId={selectedCustomer ? selectedCustomer.id : null}
          onSelectCustomer={(c) => {
            setSelectedCustomer(c);
            setClientName(c ? c.name : 'Consumidor Final');
          }}
          disabled={isSubmitting}
        />

        <div className="space-y-2">
          <span className="text-xs font-semibold text-text-secondary">Modalidad de Pago:</span>
          <div className="grid grid-cols-2 gap-2 bg-surface-2 p-1 rounded-xl border border-border">
            {(['single', 'split'] as const).map((mode) => (
              <button key={mode} type="button" onClick={() => switchMode(mode)}
                className={`${MODE_BUTTON} ${paymentMode === mode ? 'bg-primary text-white shadow-sm' : 'text-text-muted hover:text-text-primary'}`}>
                {mode === 'single' ? 'Pago Único (1 medio)' : 'Pago Dividido (Múltiples)'}
              </button>
            ))}
          </div>
        </div>

        {paymentMode === 'single' ? (
          <SinglePaymentPanel allowCreditAccount={Boolean(selectedCustomer)} total={total} method={singleMethod} cashReceived={cashReceived}
            onMethodChange={setSingleMethod} onCashReceivedChange={setCashReceived} />
        ) : (
          <SplitPaymentPanel
            allowCreditAccount={Boolean(selectedCustomer)}
            total={total}
            splits={splits}
            onAdd={() =>
              setSplits((prev) => [
                ...prev,
                { id: `split-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, method: 'transferencia', amount: splitSummary.remaining },
              ])
            }
            onRemove={(id) => setSplits((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)))}
            onUpdate={(id, updates) => setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)))}
          />
        )}

        {errorMessage && (
          <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      <div className="p-4 px-6 border-t border-border bg-surface-2/40 flex items-center justify-between gap-3">
        <Button variant="secondary" size="md" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
        <Button
          variant="primary"
          size="md"
          onClick={handleSubmit}
          disabled={isSubmitting || (paymentMode === 'split' && !splitSummary.isExact) || (paymentMode === 'single' && cashInsufficient)}
          className="shadow-lg shadow-primary/25 min-w-[170px]"
        >
          {isSubmitting ? <span>Procesando...</span> : (<><CheckCircle2 size={16} /><span>Confirmar Venta</span></>)}
        </Button>
      </div>
    </ModalFrame>
  );
};

/** Mientras `isOpen` es true se monta el contenido; al cerrarse, AnimatePresence deja terminar la animación de salida. */
export const CheckoutModal: React.FC<CheckoutModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <CheckoutModalBody {...props} />}</AnimatePresence>
);
