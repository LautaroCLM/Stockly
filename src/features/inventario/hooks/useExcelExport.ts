import { useState } from 'react';
import type { Company } from '@/types';
import type { Product } from '../types';
import { downloadSpreadsheet } from '../excel/excelIO';
import { buildExportTable, exportFileName } from '../excel/exportRows';

/** Exportar todo el catálogo a Excel (no solo la página que se ve), con el costo solo si se puede ver. */
export function useExcelExport(company: Company, products: Product[], includeCosts: boolean) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportInfo, setExportInfo] = useState<string | null>(null);

  const exportExcel = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportInfo(null);
    try {
      const fileName = exportFileName(company.name, new Date());
      const outcome = await downloadSpreadsheet(buildExportTable(products, { includeCosts }), fileName);
      if (outcome === 'saved') setExportInfo(`Listo: se guardó el archivo con ${products.length} productos.`);
      else if (outcome === 'downloaded') setExportInfo(`Listo: se descargó ${fileName} con ${products.length} productos. Buscalo en tu carpeta de Descargas.`);
    } catch {
      setExportError('No se pudo generar el archivo de Excel. Intentá de nuevo.');
    } finally {
      setIsExporting(false);
    }
  };

  return { isExporting, exportError, exportInfo, clearInfo: () => setExportInfo(null), exportExcel };
}
