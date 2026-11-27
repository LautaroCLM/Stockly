import React, { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Sale } from '../types';
import { buildTicketMessage, normalizeArPhone, whatsappUrl } from '../whatsappTicket';

interface WhatsAppShareProps {
  sale: Sale;
  companyName: string;
  /** Celular del cliente, si está cargado: se completa solo. */
  defaultPhone?: string | null;
}

/** Enviar el comprobante por WhatsApp: abre la app (o WhatsApp Web) con el mensaje ya escrito. */
export const WhatsAppShare: React.FC<WhatsAppShareProps> = ({ sale, companyName, defaultPhone }) => {
  const [phone, setPhone] = useState(defaultPhone ?? '');
  const normalized = normalizeArPhone(phone);
  const unrecognized = phone.trim() !== '' && normalized === null;

  const send = () => {
    window.open(whatsappUrl(normalized, buildTicketMessage(sale, companyName)), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="shrink-0 px-6 py-3 border-t border-border bg-surface-2/30 space-y-1.5 print:hidden">
      <label htmlFor="whatsapp-phone" className="text-[11px] font-semibold text-text-secondary">Enviar por WhatsApp</label>
      <div className="flex items-center gap-2">
        <input id="whatsapp-phone" type="tel" inputMode="tel" autoComplete="off" value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } }}
          placeholder="Celular del cliente (opcional), ej. 11 2345-6789"
          className="flex-1 h-9 px-3 text-xs bg-surface-3 border border-border focus:border-primary rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none" />
        <button type="button" onClick={send}
          className="h-9 px-3 rounded-lg text-xs font-semibold text-white bg-[#25D366] hover:bg-[#1fb857] flex items-center gap-1.5 shrink-0 shadow-sm shadow-black/20">
          <MessageCircle size={15} />
          <span>WhatsApp</span>
        </button>
      </div>
      <p className={`text-[10px] ${unrecognized ? 'text-warning' : 'text-text-muted'}`}>
        {unrecognized
          ? 'No reconocemos ese número: vas a poder elegir el contacto en WhatsApp.'
          : phone.trim() === '' ? 'Sin número, elegís el contacto en WhatsApp.' : 'Se abre el chat con ese número y el comprobante escrito.'}
      </p>
    </div>
  );
};
