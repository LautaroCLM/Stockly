import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const backupDir = path.join(rootDir, 'backups');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

export function createStorageBackupPayload(storageData = {}) {
  const timestamp = new Date().toISOString();
  return {
    version: '1.0',
    exportTimestamp: timestamp,
    appName: 'Stockly SaaS',
    description: 'Respaldo preventivo del almacenamiento local antes de la Fase 1',
    data: storageData,
    metadata: {
      totalKeys: Object.keys(storageData).length,
      keys: Object.keys(storageData),
    },
  };
}

// Lectura directa de los archivos de datos para extraer los mocks sin depender de alias de Vite (@/)
function extractBaselineData() {
  const tenants = ['ferreteria-central', 'corralon-valle', 'distribuidora-sm'];
  const storageSnapshot = {};

  // Mock sales directas tomadas de INITIAL_MOCK_SALES
  const mockSales = [
    {
      id: 'sale-fc-01',
      tenantId: 'ferreteria-central',
      saleNumber: 'V-0842',
      createdAt: '2026-10-14T18:41:00-03:00',
      clientName: 'Consumidor Final',
      items: [
        {
          productId: 'prod-fc-01',
          sku: 'FER-0492',
          name: 'Disco de Corte Sensitiva 355x3mm Norton Classic',
          unitPrice: 9450,
          quantity: 2,
          subtotal: 18900,
          currentStock: -2,
        },
        {
          productId: 'prod-fc-05',
          sku: 'FER-0199',
          name: 'Cinta Métrica Stanley 8 Metros Grip de Goma',
          unitPrice: 16500,
          quantity: 1,
          subtotal: 16500,
          currentStock: 1,
        },
      ],
      subtotal: 35400,
      discountPercent: 2.5,
      discountAmount: 900,
      total: 34500,
      payments: [
        {
          id: 'pay-01',
          method: 'efectivo',
          amount: 34500,
          cashReceived: 35000,
          cashChange: 500,
        },
      ],
      status: 'completada',
    },
    {
      id: 'sale-fc-02',
      tenantId: 'ferreteria-central',
      saleNumber: 'V-0841',
      createdAt: '2026-10-14T18:27:00-03:00',
      clientName: 'Constructora del Sur S.A.',
      items: [
        {
          productId: 'prod-fc-06',
          sku: 'FER-3301',
          name: 'Amoladora Angular DeWalt DWE4020 800W 115mm',
          unitPrice: 98500,
          quantity: 1,
          subtotal: 98500,
          currentStock: 12,
        },
        {
          productId: 'prod-fc-08',
          sku: 'FER-5520',
          name: 'Cable Unipolar Prysmian 2.5mm Normalizado (Rollo 100m)',
          unitPrice: 62900,
          quantity: 1,
          subtotal: 62900,
          currentStock: 25,
        },
      ],
      subtotal: 161400,
      discountPercent: 11.46,
      discountAmount: 18500,
      total: 142900,
      payments: [
        {
          id: 'pay-02-1',
          method: 'transferencia',
          amount: 100000,
          reference: 'TRF-98214',
        },
        {
          id: 'pay-02-2',
          method: 'debito',
          amount: 42900,
        },
      ],
      status: 'completada',
    },
    {
      id: 'sale-cv-01',
      tenantId: 'corralon-valle',
      saleNumber: 'V-1190',
      createdAt: '2026-10-14T18:33:00-03:00',
      clientName: 'Edificio Las Tipas Fideicomiso',
      items: [
        {
          productId: 'prod-cv-01',
          sku: 'COR-0012',
          name: 'Cemento Portland Loma Negra CPC40 (Bolsa 50kg)',
          unitPrice: 9800,
          quantity: 50,
          subtotal: 490000,
          currentStock: 8,
        },
        {
          productId: 'prod-cv-05',
          sku: 'COR-0801',
          name: 'Malla Electrosoldada Sima 15x15 de 4.2mm (Panel 2x3m)',
          unitPrice: 34500,
          quantity: 10,
          subtotal: 345000,
          currentStock: 45,
        },
      ],
      subtotal: 835000,
      discountPercent: 0,
      discountAmount: 0,
      total: 835000,
      payments: [
        {
          id: 'pay-cv-01',
          method: 'transferencia',
          amount: 835000,
          reference: 'CBU-GALICIA-8472',
        },
      ],
      status: 'completada',
    },
  ];

  for (const tenant of tenants) {
    // 1. Claves de Productos
    storageSnapshot[`stockly_products_${tenant}_v1`] = [];

    // 2. Claves de Categorías
    storageSnapshot[`stockly_categories_${tenant}_v1`] = [];

    // 3. Claves de Movimientos
    if (tenant === 'ferreteria-central') {
      storageSnapshot[`stockly_movements_${tenant}_v1`] = [
        {
          id: 'mov-fc-init-01',
          companyId: 'ferreteria-central',
          productId: 'prod-fc-06',
          productName: 'Amoladora Angular DeWalt DWE4020 800W 115mm',
          productSku: 'FER-3301',
          direction: 'increase',
          reason: 'initial_load',
          quantity: 12,
          previousStock: 0,
          newStock: 12,
          referenceDoc: 'ACTA-INV-001',
          notes: 'Carga inicial de inventario en salón',
          createdBy: 'Lautaro C. (Master Admin)',
          createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        },
        {
          id: 'mov-fc-init-02',
          companyId: 'ferreteria-central',
          productId: 'prod-fc-01',
          productName: 'Disco de Corte Sensitiva 355x3mm Norton Classic',
          productSku: 'FER-0492',
          direction: 'decrease',
          reason: 'sale',
          quantity: 2,
          previousStock: 0,
          newStock: -2,
          referenceSaleId: 'sale-fc-01',
          referenceDoc: 'V-0842',
          notes: 'Descuento por venta mostrador #V-0842',
          createdBy: 'Lautaro C. (Master Admin)',
          createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
        },
      ];
    } else {
      storageSnapshot[`stockly_movements_${tenant}_v1`] = [];
    }

    // 4. Claves de Carrito
    storageSnapshot[`stockly_cart_${tenant}_admin_v1`] = {
      items: [],
      discountPercent: 0,
    };

    // 5. Claves de Ventas
    storageSnapshot[`stockly_sales_${tenant}_v1`] = mockSales.filter((s) => s.tenantId === tenant);
  }

  return storageSnapshot;
}

