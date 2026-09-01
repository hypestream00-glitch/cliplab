export const REFERRAL_CASH_CENTS = 500;
export const REFERRAL_AI_MINUTES = 30;
export const REFERRAL_HOLD_DAYS_DEFAULT = 7;
export const MIN_WITHDRAWAL_CENTS = 3000;
export const REFERRAL_MILESTONES = [5, 10, 25] as const;
export const RAPID_CONVERSION_REVIEW_THRESHOLD = 8;

export function referralHoldDays(source: NodeJS.ProcessEnv = process.env) {
  const raw = Number(source.REFERRAL_CASH_HOLD_DAYS ?? REFERRAL_HOLD_DAYS_DEFAULT);
  if (!Number.isFinite(raw) || raw < 0) return REFERRAL_HOLD_DAYS_DEFAULT;
  return Math.min(30, Math.floor(raw));
}

export function referralHoldUntil(now = new Date(), source: NodeJS.ProcessEnv = process.env) {
  return new Date(now.getTime() + referralHoldDays(source) * 24 * 60 * 60 * 1000);
}

export function formatBrlFromCents(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((cents || 0) / 100);
}
