import "dotenv/config";
import { config } from "dotenv";
config({ path: ".env.local", override: true });

import { isBillingCheckoutEnabled } from "../lib/billing/provider";
import { billingMissingCategories, isStripeLiveKeyBlocked, stripeWebhookConfigured } from "../lib/billing/stripe-mode";
import { startPlanCheckout, createBillingPortal } from "../lib/billing/stripe";
import { parseCheckoutPlan } from "../lib/billing/plan-from-price";
import { prisma } from "../lib/db/prisma";

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { status: true, _count: { select: { clips: true } } },
  });
  const tiktok = await prisma.socialAccount.findFirst({
    where: { platform: "TIKTOK", mock: false },
    select: { status: true, provider: true },
  });
  const workspace = await prisma.workspaceMember.findFirst({
    where: { role: "OWNER" },
    select: { workspaceId: true },
  });
  if (!workspace) throw new Error("no owner workspace");

  const invalid = await fetch("http://localhost:3000/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=invalid", "content-type": "application/json" },
    body: JSON.stringify({ id: "evt_invalid" }),
  });
  const invalidJson = await invalid.json().catch(() => ({}));

  const tamper = await startPlanCheckout({ workspaceId: workspace.workspaceId, plan: "price_attacker" });
  const creator = await startPlanCheckout({ workspaceId: workspace.workspaceId, plan: "CREATOR" });
  const pro = await startPlanCheckout({ workspaceId: workspace.workspaceId, plan: "PRO" });
  const portal = await createBillingPortal({
    workspaceId: workspace.workspaceId,
    returnUrl: "http://localhost:3000/studio/settings/billing",
  });

  console.log(
    JSON.stringify(
      {
        testModeGuard: isStripeLiveKeyBlocked() ? "FAIL" : "PASS",
        checkoutEnabled: isBillingCheckoutEnabled(),
        missing: billingMissingCategories(),
        webhookConfigured: stripeWebhookConfigured(),
        invalidPlan: tamper.mode,
        parseBad: parseCheckoutPlan("price_attacker"),
        invalidSignatureStatus: invalid.status,
        invalidSignatureError: (invalidJson as { error?: string }).error ?? null,
        creatorCheckout: creator.mode,
        proCheckout: pro.mode,
        portal: portal.mode,
        hasCreatorUrl: Boolean(creator.mode === "stripe" && creator.url?.startsWith("https://checkout.stripe.com")),
        hasProUrl: Boolean(pro.mode === "stripe" && pro.url?.startsWith("https://checkout.stripe.com")),
        hasPortalUrl: Boolean(portal.mode === "stripe" && portal.url),
        project: project ? { status: project.status, clips: project._count.clips } : null,
        tiktok,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  process.exit(1);
});
