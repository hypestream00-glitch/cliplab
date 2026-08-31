import { prisma } from "@/lib/db/prisma";
import { getStripeClient } from "@/lib/billing/stripe-client";
import { logger } from "@/lib/logger";

export async function getOrCreateStripeCustomer(workspaceId: string) {
  const stripe = getStripeClient();
  if (!stripe) return { mode: "unconfigured" as const, customerId: null };

  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: {
      workspace: {
        include: {
          members: { where: { role: "OWNER" }, include: { user: true }, take: 1 },
        },
      },
    },
  });
  if (!subscription) return { mode: "missing-subscription" as const, customerId: null };
  if (subscription.stripeCustomerId) {
    return { mode: "existing" as const, customerId: subscription.stripeCustomerId };
  }

  const owner = subscription.workspace.members[0]?.user;
  const customer = await stripe.customers.create({
    email: owner?.email ?? undefined,
    name: owner?.name ?? subscription.workspace.name,
    metadata: { workspaceId },
  });

  const claimed = await prisma.subscription.updateMany({
    where: { workspaceId, stripeCustomerId: null },
    data: { stripeCustomerId: customer.id },
  });
  if (claimed.count === 0) {
    const again = await prisma.subscription.findUnique({ where: { workspaceId } });
    logger.info({ workspaceId }, "stripe customer create lost a race; using persisted customer");
    return { mode: "existing" as const, customerId: again?.stripeCustomerId ?? customer.id };
  }
  return { mode: "created" as const, customerId: customer.id };
}
