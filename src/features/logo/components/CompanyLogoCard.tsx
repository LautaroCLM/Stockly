import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import type { Company } from '@/types';
import { useCompanyLogo } from '../hooks/useCompanyLogo';
import { LOGO_ACCEPT } from '../imageFit';
import { CompanyLogo } from './CompanyLogo';

/** Logo de la empresa: se ve arriba en el menú y después en los comprobantes. Solo el administrador lo cambia. */
export const CompanyLogoCard: React.FC<{ company: Company; isMasterAdmin: boolean }> = ({ company, isMasterAdmin }) => {
  const { logo, upload, remove } = useCompanyLogo(company.id);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>, success: string) => {
    setIsBusy(true);
    setMessage(null);
    const result = await action();
    setIsBusy(false);
    setMessage(result.ok ? { text: success, isError: false } : { text: result.message, isError: true });
  };

  return (
    <Card className="overflow-hidden border-border/80">
      <div className="p-4 sm:p-5 border-b border-border/60 bg-surface-2/40">
        <h2 className="text-sm font-bold text-text-primary">Logo de la empresa</h2>
        <p className="text-[11px] text-text-secondary">Se muestra arriba, junto al nombre, y luego en los comprobantes.</p>
      </div>
      <CardContent className="p-4 sm:p-5 flex flex-wrap items-center gap-5">
        <div className="w-28 h-28 rounded-xl bg-white/95 border border-border flex items-center justify-center p-2">
          <CompanyLogo logo={logo} initials={company.initials} name={company.name} className="w-full h-full" />
        </div>
        <div className="space-y-2 text-xs text-text-secondary max-w-sm">
          <p className="leading-relaxed">
            Subí una imagen PNG, JPG o WebP, de preferencia cuadrada y con fondo transparente. La app la reduce a 512 px
            y la comprime sola.
          </p>
          {isMasterAdmin ? (
            <div className="flex flex-wrap gap-2">
              <input ref={inputRef} type="file" accept={LOGO_ACCEPT} className="hidden" aria-label="Archivo del logo"
                onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(() => upload(file), 'Logo actualizado.'); }} />
              <Button variant="primary" size="sm" disabled={isBusy} className="gap-1.5" onClick={() => inputRef.current?.click()}>
                {isBusy ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                <span>{logo ? 'Cambiar logo' : 'Subir logo'}</span>
              </Button>
              {logo && (
                <Button variant="secondary" size="sm" disabled={isBusy} className="gap-1.5" onClick={() => void run(remove, 'Logo quitado.')}>
                  <Trash2 size={14} /><span>Quitar</span>
                </Button>
              )}
            </div>
          ) : (
            <p className="text-text-muted">Solo el administrador puede cambiar el logo.</p>
          )}
          {message && <p role={message.isError ? 'alert' : 'status'} className={message.isError ? 'text-danger' : 'text-emerald-400'}>{message.text}</p>}
        </div>
      </CardContent>
    </Card>
  );
};
