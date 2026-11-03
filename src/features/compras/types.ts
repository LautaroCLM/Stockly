export interface PurchaseItem {
  id: string;
  companyId: string;
  purchaseId: string;
  productId: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
  createdAt: string;
  product?: {
    name: string;
    sku: string;
    unit?: string;
  };
}

export interface PurchaseSupplier {
  id: string;
  name: string;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface Purchase {
  id: string;
  companyId: string;
  purchaseNumber: string;
  supplierId: string;
  invoiceNumber: string | null;
  purchaseDate: string; // YYYY-MM-DD
  status: 'completed' | 'cancelled';
  subtotal: number;
  totalAmount: number;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  supplier?: PurchaseSupplier;
  items?: PurchaseItem[];
}

export interface PurchaseDraftItem {
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface CreatePurchaseInput {
  supplierId: string;
  invoiceNumber?: string;
  purchaseDate?: string;
  notes?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitCost: number;
  }>;
  idempotencyKey?: string;
}

export interface PurchaseActionResult {
  success: boolean;
  error?: string;
  purchaseId?: string;
  purchaseNumber?: string;
}
