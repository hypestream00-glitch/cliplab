import type { SubscriptionStatus } from "@/generated/prisma/client";
import { productPlanCode, type ProductPlanCode } from "@/lib/config/plans";
import { BILLING_POLICY } from "@/lib/billing/policy";

const STATUS_MAP: Record<string, SubscriptionStatus> = {
  active: "ACTIVE",
  trialing: "TRIALING",
  past_due: "PAST_DUE",
  canceled: "CANCELED",
  unpaid: "UNPAID",
  incomplete: "INCOMPLETE",
  incomplete_expired: "CANCELED",
  paused: "PAST_DUE",
};

export function mapStripeSubscriptionStatus(status: string | null | undefined): SubscriptionStatus {
  if (!status) return "INCOMPLETE";
  return STATUS_MAP[status] ?? "INCOMPLETE";
}

export function subscriptionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "ACTIVE":
      return "Ativo";
    case "TRIALING":
      return "Período de teste";
    case "PAST_DUE":
      return "Pagamento pendente";
    case "UNPAID":
      return "Não paga";
    case "CANCELED":
      return "Cancelada";
    case "INCOMPLETE":
      return "Incompleta";
    default:
      return status ?? "—";
  }
}

export type EffectivePlanInput = {
  planCode: string;
  status: string;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  gracePeriodEndsAt?: Date | null;
};

export function effectivePlanCode(input: EffectivePlanInput, now = new Date()): ProductPlanCode {
  const product = productPlanCode(input.planCode);
  if (product === "FREE") return "FREE";
  if (input.status === "ACTIVE" || input.status === "TRIALING") return product;
  if (input.status === "PAST_DUE" || input.status === "UNPAID") {
    if (input.gracePeriodEndsAt && input.gracePeriodEndsAt.getTime() > now.getTime()) return product;
    return "FREE";
  }
  if (input.cancelAtPeriodEnd && input.currentPeriodEnd && input.currentPeriodEnd.getTime() > now.getTime()) {
    return product;
  }
  return "FREE";
}

export function graceDays() {
  return BILLING_POLICY.gracePeriodDays;
}
