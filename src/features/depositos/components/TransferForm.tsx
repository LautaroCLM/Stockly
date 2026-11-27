import React, { useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Product } from '@/features/inventario/types';
import { createTransferRpc } from '../api/warehousesApi';
import { parseTransferQuantity, validateTransfer } from '../transferDraft';
import type { StockByWarehouse, TransferLine, Warehouse } from '../types';

interface Props {
  companyId: string;
  warehouses: Warehouse[];
  products: Product[];
  stock: StockByWarehouse;
  defaultFrom: string;
  defaultTo: string;
  onDone: (number: string) => void;
}

const FIELD = 'h-8 px-2 text-xs bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary';

/** Nueva transferencia: de un depósito a otro, varios productos a la vez. */
export const TransferForm: React.FC<Props> = ({ companyId, warehouses, products, stock, defaultFrom, defaultTo, onDone }) => {
  const [fromId, setFromId] = useState(defaultFrom);
  const [toId, setToId] = useState(defaultTo);
  const [lines, setLines] = useState<(TransferLine & { text: string })[]>([]);
  const [pick, setPick] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(crypto.randomUUID());

  // Solo productos con stock en el origen
  const candidates = useMemo(
    () => products.filter((p) => (stock.get(p.id)?.get(fromId) ?? 0) > 0 && !lines.some((l) => l.productId === p.id)),
    [products, stock, fromId, lines]
  );

  const add = () => {
    const p = products.find((x) => x.id === pick);
    if (!p) return;
    setLines((ls) => [...ls, { productId: p.id, name: p.name, sku: p.sku, unit: p.unit, quantity: 0, text: '' }]);
    setPick('');
  };

  const submit = async () => {
    const parsed = lines.map((l) => ({ ...l, quantity: parseTransferQuantity(l.text, l.unit) ?? 0 }));
    const invalid = validateTransfer(fromId, toId, parsed, stock);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    const result = await createTransferRpc(companyId, keyRef.current, fromId, toId, parsed, notes);
    setBusy(false);
    if (!result.ok) return setError(result.message);
    keyRef.current = crypto.randomUUID();
    setLines([]);
    setNotes('');
    onDone(result.value);
  };

  return (
    <div className="p-4 rounded-2xl border border-border bg-surface space-y-3 text-xs">
      <h2 className="text-sm font-bold text-text-primary">Nueva transferencia</h2>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Depósito de origen" value={fromId} className={FIELD} onChange={(e) => { setFromId(e.target.value); setLines([]); }}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <ArrowRight size={14} className="text-text-muted" />
        <select aria-label="Depósito de destino" value={toId} className={FIELD} onChange={(e) => setToId(e.target.value)}>
          {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Producto a transferir" value={pick} className={`${FIELD} flex-1 min-w-48`} onChange={(e) => setPick(e.target.value)}>
          <option value="">Elegí un producto con stock en el origen…</option>
          {candidates.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku}) — hay {stock.get(p.id)?.get(fromId) ?? 0}</option>)}
        </select>
        <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={!pick} onClick={add}>Agregar</Button>
      </div>
      {lines.map((l) => (
        <div key={l.productId} className="flex items-center gap-2 p-2 rounded-lg bg-surface-2/60 border border-border">
          <span className="flex-1 text-text-primary">{l.name} <span className="text-text-muted">(hay {stock.get(l.productId)?.get(fromId) ?? 0})</span></span>
          <input aria-label={`Cantidad de ${l.name}`} inputMode="decimal" value={l.text} placeholder="Cant." className={`${FIELD} w-20 text-right`}
            onChange={(e) => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, text: e.target.value } : x)))} />
          <span className="text-text-muted w-10">{l.unit}</span>
          <button type="button" aria-label={`Quitar ${l.name}`} className="p-1 text-text-muted hover:text-danger"
            onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}><Trash2 size={13} /></button>
        </div>
      ))}
      <input aria-label="Nota de la transferencia" value={notes} maxLength={500} placeholder="Nota (opcional)" className={`${FIELD} w-full`}
        onChange={(e) => setNotes(e.target.value)} />
      {error && <p role="alert" className="text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button size="sm" variant="primary" className="gap-1.5" disabled={busy || lines.length === 0} onClick={() => void submit()}>
          {busy && <Loader2 size={13} className="animate-spin" />}<span>Transferir</span>
        </Button>
      </div>
    </div>
  );
};
