import React, { useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { CheckCircle2, PackageSearch, X } from 'lucide-react';
import { ModalFrame } from '@/components/motion/ModalFrame';
import { parseHundredths } from '@/lib/decimal';
import type { Product } from '@/features/inventario/types';
import type { Supplier } from '@/features/proveedores/types';
import { normalizeArPhone, whatsappUrl } from '@/features/inventario/whatsappTicket';
import { buildRestockPlan, buildSupplierOrderMessage, type RestockGroup } from '../restockPlan';
import { RestockGroupCard, type LineState } from './RestockGroupCard';

export interface RestockSelection {
  supplierId: string;
  lines: { product: Product; quantity: number }[];
}

interface RestockModalProps {
  isOpen: boolean;
  companyName: string;
  products: Product[];
  suppliers: Supplier[];
  canRegister: boolean;
  onClose: () => void;
  /** Abre el registro de compra ya cargado con lo elegido. */
  onRegisterPurchase: (selection: RestockSelection) => void;
}

const initialLines = (plan: RestockGroup[]) =>
  Object.fromEntries(plan.flatMap((g) => g.items.map((i) => [i.product.id, { include: true, quantity: String(i.suggested) }])));

/** Lo elegido de un grupo, con cantidades válidas (las vacías o inválidas se saltean). */
function chosenLines(group: RestockGroup, lines: Record<string, LineState>) {
  return group.items.flatMap(({ product }) => {
    const line = lines[product.id];
    const cents = line?.include ? parseHundredths(line.quantity) : null;
    return cents && cents > 0 ? [{ product, quantity: cents / 100 }] : [];
  });
}

/** Reposición de stock bajo: por proveedor, qué pedir y cuánto, para pedirlo por WhatsApp o registrar la compra recibida. */
const RestockModalBody: React.FC<RestockModalProps> = ({ companyName, products, suppliers, canRegister, onClose, onRegisterPurchase }) => {
  const plan = useMemo(() => buildRestockPlan(products, suppliers), [products, suppliers]);
  const [lines, setLines] = useState<Record<string, LineState>>(() => initialLines(plan));
  const update = (id: string, patch: Partial<LineState>) => setLines((l) => ({ ...l, [id]: { ...l[id], ...patch } }));
  // Proveedor elegido a mano para el grupo de productos que no tienen uno cargado
  const [pickedForNone, setPickedForNone] = useState('');
  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })), [suppliers]);
  const supplierOf = (group: RestockGroup) => group.supplier ?? suppliers.find((s) => s.id === pickedForNone) ?? null;

  const sendWhatsApp = (group: RestockGroup) => {
    const supplier = supplierOf(group);
    const phone = supplier?.phone ? normalizeArPhone(supplier.phone) : null;
    const text = buildSupplierOrderMessage(companyName, supplier, chosenLines(group, lines));
    window.open(whatsappUrl(phone, text), '_blank', 'noopener,noreferrer');
  };

  return (
    <ModalFrame ariaLabel="Reponer stock bajo" onBackdropClick={onClose} panelClassName="max-w-2xl">
      <div className="p-4 px-6 border-b border-border flex items-center justify-between bg-surface-2/40">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary"><PackageSearch size={19} /></div>
          <div>
            <h2 className="text-base font-bold text-text-primary">Reponer stock bajo</h2>
            <p className="text-xs text-text-muted">Sugerimos pedir hasta el doble del mínimo. Ajustá lo que quieras.</p>
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"><X size={18} /></button>
      </div>
      <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
        {plan.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-center">
            <CheckCircle2 size={28} className="text-success" />
            <p className="text-sm font-semibold text-text-primary">No hay productos para reponer</p>
            <p className="text-xs text-text-muted">Todo está por encima de su stock mínimo.</p>
          </div>
        ) : (
          plan.map((group) => (
            <RestockGroupCard key={group.supplier?.id ?? 'none'} group={group} lines={lines} onLineChange={update}
              canRegister={canRegister} supplierOptions={activeSuppliers} pickedSupplierId={supplierOf(group)?.id ?? ''}
              onPickSupplier={setPickedForNone} onWhatsApp={() => sendWhatsApp(group)}
              onRegister={() => {
                const supplier = supplierOf(group);
                if (supplier) onRegisterPurchase({ supplierId: supplier.id, lines: chosenLines(group, lines) });
              }} />
          ))
        )}
        {plan.some((g) => !g.supplier) && (
          <p className="text-[11px] text-text-muted">Los productos sin proveedor habitual quedan juntos: elegí a quién pedirle arriba de esa lista.</p>
        )}
      </div>
    </ModalFrame>
  );
};

export const RestockModal: React.FC<RestockModalProps> = (props) => (
  <AnimatePresence>{props.isOpen && <RestockModalBody {...props} />}</AnimatePresence>
);
