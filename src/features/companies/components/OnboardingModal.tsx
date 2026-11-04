import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Building2, KeyRound, X } from 'lucide-react';
import { CreateCompanyForm, JoinCompanyForm } from './OnboardingForms';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'create' | 'join';
}

type Tab = 'create' | 'join';

const TAB_CLASS = 'flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2';
const TAB_IDLE = 'text-text-muted hover:text-text-secondary hover:bg-surface/50 border border-transparent';

/** Crear una empresa nueva o sumarse a una existente con una invitación. */
export const OnboardingModal: React.FC<OnboardingModalProps> = ({ isOpen, onClose, initialTab = 'create' }) => {
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setActionError(null);
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const selectTab = (tab: Tab) => {
    setActiveTab(tab);
    setActionError(null);
  };
  const formProps = {
    isSubmitting,
    setSubmitting: setIsSubmitting,
    error: actionError,
    setError: setActionError,
    onDone: onClose,
    onCancel: onClose,
  };

  const modalContent = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150 overflow-y-auto">
      <div className="fixed inset-0 -z-10" onClick={() => !isSubmitting && onClose()} aria-hidden="true" />
      <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Building2 size={18} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-text-primary">Gestión Multiempresa</h2>
              <p className="text-[11px] text-text-muted">Crear una empresa o sumarte a una existente</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isSubmitting} title="Cerrar ventana"
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2 transition-colors disabled:opacity-50">
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 flex border-b border-border bg-surface-2/30 p-1.5 gap-1.5" role="tablist">
          <button type="button" role="tab" aria-selected={activeTab === 'create'} onClick={() => selectTab('create')} disabled={isSubmitting}
            className={`${TAB_CLASS} ${activeTab === 'create' ? 'bg-surface text-text-primary shadow-sm border border-border font-bold' : TAB_IDLE}`}>
            <Building2 size={14} className={activeTab === 'create' ? 'text-primary' : ''} />
            <span>Crear Empresa</span>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === 'join'} onClick={() => selectTab('join')} disabled={isSubmitting}
            className={`${TAB_CLASS} ${activeTab === 'join' ? 'bg-surface text-accent shadow-sm border border-border font-bold' : TAB_IDLE}`}>
            <KeyRound size={14} className={activeTab === 'join' ? 'text-accent' : ''} />
            <span>Aceptar Invitación</span>
          </button>
        </div>

        {actionError && (
          <div role="alert" className="shrink-0 mx-4 mt-3 -mb-1 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-2.5 text-danger text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <p className="leading-relaxed">{actionError}</p>
          </div>
        )}

        {activeTab === 'create' ? <CreateCompanyForm {...formProps} /> : <JoinCompanyForm {...formProps} />}
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
