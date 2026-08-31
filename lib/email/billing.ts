import { prisma } from "@/lib/db/prisma";
import { productPlanName } from "@/lib/config/plans";
import { formatDate } from "@/lib/utils/format";
import { subscriptionPeriod } from "@/lib/billing/stripe-client";
import {
  sendPaymentFailedEmail,
  sendSubscriptionActivatedEmail,
  sendSubscriptionCanceledEmail,
  sendSubscriptionChangedEmail,
} from "@/lib/email/send";
import type Stripe from "stripe";

async function ownerOf(workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: { workspaceId, role: "OWNER" },
    include: { user: true },
  });
}

export async function notifySubscriptionActivated(params: {
  workspaceId: string;
  subscription: Stripe.Subscription;
  planCode: string;
}) {
  const owner = await ownerOf(params.workspaceId);
  if (!owner?.user.email) return;
  await sendSubscriptionActivatedEmail({
    to: owner.user.email,
    userId: owner.user.id,
    workspaceId: params.workspaceId,
    planName: productPlanName(params.planCode),
    name: owner.user.name,
    subscriptionId: params.subscription.id,
  });
}

export async function notifySubscriptionChanged(params: {
  workspaceId: string;
  subscription: Stripe.Subscription;
  planCode: string;
  priceId: string;
}) {
  const owner = await ownerOf(params.workspaceId);
  if (!owner?.user.email) return;
  await sendSubscriptionChangedEmail({
    to: owner.user.email,
    userId: owner.user.id,
    workspaceId: params.workspaceId,
    planName: productPlanName(params.planCode),
    name: owner.user.name,
    subscriptionId: params.subscription.id,
    priceId: params.priceId,
  });
}

export async function notifySubscriptionCanceled(params: {
  workspaceId: string;
  subscription: Stripe.Subscription;
  ended: boolean;
}) {
  const owner = await ownerOf(params.workspaceId);
  if (!owner?.user.email) return;
  const period = subscriptionPeriod(params.subscription);
  await sendSubscriptionCanceledEmail({
    to: owner.user.email,
    userId: owner.user.id,
    workspaceId: params.workspaceId,
    name: owner.user.name,
    subscriptionId: params.subscription.id,
    periodEnd: !params.ended && period.end ? formatDate(period.end) : null,
    ended: params.ended,
  });
}

export async function notifyPaymentFailed(params: { workspaceId: string; invoiceId: string }) {
  const owner = await ownerOf(params.workspaceId);
  if (!owner?.user.email) return;
  await sendPaymentFailedEmail({
    to: owner.user.email,
    userId: owner.user.id,
    workspaceId: params.workspaceId,
    name: owner.user.name,
    invoiceId: params.invoiceId,
  });
}
