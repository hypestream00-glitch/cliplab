/**
 * Affiliate cash / minutes policy (phase 1 — manual PIX, no payment gateway).
 *
 * Minutes: granted immediately on first paid subscription confirmation.
 * They are not revoked on refund/chargeback (already consumed processing cannot be undone safely).
 *
 * Cash: enters PENDING for REFERRAL_CASH_HOLD_DAYS (default 7). Released to AVAILABLE after hold.
 * Refund/chargeback/dispute while PENDING → cash CANCELLED (never withdrawable).
 * Refund after AVAILABLE → REVIEW flag only. Do not auto-create a negative wallet balance.
 *
 * Commission is acquisition-only (FIRST_PAID_SUBSCRIPTION). Renewals do not pay.
 * Recurring commissions can use rewardType later; not implemented now.
 *
 * Minutes extra are a workspace pool (MinuteGrant.remaining), consumed only when monthly
 * plan minutes are exceeded. Unused extra carries across billing periods. Not a second ledger.
 */
export const AFFILIATE_POLICY = {
  cashHoldDaysDefault: 7,
  minutesImmediate: true,
  revokeMinutesOnRefund: false,
  reverseAvailableCashAutomatically: false,
  progressiveCashBonus: false,
} as const;
