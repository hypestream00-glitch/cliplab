export const BILLING_POLICY = {
  downgradeTiming: "end_of_period" as const,
  gracePeriodDays: 3,
};

export const BILLING_MANAGE_ROLES = ["OWNER"] as const;

export type BillingManageRole = (typeof BILLING_MANAGE_ROLES)[number];

export function canManageBilling(role: string | null | undefined) {
  return role === "OWNER";
}

export function gracePeriodEndsAt(from = new Date()) {
  return new Date(from.getTime() + BILLING_POLICY.gracePeriodDays * 24 * 60 * 60 * 1000);
}
