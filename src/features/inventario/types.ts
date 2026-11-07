import { TenantId } from '@/types';

export type StockStatus = 'normal' | 'low' | 'out_of_stock' | 'negative';

export interface Category {
  id: string;
  companyId: TenantId;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  categoryId?: string;
  category: string;
  salePrice: number;
  costPrice: number | null;
  stock: number;
  minStock: number;
  unit: string;
  status: StockStatus;
  description?: string;
  isActive?: boolean;
}

export interface ProductFormData {
  name: string;
  sku: string;
  barcode: string;
  categoryId?: string;
  category: string;
  costPrice?: number | null;
  salePrice: number;
  minStock: number;
  unit?: string;
  description?: string;
}

export interface CartItem {
  productId: string;
  sku: string;
  name: string;
  unitPrice: number;
  quantity: number;
  subtotal: number;
  currentStock: number;
}

export interface CartState {
  items: CartItem[];
  discountPercent: number;
  subtotal: number;
  discountAmount: number;
  total: number;
}

export type PaymentMethod =
  | 'efectivo'
  | 'transferencia'
  | 'debito'
  | 'credito'
  | 'cheque'
  | 'cuenta_corriente';

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: number;
  cashReceived?: number;
  cashChange?: number;
  reference?: string;
}

export interface Sale {
  id: string;
  tenantId: TenantId;
  saleNumber: string;
  createdAt: string;
  clientName: string;
  customerId?: string | null;
  customerDoc?: string | null;
  items: CartItem[];
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  payments: PaymentEntry[];
  status: 'completada' | 'anulada';
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export type StockMovementDirection = 'increase' | 'decrease';

export type StockMovementReason =
  | 'initial_load'
  | 'purchase'
  | 'physical_count'
  | 'loss_damage'
  | 'internal_use'
  | 'sale'
  | 'cancellation'
  | 'purchase_cancellation';

export interface StockMovement {
  id: string;
  companyId: TenantId;
  productId: string;
  productName: string;
  productSku: string;
  direction: StockMovementDirection;
  reason: StockMovementReason;
  quantity: number;
  previousStock: number;
  newStock: number;
  referenceSaleId?: string;
  referenceDoc?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface StockAdjustmentData {
  productId: string;
  reason: StockMovementReason;
  direction: StockMovementDirection;
  quantity: number;
  /** Solo en conteo físico: cantidad contada; el servidor calcula la diferencia. */
  countedQuantity?: number;
  notes?: string;
  referenceDoc?: string;
  idempotencyKey?: string;
}

export type StockAdjustmentResult =
  | { success: true; status: 'confirmed_synced'; syncWarning?: undefined }
  | { success: true; status: 'confirmed_reload_pending'; syncWarning: string }
  | { success: false; status: 'uncertain'; error: string; uncertain: true }
  | { success: false; status: 'rejected'; error: string; uncertain?: false };

export interface InitialStockItemInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

export interface InitialStockBatchData {
  items: InitialStockItemInput[];
  idempotencyKey?: string;
}

export interface InitialStockMovementItem {
  productId: string;
  movementId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export type InitialStockResult =
  | { success: true; status: 'confirmed_synced'; itemsCount: number; movements: InitialStockMovementItem[]; syncWarning?: undefined }
  | { success: true; status: 'confirmed_reload_pending'; itemsCount: number; movements: InitialStockMovementItem[]; syncWarning: string }
  | { success: false; status: 'uncertain'; error: string; uncertain: true }
  | { success: false; status: 'rejected'; error: string; uncertain?: false };
