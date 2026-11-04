import React, { useMemo } from 'react';
import type {
  Category,
  InitialStockBatchData,
  InitialStockResult,
  Product,
  ProductFormData,
  StockAdjustmentData,
  StockAdjustmentResult,
} from '../types';
import { ProductFormModal } from './ProductFormModal';
import { StockAdjustmentModal } from './StockAdjustmentModal';
import { InitialStockModal } from './InitialStockModal';
import { ConfirmDeactivateModal } from './ConfirmDeactivateModal';
import { CategoryManagementModal } from './CategoryManagementModal';

type SimpleResult = { success: boolean; error?: string };
type CategoryResult = { success: boolean; error?: string; category?: Category };

/** Qué diálogo de Inventario está abierto (solo uno a la vez). */
export type InventoryDialog =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; product: Product }
  | { kind: 'adjust'; product: Product }
  | { kind: 'initialStock' }
  | { kind: 'deactivate'; product: Product }
  | { kind: 'categories' };

interface InventoryDialogsProps {
  dialog: InventoryDialog;
  onClose: () => void;
  company: { id: string; name: string };
  products: Product[];
  categories: Category[];
  isCategoriesLoading: boolean;
  categoriesError: string | null;
  isMasterAdmin: boolean;
  onCreateProduct: (data: ProductFormData) => Promise<SimpleResult> | SimpleResult;
  onUpdateProduct: (id: string, data: ProductFormData) => Promise<SimpleResult> | SimpleResult;
  onDeactivateProduct: (id: string) => Promise<SimpleResult> | SimpleResult;
  onAdjustStock: (data: StockAdjustmentData) => Promise<StockAdjustmentResult> | StockAdjustmentResult;
  onImportInitialStock?: (data: InitialStockBatchData) => Promise<InitialStockResult>;
  onCreateCategory: (name: string, description?: string) => Promise<CategoryResult>;
  onRenameCategory: (id: string, newName: string) => Promise<CategoryResult>;
  onDeleteCategory: (id: string, productCount: number) => Promise<SimpleResult>;
}

/** Diálogos de Inventario: alta y edición, ajuste, stock inicial, baja y categorías. */
export const InventoryDialogs: React.FC<InventoryDialogsProps> = (props) => {
  const { dialog, onClose, company, products, categories, isMasterAdmin } = props;
  const isForm = dialog.kind === 'create' || dialog.kind === 'edit';
  const editedProduct = dialog.kind === 'edit' ? dialog.product : null;
  // Lista estable: el formulario se reinicia si cambia, y no debe borrar lo que se está escribiendo
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);

  const submitProduct = async (formData: ProductFormData) => {
    const categoryId = categories.find((c) => c.name.toLowerCase() === formData.category.trim().toLowerCase())?.id;
    const payload = { ...formData, categoryId };
    if (dialog.kind === 'create') return await props.onCreateProduct(payload);
    if (editedProduct) return await props.onUpdateProduct(editedProduct.id, payload);
    return { success: false, error: 'Operación no válida' };
  };

  return (
    <>
      <ProductFormModal
        isOpen={isForm}
        mode={dialog.kind === 'edit' ? 'edit' : 'create'}
        initialProduct={editedProduct}
        existingCategories={categoryNames}
        canManageCosts={isMasterAdmin}
        onClose={onClose}
        onSubmit={submitProduct}
      />

      <StockAdjustmentModal
        isOpen={dialog.kind === 'adjust'}
        product={dialog.kind === 'adjust' ? dialog.product : null}
        onClose={onClose}
        onSubmit={props.onAdjustStock}
      />

      {props.onImportInitialStock && (
        <InitialStockModal
          isOpen={dialog.kind === 'initialStock'}
          onClose={onClose}
          companyId={company.id}
          companyName={company.name}
          products={products}
          isMasterAdmin={isMasterAdmin}
          onSubmit={props.onImportInitialStock}
        />
      )}

      <ConfirmDeactivateModal
        isOpen={dialog.kind === 'deactivate'}
        product={dialog.kind === 'deactivate' ? dialog.product : null}
        onClose={onClose}
        onConfirm={async () => {
          if (dialog.kind === 'deactivate') {
            await props.onDeactivateProduct(dialog.product.id);
            onClose();
          }
        }}
      />

      <CategoryManagementModal
        isOpen={dialog.kind === 'categories'}
        companyName={company.name}
        categories={categories}
        products={products}
        isLoading={props.isCategoriesLoading}
        error={props.categoriesError}
        onClose={onClose}
        onCreateCategory={props.onCreateCategory}
        onRenameCategory={props.onRenameCategory}
        onDeleteCategory={props.onDeleteCategory}
      />
    </>
  );
};
