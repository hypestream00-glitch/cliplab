import "dotenv/config";
import { prisma } from "../lib/db/prisma";

function classifyKey(value: string | undefined) {
  if (!value?.trim()) return "MISSING";
  if (value.startsWith("sk_live_")) return "LIVE";
  if (value.startsWith("sk_test_")) return "TEST";
  if (value.startsWith("pk_live_")) return "LIVE";
  if (value.startsWith("pk_test_")) return "TEST";
  if (value.startsWith("whsec_")) return "PRESENT";
  if (value.startsWith("price_")) return "PRESENT";
  return "PRESENT_UNKNOWN_PREFIX";
}

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, onboardingCompleted: true, role: true, memberships: { select: { role: true, workspaceId: true, workspace: { select: { name: true } } } } },
  });
  const projects = await prisma.project.findMany({
    where: { isDemo: false },
    select: { id: true, name: true, workspaceId: true },
  });
  console.log(
    JSON.stringify(
      {
        users: users.map((u) => ({
          email: u.email,
          name: u.name,
          role: u.role,
          onboardingCompleted: u.onboardingCompleted,
          memberships: u.memberships,
        })),
        ownerEnvName: Boolean(process.env.CLIPLAB_OWNER_NAME?.trim() || process.env.DEV_OWNER_NAME?.trim()),
        ownerEnvEmail: Boolean(process.env.DEV_OWNER_EMAIL?.trim() || process.env.CLIPLAB_OWNER_EMAIL?.trim()),
        stripeSecret: classifyKey(process.env.STRIPE_SECRET_KEY),
        stripePublishable: classifyKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? process.env.STRIPE_PUBLISHABLE_KEY),
        stripeWebhook: classifyKey(process.env.STRIPE_WEBHOOK_SECRET),
        priceCreator: classifyKey(process.env.STRIPE_PRICE_CREATOR ?? process.env.STRIPE_PRICE_PLUS),
        pricePro: classifyKey(process.env.STRIPE_PRICE_PRO),
        checkoutFlag: process.env.BILLING_CHECKOUT_ENABLED ?? "",
        smtpHost: Boolean(process.env.SMTP_HOST?.trim()),
        smtpFrom: Boolean(process.env.SMTP_FROM?.trim()),
        realProjects: projects,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
