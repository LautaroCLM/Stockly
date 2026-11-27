import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { LotActionResult } from '../types';

interface Props {
  warningDays: number;
  onSave: (days: number) => Promise<LotActionResult>;
}

/** Con cuántos días de anticipación se avisa un vencimiento (solo el Master Admin). */
export const WarningDaysSetting: React.FC<Props> = ({ warningDays, onSave }) => {
  const [text, setText] = useState(String(warningDays));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  useEffect(() => setText(String(warningDays)), [warningDays]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = Number(text);
    if (!Number.isInteger(days) || days < 1 || days > 365) return setMessage({ ok: false, text: 'Entre 1 y 365 días.' });
    setIsBusy(true);
    const result = await onSave(days);
    setIsBusy(false);
    setMessage(result.ok ? { ok: true, text: 'Guardado.' } : { ok: false, text: result.message });
  };

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
      <label htmlFor="expiry-days">Avisar</label>
      <input id="expiry-days" inputMode="numeric" value={text} onChange={(e) => { setText(e.target.value); setMessage(null); }}
        className="w-14 h-8 px-2 text-center bg-surface-2 border border-border rounded-lg text-text-primary focus:outline-none focus:border-primary" />
      <span>días antes de que venza</span>
      {Number(text) !== warningDays && (
        <Button type="submit" size="sm" variant="secondary" className="h-8 gap-1.5" disabled={isBusy}>
          {isBusy && <Loader2 size={13} className="animate-spin" />}Guardar
        </Button>
      )}
      {message && <span role="status" className={message.ok ? 'text-emerald-400' : 'text-danger'}>{message.text}</span>}
    </form>
  );
};
