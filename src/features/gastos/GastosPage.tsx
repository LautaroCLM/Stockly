import React, { useState } from 'react';
import { AlertTriangle, Loader2, Plus, ReceiptText, RotateCcw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Company } from '@/types';
import type { Supplier } from '@/features/proveedores/types';
import { useExpenses } from './hooks/useExpenses';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from './types';
import type { Expense, ExpenseCategory } from './types';
import { ExpensesTable } from './components/ExpensesTable';
import { ExpenseFormModal } from './components/ExpenseFormModal';
import { VoidExpenseModal } from './components/VoidExpenseModal';

interface GastosPageProps {
  company: Company;
  isMasterAdmin: boolean;
  suppliers: Supplier[];
}

/** Gastos de la empresa: registrar, filtrar por categoría y anular con motivo. */
export const GastosPage: React.FC<GastosPageProps> = ({ company, isMasterAdmin, suppliers }) => {
  const exp = useExpenses(company.id, isMasterAdmin);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [voiding, setVoiding] = useState<Expense | null>(null);

  if (!isMasterAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center gap-2 text-text-muted">
        <ShieldAlert size={32} className="text-warning" />
        <p className="text-sm font-semibold text-text-primary">Solo los administradores gestionan los gastos</p>
      </div>
    );
  }

  const hasFilters = exp.filters.category !== 'all' || exp.filters.showVoided;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-2 border border-border flex items-center justify-center">
            <ReceiptText size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Gastos</h1>
            <p className="text-xs text-text-muted">Lo que {company.name} paga y no es mercadería. Las compras de mercadería están en Compras.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void exp.reload()} disabled={exp.isLoading} className="gap-1.5 h-9">
            <RotateCcw size={14} className={exp.isLoading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </Button>
          <Button variant="primary" size="sm" onClick={() => setIsFormOpen(true)} className="gap-1.5 h-9">
            <Plus size={14} />
            <span>Registrar gasto</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <select aria-label="Categoría" value={exp.filters.category}
          onChange={(e) => exp.setFilters({ ...exp.filters, category: e.target.value as 'all' | ExpenseCategory })}
          className="h-9 px-3 bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none cursor-pointer">
          <option value="all">Todas las categorías</option>
          {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-text-secondary cursor-pointer">
          <input type="checkbox" checked={exp.filters.showVoided}
            onChange={(e) => exp.setFilters({ ...exp.filters, showVoided: e.target.checked })} />
          Mostrar anulados
        </label>
        {!exp.isLoading && <span className="text-text-muted ml-auto">{exp.total} {exp.total === 1 ? 'gasto' : 'gastos'}</span>}
      </div>

      {exp.error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertTriangle size={14} />
          <span className="flex-1">{exp.error}</span>
          <Button variant="secondary" size="sm" onClick={() => void exp.reload()}>Reintentar</Button>
        </div>
      )}

      {exp.isLoading && exp.expenses.length === 0 ? (
        <p className="py-12 text-center text-xs text-text-muted">
          <Loader2 size={16} className="inline animate-spin mr-2 text-primary" />
          Cargando gastos...
        </p>
      ) : exp.expenses.length === 0 ? (
        !exp.error && (
          <p className="py-12 text-center text-xs text-text-muted">
            {hasFilters ? 'No hay gastos con estos filtros.' : 'Todavía no registraste gastos. Usá "Registrar gasto" para cargar el primero.'}
          </p>
        )
      ) : (
        <>
          <ExpensesTable expenses={exp.expenses} onVoid={setVoiding} />
          {exp.hasMore && (
            <div className="text-center">
              <Button variant="secondary" size="sm" onClick={() => void exp.loadMore()} disabled={exp.isLoadingMore}>
                {exp.isLoadingMore ? 'Cargando...' : 'Ver más'}
              </Button>
            </div>
          )}
        </>
      )}

      {isFormOpen && <ExpenseFormModal suppliers={suppliers} onClose={() => setIsFormOpen(false)} onSubmit={exp.createExpense} />}
      {voiding && <VoidExpenseModal expense={voiding} onClose={() => setVoiding(null)} onSubmit={exp.voidExpense} />}
    </div>
  );
};
