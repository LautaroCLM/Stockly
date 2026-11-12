const MAX_NAMES = 3;

function names(ids: readonly string[], items: readonly { id: string; name: string }[]): string {
  const found = ids.map((id) => items.find((item) => item.id === id)?.name ?? 'eliminada');
  const shown = found.slice(0, MAX_NAMES).join(', ');
  return found.length > MAX_NAMES ? `${shown} y ${found.length - MAX_NAMES} más` : shown;
}

/** Resume a qué productos aplica un cambio: "Todos los productos" o las categorías y proveedores elegidos. */
export function describeScope(
  categoryIds: readonly string[],
  supplierIds: readonly string[],
  categories: readonly { id: string; name: string }[],
  suppliers: readonly { id: string; name: string }[]
): string {
  const parts: string[] = [];
  if (categoryIds.length > 0) parts.push(`Categorías: ${names(categoryIds, categories)}`);
  if (supplierIds.length > 0) parts.push(`Proveedores: ${names(supplierIds, suppliers)}`);
  return parts.length > 0 ? parts.join(' · ') : 'Todos los productos';
}
