import { supabase } from '@/lib/supabase';
import type {
  StockMovement,
  StockMovementDirection,
  StockMovementReason,
} from '@/features/inventario/types';
import { sanitizeStockMovementError } from '@/features/inventario/api/stockMovementsApi';
import { buildSearchOrFilter } from '@/lib/postgrestSearch';

export const MOVEMENTS_PAGE_SIZE = 100;

export interface MovementFilters {
  direction: 'all' | StockMovementDirection;
  reason: 'all' | StockMovementReason;
  /** Texto libre: comprobante u observaciones (se busca en el servidor). */
  search: string;
  /** Productos cuyo nombre o SKU coinciden con la búsqueda (resueltos contra el catálogo). */
  matchingProductIds: string[];
}

export interface MovementsPage {
  rows: StockMovement[];
  total: number;
}

const MOVEMENT_COLUMNS =
  'id, company_id, product_id, direction, reason, quantity, previous_stock, new_stock, reference_sale_id, reference_doc, notes, created_by, created_at, product:products(name, sku)';

function searchFilter(filters: MovementFilters): string | null {
  return buildSearchOrFilter(filters.search, ['reference_doc', 'notes'], {
    column: 'product_id',
    ids: filters.matchingProductIds,
  });
}

/**
 * Página de movimientos de la empresa, del más reciente al más antiguo, con el total que
 * coincide con los filtros. Los filtros se aplican en el servidor.
 */
export async function fetchMovementsPage(
  companyId: string,
  filters: MovementFilters,
  offset: number,
  limit: number = MOVEMENTS_PAGE_SIZE
): Promise<MovementsPage> {
  let query = supabase
    .from('stock_movements')
    .select(MOVEMENT_COLUMNS, { count: 'exact' })
    .eq('company_id', companyId);

  if (filters.direction !== 'all') query = query.eq('direction', filters.direction);
  if (filters.reason !== 'all') query = query.eq('reason', filters.reason);
  const search = searchFilter(filters);
  if (search) query = query.or(search);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new Error(sanitizeStockMovementError(error, 'Error al consultar el historial de movimientos de stock.'));
  }

  const rows = data ?? [];
  const authorNames = await fetchAuthorNames(rows.map((row) => row.created_by));

  return {
    total: count ?? rows.length,
    rows: rows.map((row) => ({
      id: row.id,
      companyId: row.company_id,
      productId: row.product_id,
      productName: row.product?.name ?? 'Producto no identificado',
      productSku: row.product?.sku ?? '---',
      direction: row.direction as StockMovementDirection,
      reason: row.reason as StockMovementReason,
      quantity: Number(row.quantity),
      previousStock: Number(row.previous_stock),
      newStock: Number(row.new_stock),
      referenceSaleId: row.reference_sale_id || undefined,
      referenceDoc: row.reference_doc || undefined,
      notes: row.notes || undefined,
      createdBy: authorNames.get(row.created_by) || 'Personal autorizado',
      createdAt: row.created_at,
    })),
  };
}

/**
 * Cantidad de entradas y salidas que coinciden con los filtros (ignorando el filtro de sentido).
 */
export async function fetchMovementDirectionCounts(
  companyId: string,
  filters: MovementFilters
): Promise<{ entries: number; exits: number }> {
  const countDirection = async (direction: StockMovementDirection): Promise<number> => {
    let query = supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('direction', direction);

    if (filters.reason !== 'all') query = query.eq('reason', filters.reason);
    const search = searchFilter(filters);
    if (search) query = query.or(search);

    const { count, error } = await query;
    if (error) {
      throw new Error(sanitizeStockMovementError(error, 'Error al contar movimientos de stock.'));
    }
    return count ?? 0;
  };

  const [entries, exits] = await Promise.all([countDirection('increase'), countDirection('decrease')]);
  return { entries, exits };
}

/** Nombres de los autores de la página visible (vista profiles_public). */
async function fetchAuthorNames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds)];
  if (uniqueIds.length === 0) return new Map();

  const { data } = await supabase.from('profiles_public').select('id, full_name').in('id', uniqueIds);

  return new Map(
    (data ?? [])
      .filter((profile) => profile.id)
      .map((profile) => [profile.id as string, profile.full_name || 'Usuario'])
  );
}
