import React, { useState, useRef, useEffect } from 'react';
import { Company } from '@/types';
import { ChevronDown, Check, Building2, Store, Plus, KeyRound } from 'lucide-react';
import { OnboardingModal } from '@/features/companies/components/OnboardingModal';

interface TenantSwitcherProps {
  companies: Company[];
  activeCompany: Company;
  onSelectCompany: (company: Company) => void;
}

export const TenantSwitcher: React.FC<TenantSwitcherProps> = ({
  companies,
  activeCompany,
  onSelectCompany,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialTab, setModalInitialTab] = useState<'create' | 'join'>('create');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-surface-2/80 hover:bg-surface-2 border border-border/80 hover:border-border transition-all text-left group focus:outline-none focus:ring-1 focus:ring-primary/40"
        title="Cambiar empresa activa"
      >
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-primary/30 to-accent/30 border border-primary/30 flex items-center justify-center text-xs font-bold text-accent shadow-inner">
          {activeCompany.initials}
        </div>
        <div className="flex flex-col min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-text-primary truncate max-w-[170px]">
              {activeCompany.name}
            </span>
            {activeCompany.plan && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-surface-3 text-text-muted border border-border/50">
                {activeCompany.plan}
              </span>
            )}
            {activeCompany.role && (
              <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                activeCompany.role === 'master_admin'
                  ? 'bg-primary/20 text-primary-light border-primary/40'
                  : 'bg-surface-3 text-text-muted border-border/50'
              }`}>
                {activeCompany.role === 'master_admin' ? 'Admin' : 'Empleado'}
              </span>
            )}
          </div>
          <span className="text-[11px] text-text-muted truncate max-w-[170px]">
            {activeCompany.cuit ? `CUIT ${activeCompany.cuit}` : 'Sin CUIT'}
          </span>
        </div>
        <ChevronDown
          size={14}
          className={`text-text-muted group-hover:text-text-primary transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1.5 w-72 rounded-xl bg-surface border border-border shadow-2xl shadow-black/60 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="px-3 py-2 bg-surface-2/60 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
              <Store size={12} className="text-primary" />
              Empresas disponibles
            </span>
            <span className="text-[10px] font-mono text-text-muted">Multiempresa</span>
          </div>

          <div className="p-1.5 space-y-1">
            {companies.map((c) => {
              const isSelected = c.id === activeCompany.id;
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelectCompany(c);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-colors ${
                    isSelected
                      ? 'bg-primary/10 border border-primary/30 text-text-primary'
                      : 'hover:bg-surface-2 text-text-secondary hover:text-text-primary border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold border ${
                        isSelected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface-2 text-text-secondary border-border'
                      }`}
                    >
                      {c.initials}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-text-primary truncate">
                          {c.name}
                        </span>
                        {c.role && (
                          <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-surface-3 text-text-muted border border-border/40">
                            {c.role === 'master_admin' ? 'Admin' : 'Emp'}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-text-muted truncate">
                        {c.industry ? `${c.industry} • ` : ''}CUIT {c.cuit || 'Sin CUIT'}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check size={14} className="text-primary shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>

          <div className="p-1.5 border-t border-border/70 space-y-1">
            <button
              onClick={() => {
                setModalInitialTab('create');
                setIsOpen(false);
                setIsModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary bg-surface-2 hover:bg-surface-3 border border-border/70 hover:border-border transition-colors"
            >
              <Plus size={13} className="text-primary" />
              <span>Crear nueva empresa</span>
            </button>
            <button
              onClick={() => {
                setModalInitialTab('join');
                setIsOpen(false);
                setIsModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-medium text-accent hover:text-white bg-accent/10 hover:bg-accent/20 border border-accent/20 hover:border-accent/40 transition-colors"
            >
              <KeyRound size={13} />
              <span>Aceptar invitación</span>
            </button>
          </div>

          <div className="p-2 border-t border-border bg-surface-2/30">
            <div className="text-[11px] text-text-muted flex items-center gap-1.5">
              <Building2 size={12} className="text-accent" />
              <span>Cada empresa ve solo sus propios datos.</span>
            </div>
          </div>
        </div>
      )}

      <OnboardingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialTab={modalInitialTab}
      />
    </div>
  );
};
