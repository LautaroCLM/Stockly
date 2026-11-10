/** Importe como se escribe en un campo (coma decimal, sin separador de miles): 4500.5 -> "4500,50". */
export function formatCurrencyInput(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}
