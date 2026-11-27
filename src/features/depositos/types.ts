export interface Warehouse {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

/** Stock de cada producto por depósito: productId → (warehouseId → cantidad). */
export type StockByWarehouse = Map<string, Map<string, number>>;

export interface TransferLine {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  quantity: number;
}

export interface StockTransfer {
  id: string;
  number: string;
  fromId: string;
  toId: string;
  notes: string | null;
  createdAt: string;
  items: { productId: string; name: string; quantity: number }[];
}

export type WarehouseActionResult<T = undefined> = { ok: true; value: T } | { ok: false; message: string };
