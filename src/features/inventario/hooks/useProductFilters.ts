import { useEffect, useMemo, useState } from 'react';
import type { Product, StockStatus } from '../types';

export const PRODUCTS_PER_PAGE = 8;

export type ActiveFilter = 'active' | 'inactive' | 'all';

/** Búsqueda, filtros y paginación local del catálogo de Inventario. */
export function useProductFilters(
  products: Product[],
  categoryNames: string[],
  companyId: string,
  searchRequest: { query: string; id: number } | null
) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | StockStatus>('all');
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('active');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);

  // Búsqueda desde el encabezado: aplica el texto y limpia los demás filtros
  useEffect(() => {
    if (!searchRequest) return;
    setSearchQuery(searchRequest.query);
    setSelectedCategory('all');
    setSelectedStatus('all');
    setActiveFilter('active');
  }, [searchRequest]);

  // Si se eliminó la categoría filtrada, se vuelve a "todas"
  useEffect(() => {
    if (selectedCategory !== 'all' && !categoryNames.includes(selectedCategory)) setSelectedCategory('all');
  }, [selectedCategory, categoryNames]);

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      const matchesSearch =
        !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q);
      const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory;
      const matchesStatus = selectedStatus === 'all' || p.status === selectedStatus;
      const isActive = p.isActive !== false;
      const matchesActive =
        activeFilter === 'all' || (activeFilter === 'active' && isActive) || (activeFilter === 'inactive' && !isActive);
      return matchesSearch && matchesCategory && matchesStatus && matchesActive;
    });
  }, [products, searchQuery, selectedCategory, selectedStatus, activeFilter]);

  // Al cambiar filtros o empresa se vuelve a la primera página
  useEffect(() => {
    setCurrentPage(1);
    setSelectedRowIndex(null);
  }, [searchQuery, selectedCategory, selectedStatus, activeFilter, companyId]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE));
  const pageProducts = useMemo(() => {
    const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedStatus('all');
    setActiveFilter('all');
  };

  return {
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    activeFilter,
    setActiveFilter,
    filteredProducts,
    pageProducts,
    currentPage,
    totalPages,
    goToPreviousPage: () => setCurrentPage((p) => Math.max(1, p - 1)),
    goToNextPage: () => setCurrentPage((p) => Math.min(totalPages, p + 1)),
    selectedRowIndex,
    setSelectedRowIndex,
    clearFilters,
  };
}
