import React, { useState } from 'react';
import { Check, Copy, Info, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface InvitationTokenViewProps {
  token: string;
  email: string;
  onClose: () => void;
}

/** Token recién emitido, con copia al portapapeles e instrucciones de entrega. */
export const InvitationTokenView: React.FC<InvitationTokenViewProps> = ({ token, email, onClose }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopyState('copied');
    } catch {
      // Algunos navegadores bloquean el portapapeles: el token sigue seleccionable a mano
      setCopyState('failed');
    }
    setTimeout(() => setCopyState('idle'), 3000);
  };

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div role="status" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
        <Check size={16} className="shrink-0" />
        <span>Invitación generada exitosamente. Vigencia: 7 días.</span>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="invitation-token-output" className="block text-xs font-semibold text-text-primary flex items-center gap-1.5">
          <KeyRound size={13} className="text-accent" />
          <span>Token de invitación (un solo uso)</span>
        </label>
        <div className="relative">
          <textarea id="invitation-token-output" readOnly value={token} rows={3}
            className="w-full text-xs font-mono bg-surface-2 border border-border rounded-lg p-2.5 pr-10 text-text-primary resize-none select-all focus:outline-none" />
          <button type="button" onClick={() => void copyToken()} title="Copiar token"
            className="absolute right-2 top-2 p-1.5 rounded-md text-text-muted hover:text-text-primary bg-surface-3 hover:bg-surface border border-border transition-colors">
            {copyState === 'copied' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
        {copyState === 'failed' && (
          <p className="text-[11px] text-warning">No se pudo copiar automáticamente. Seleccioná el texto y copialo a mano.</p>
        )}
      </div>

      <div className="p-3 rounded-xl bg-surface-2/60 border border-border/80 text-[11px] text-text-muted space-y-1.5">
        <div className="flex items-center gap-1.5 text-text-secondary font-medium">
          <Info size={13} className="text-primary shrink-0" />
          <span>Instrucciones de entrega</span>
        </div>
        <p className="leading-relaxed">
          Entrégale este código al usuario <strong>{email}</strong>. Debe ingresar a Stockly y canjearlo desde la opción{' '}
          <em>«Aceptar invitación»</em> en el selector de empresa superior.
        </p>
      </div>

      <Button type="button" variant="primary" className="w-full text-xs h-9 justify-center" onClick={onClose}>
        Listo, Cerrar Ventana
      </Button>
    </div>
  );
};
