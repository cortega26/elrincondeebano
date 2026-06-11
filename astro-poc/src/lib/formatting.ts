export const WHATSAPP_NUMBER = '56951118901';

export function formatCurrency(value: unknown): string {
  const parsed = Number(value);
  const amount = Number.isFinite(parsed) ? parsed : 0;

  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}
