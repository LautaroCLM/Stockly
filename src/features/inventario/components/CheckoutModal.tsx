import React, { useState, useEffect } from 'react';
import { PaymentEntry, PaymentMethod } from '../types';
import type { Customer } from '@/features/clientes/types';
import { formatCurrency } from '@/lib/formatters';
import { Button } from '@/components/ui/Button';
import { CustomerSelector } from './CustomerSelector';
import {
  LucideIcon,
  X,
  CreditCard,
  Banknote,
  Building,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Receipt,
} from 'lucide-react';

interface CheckoutModalProps {
  isOpen: boolean;
  total: number;
  customers?: Customer[];
  onClose: () => void;
  onConfirmSale: (
    clientName: string,
    payments: PaymentEntry[],
    customerId?: string | null
  ) => { success: boolean; error?: string } | Promise<{ success: boolean; error?: string }> | void;
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: LucideIcon }[] = [
  { id: 'efectivo', label: 'Efectivo', icon: Banknote },
  { id: 'transferencia', label: 'Transferencia', icon: Building },
  { id: 'debito', label: 'Tarjeta Débito', icon: CreditCard },
  { id: 'credito', label: 'Tarjeta Crédito', icon: CreditCard },
  { id: 'cheque', label: 'Cheque', icon: Receipt },
];

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  isOpen,
  total,
  customers = [],
  onClose,
  onConfirmSale,
}) => {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [clientName, setClientName] = useState('Consumidor Final');
  const [paymentMode, setPaymentMode] = useState<'single' | 'split'>('single');

  // Single payment state
  const [singleMethod, setSingleMethod] = useState<PaymentMethod>('efectivo');
  const [cashReceived, setCashReceived] = useState<string>(total.toString());

  // Split payments state
  const [splits, setSplits] = useState<PaymentEntry[]>([
    { id: 'split-1', method: 'efectivo', amount: total },
  ]);

  // Submission lock to avoid double submit
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync default cash received when total changes
  useEffect(() => {
    setCashReceived(total.toString());
    setSplits([{ id: 'split-1', method: 'efectivo', amount: total }]);
    setErrorMessage(null);
    setIsSubmitting(false);
    setSelectedCustomer(null);
    setClientName('Consumidor Final');
  }, [total, isOpen]);

  // Handle escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  // Single mode cash calculations
  const parsedCashReceived = parseFloat(cashReceived) || 0;
  const cashChange = singleMethod === 'efectivo' ? Math.max(0, parsedCashReceived - total) : 0;
  const cashInsufficient = singleMethod === 'efectivo' && parsedCashReceived < total;

  // Split mode calculations
  const totalAssignedSplits = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const splitDifference = total - totalAssignedSplits;
  const isSplitExact = Math.abs(splitDifference) < 0.01;

  function handleAddSplit() {
    const nextAmount = Math.max(0, splitDifference);
    const newEntry: PaymentEntry = {
      id: `split-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      method: 'transferencia',
      amount: nextAmount,
    };
    setSplits([...splits, newEntry]);
  }

  function handleRemoveSplit(id: string) {
    if (splits.length <= 1) return;
    setSplits(splits.filter((s) => s.id !== id));
  }

  function handleUpdateSplit(id: string, updates: Partial<PaymentEntry>) {
    setSplits(
      splits.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function handleSubmit() {
    if (isSubmitting) return;
    setErrorMessage(null);

    let finalPayments: PaymentEntry[] = [];

    if (paymentMode === 'single') {
      if (singleMethod === 'efectivo' && parsedCashReceived < total) {
        setErrorMessage('El efectivo entregado es menor al total a pagar.');
        return;
      }

      finalPayments = [
        {
          id: 'pay-single-1',
          method: singleMethod,
          amount: total,
          cashReceived: singleMethod === 'efectivo' ? parsedCashReceived : undefined,
          cashChange: singleMethod === 'efectivo' ? cashChange : undefined,
        },
      ];
    } else {
      // Validate split
      if (!isSplitExact) {
        setErrorMessage(
          splitDifference > 0
            ? `Resta cubrir ${formatCurrency(splitDifference)} para completar el total.`
            : `La suma de pagos excede el total por ${formatCurrency(Math.abs(splitDifference))}.`
        );
        return;
      }

      const hasInvalidAmount = splits.some((s) => isNaN(s.amount) || s.amount <= 0);
      if (hasInvalidAmount) {
        setErrorMessage('Todos los medios de pago deben tener un importe mayor a cero.');
        return;
      }

      finalPayments = splits;
    }

    // Atomic lock
    setIsSubmitting(true);
    try {
      const finalClientName = selectedCustomer ? selectedCustomer.name : (clientName.trim() || 'Consumidor Final');
      const finalCustomerId = selectedCustomer ? selectedCustomer.id : null;
      const result = onConfirmSale(finalClientName, finalPayments, finalCustomerId);

      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<{ success: boolean; error?: string }>)
          .then((res) => {
            if (res && !res.success) {
              setIsSubmitting(false);
              setErrorMessage(res.error || 'Ocurrió un error al procesar la venta.');
            }
          })
          .catch((err) => {
            setIsSubmitting(false);
            setErrorMessage(err instanceof Error ? err.message : 'Error inesperado al procesar la venta.');
          });
      } else if (result && !(result as { success: boolean }).success) {
        setIsSubmitting(false);
        setErrorMessage((result as { error?: string }).error || 'Ocurrió un error al procesar la venta.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setErrorMessage(err instanceof Error ? err.message : 'Ocurrió un error al procesar la venta.');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={() => !isSubmitting && onClose()}
      />

      <div className="relative w-full max-w-xl bg-surface border border-border rounded-2xl shadow-2xl shadow-black/90 z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary">
              <Banknote size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-primary">
                Finalizar Venta y Cobro
              </h2>
              <span className="text-xs text-text-muted">
                Total a cobrar: <strong className="text-primary font-bold">{formatCurrency(total)}</strong>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Customer Selector */}
          <CustomerSelector
            customers={customers}
            selectedCustomerId={selectedCustomer ? selectedCustomer.id : null}
            onSelectCustomer={(c) => {
              setSelectedCustomer(c);
              setClientName(c ? c.name : 'Consumidor Final');
            }}
            disabled={isSubmitting}
          />

          {/* Payment Mode Selector */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-text-secondary">
              Modalidad de Pago:
            </span>
            <div className="grid grid-cols-2 gap-2 bg-surface-2 p-1 rounded-xl border border-border">
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('single');
                  setErrorMessage(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  paymentMode === 'single'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Pago Único (1 medio)
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode('split');
                  setErrorMessage(null);
                }}
                className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                  paymentMode === 'split'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                Pago Dividido (Múltiples)
              </button>
            </div>
          </div>

          {/* Single Mode View */}
          {paymentMode === 'single' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PAYMENT_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const isSelected = singleMethod === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSingleMethod(opt.id)}
                      className={`p-3 rounded-xl border text-left flex flex-col gap-1.5 transition-all ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-text-primary shadow-sm'
                          : 'bg-surface-2 border-border/80 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="text-xs font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Cash received and change helper */}
              {singleMethod === 'efectivo' && (
                <div className="bg-surface-2 border border-border rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <label className="text-xs font-medium text-text-secondary">
                      Importe Recibido en Efectivo:
                    </label>
                    <div className="relative w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        className="w-full h-9 pl-7 pr-3 text-xs font-bold text-right bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary focus:outline-none tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Change or Warning */}
                  <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-text-muted">Vuelto a entregar al cliente:</span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        cashInsufficient ? 'text-danger' : 'text-emerald-400'
                      }`}
                    >
                      {cashInsufficient ? 'Faltan ' + formatCurrency(total - parsedCashReceived) : formatCurrency(cashChange)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Split Mode View */
            <div className="space-y-3">
              <div className="space-y-2">
                {splits.map((split, idx) => (
                  <div
                    key={split.id}
                    className="p-3 bg-surface-2 border border-border rounded-xl flex items-center gap-2"
                  >
                    <span className="text-[11px] font-mono text-text-muted w-5">
                      #{idx + 1}
                    </span>

                    {/* Method select */}
                    <select
                      value={split.method}
                      onChange={(e) =>
                        handleUpdateSplit(split.id, {
                          method: e.target.value as PaymentMethod,
                        })
                      }
                      className="h-8 px-2 text-xs bg-surface-3 border border-border rounded-lg text-text-primary focus:outline-none flex-1"
                    >
                      {PAYMENT_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Amount input */}
                    <div className="relative w-36">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={split.amount}
                        onChange={(e) =>
                          handleUpdateSplit(split.id, {
                            amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full h-8 pl-6 pr-2 text-xs font-semibold text-right bg-surface-3 border border-border rounded-lg text-text-primary focus:outline-none tabular-nums"
                      />
                    </div>

                    {/* Remove split button */}
                    <button
                      type="button"
                      disabled={splits.length <= 1}
                      onClick={() => handleRemoveSplit(split.id)}
                      className="p-1.5 text-text-muted hover:text-danger rounded disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add row button */}
              <button
                type="button"
                onClick={handleAddSplit}
                className="w-full py-2 border border-dashed border-border hover:border-primary/60 rounded-xl text-xs font-medium text-text-muted hover:text-text-primary flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={14} />
                <span>Agregar otro medio de pago</span>
              </button>

              {/* Split Summary Bar */}
              <div className="bg-surface-2/60 border border-border rounded-xl p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Total a cubrir:</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center justify-between text-text-secondary">
                  <span>Asignado en medios de pago:</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(totalAssignedSplits)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                  <span className="font-semibold text-text-primary">Diferencia:</span>
                  <span
                    className={`font-bold tabular-nums ${
                      isSplitExact
                        ? 'text-emerald-400'
                        : splitDifference > 0
                        ? 'text-amber-400'
                        : 'text-danger'
                    }`}
                  >
                    {isSplitExact
                      ? '✓ Cubierto 100%'
                      : splitDifference > 0
                      ? `Faltan ${formatCurrency(splitDifference)}`
                      : `Excede por ${formatCurrency(Math.abs(splitDifference))}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="bg-danger/10 border border-danger/30 rounded-xl p-3 flex items-start gap-2.5 text-danger text-xs">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 px-6 border-t border-border bg-surface-2/40 flex items-center justify-between gap-3">
          <Button
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            disabled={
              isSubmitting ||
              (paymentMode === 'split' && !isSplitExact) ||
              (paymentMode === 'single' && singleMethod === 'efectivo' && cashInsufficient)
            }
            className="shadow-lg shadow-primary/25 min-w-[170px]"
          >
            {isSubmitting ? (
              <span>Procesando...</span>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>Confirmar Venta</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
