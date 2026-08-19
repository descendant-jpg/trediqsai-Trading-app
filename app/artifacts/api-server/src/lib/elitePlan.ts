export const ELITE_AMOUNT_CENTS = 4900;
export const ELITE_CURRENCY = 'usd';

export function isElitePayment(
  payment: { amount: number; currency: string; metadata?: Record<string, string> | null },
): boolean {
  return (
    payment.amount === ELITE_AMOUNT_CENTS &&
    payment.currency === ELITE_CURRENCY &&
    payment.metadata?.plan === 'elite'
  );
}