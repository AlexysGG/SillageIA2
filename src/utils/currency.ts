export function formatMXN(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  return `$${rounded.toLocaleString('es-MX')} MXN`;
}
