import { formatCurrency, formatDateShort } from '@/lib/formatters';
import type { AccountBalance } from './types';

/** Mensaje amable para recordarle a un cliente su saldo de cuenta corriente (WhatsApp). */
export function debtReminderMessage(companyName: string, account: AccountBalance): string {
  const since = account.oldestOpenSince ? ` (pendiente desde el ${formatDateShort(account.oldestOpenSince)})` : '';
  return [
    `Hola ${account.partyName}, ¿cómo estás?`,
    `Te escribimos de *${companyName}* por tu cuenta corriente.`,
    '',
    `Saldo pendiente: *${formatCurrency(account.balance)}*${since}.`,
    '',
    'Podés abonarlo en el local o por transferencia. Si ya lo pagaste, desestimá este mensaje. ¡Gracias!',
  ].join('\n');
}