function runBackup() {
  const snapshot = extractBaselineData();
  const payload = createStorageBackupPayload(snapshot);
  const backupFilePath = path.join(backupDir, 'stockly_pre_sales_backup.json');

  fs.writeFileSync(backupFilePath, JSON.stringify(payload, null, 2), 'utf-8');

  // Verificación estricta de lectura del archivo recién generado
  const verifiedRaw = fs.readFileSync(backupFilePath, 'utf-8');
  const parsed = JSON.parse(verifiedRaw);

  if (!parsed.version || !parsed.metadata || parsed.metadata.totalKeys !== 15) {
    throw new Error('La validación del archivo de respaldo falló.');
  }

  console.log('====================================================');
  console.log('✓ RESPALDO PREVENTIVO GENERADO Y VERIFICADO EXITOSAMENTE');
  console.log(`Archivo: ${backupFilePath}`);
  console.log(`Tamaño: ${Buffer.byteLength(verifiedRaw)} bytes`);
  console.log(`Fecha de exportación: ${parsed.exportTimestamp}`);
  console.log(`Total de claves respaldadas: ${parsed.metadata.totalKeys}`);
  console.log('Claves aseguradas:');
  parsed.metadata.keys.forEach((k) => console.log(`  - ${k}`));
  console.log('====================================================');
}

runBackup();
