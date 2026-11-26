import React from 'react';
import { formatCurrency } from '@/lib/formatters';
import { labelCode, type LabelData } from '../types';
import { BarcodeSvg } from './BarcodeSvg';

/** Etiqueta de góndola (63,5 × 38 mm): nombre, precio grande, código de barras y SKU. Siempre en blanco y negro. */
export const PriceLabel: React.FC<{ label: LabelData }> = ({ label }) => {
  const code = labelCode(label);
  return (
    <div className="price-label" style={{ width: '63.5mm', height: '38mm', padding: '2.5mm 3mm', boxSizing: 'border-box',
      border: '0.2mm dashed #999', background: '#fff', color: '#000', display: 'flex', flexDirection: 'column',
      fontFamily: 'Inter, Arial, sans-serif', overflow: 'hidden', breakInside: 'avoid' }}>
      <div style={{ fontSize: '9pt', fontWeight: 600, lineHeight: 1.15, maxHeight: '2.3em', overflow: 'hidden' }}>{label.name}</div>
      <div style={{ fontSize: '19pt', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, marginTop: '1mm' }}>
        {formatCurrency(label.price)}
      </div>
      <div style={{ fontSize: '6.5pt', color: '#333' }}>por {label.unit}</div>
      <div style={{ marginTop: 'auto' }}>
        {code && <BarcodeSvg value={code} className="block w-full h-[10mm]" />}
        <div style={{ fontSize: '6.5pt', fontFamily: 'monospace', display: 'flex', justifyContent: 'space-between' }}>
          <span>{code}</span><span>{label.sku !== code ? label.sku : ''}</span>
        </div>
      </div>
    </div>
  );
};
