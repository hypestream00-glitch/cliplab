import "dotenv/config";
import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

config({ path: ".env.local", override: true });

import { prisma } from "../lib/db/prisma";
import { getStripeClient, resetStripeClientForTests, subscriptionPeriod, subscriptionPriceId } from "../lib/billing/stripe-client";
import { planFromStripePriceId } from "../lib/billing/plan-from-price";
import { getMonthlyUsage, getWorkspacePlanCode } from "../lib/billing/usage";
import { getPlanLimits, productPlanCode, clampClipCount, clampExportResolution } from "../lib/config/plans";
import { createBillingPortal } from "../lib/billing/stripe";
import { parseCheckoutPlan } from "../lib/billing/plan-from-price";
import { stripeSecretMode, isStripeLiveKeyBlocked } from "../lib/billing/stripe-mode";

function idKind(value: string | null | undefined) {
  if (!value) return "MISSING";
  if (value.startsWith("cs_test_") || value.startsWith("cs_")) return "CHECKOUT_SESSION";
  if (value.startsWith("cus_")) return "CUSTOMER";
  if (value.startsWith("sub_")) return "SUBSCRIPTION";
  if (value.startsWith("price_")) return "PRICE";
  if (value.startsWith("in_")) return "INVOICE";
  if (value.startsWith("evt_")) return "EVENT";
  return "OTHER";
}

function parseEnvFile(filePath: string) {
  const out: Record<string, string> = {};
  if (!existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function main() {
  resetStripeClientForTests();
  const stripe = getStripeClient();
  if (!stripe) {
    console.log(JSON.stringify({ ok: false, reason: "stripe-client-unavailable" }));
    process.exit(1);
  }

  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: {
      status: true,
      workspaceId: true,
      _count: { select: { clips: true } },
      transcript: { select: { provider: true } },
    },
  });
  const tiktok = await prisma.socialAccount.findFirst({
    where: { platform: "TIKTOK", mock: false },
    select: { status: true, provider: true, username: true, workspaceId: true },
  });
  const workspaceId = project?.workspaceId;
  if (!workspaceId) throw new Error("workspace-missing");

  const row = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });
  if (!row) throw new Error("subscription-missing");

  const usageEvents = await prisma.usageEvent.findMany({
    where: { workspaceId, type: "VIDEO_PROCESSING" },
    select: { amountSeconds: true, createdAt: true, projectId: true },
    orderBy: { createdAt: "asc" },
  });
  const processed = await prisma.processedStripeEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { type: true, createdAt: true },
  });

  const customerId = row.stripeCustomerId;
  const subscriptionId = row.stripeSubscriptionId;
  let stripeSub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null;
  let checkout: {
    status: string | null;
    mode: string | null;
    paymentStatus: string | null;
    amountTotal: number | null;
    currency: string | null;
    priceIdKind: string;
    planFromPrice: string | null;
    metadataWorkspace: boolean;
  } | null = null;

  if (subscriptionId) {
    stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
  }

  if (customerId) {
    const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 10 });
    const paid = sessions.data.find((item) => item.status === "complete" || item.payment_status === "paid") ?? sessions.data[0];
    if (paid) {
      const line = paid.line_items
        ? null
        : await stripe.checkout.sessions.retrieve(paid.id, { expand: ["line_items.data.price"] });
      const priceId =
        line?.line_items?.data?.[0]?.price && typeof line.line_items.data[0].price !== "string"
          ? line.line_items.data[0].price.id
          : null;
      checkout = {
        status: paid.status,
        mode: paid.mode,
        paymentStatus: paid.payment_status,
        amountTotal: paid.amount_total,
        currency: paid.currency,
        priceIdKind: idKind(priceId),
        planFromPrice: planFromStripePriceId(priceId),
        metadataWorkspace: paid.metadata?.workspaceId === workspaceId,
      };
    }
  }

  const priceId = stripeSub ? subscriptionPriceId(stripeSub) : null;
  const price = priceId ? await stripe.prices.retrieve(priceId) : null;
  const period = stripeSub ? subscriptionPeriod(stripeSub) : { start: null, end: null };
  const usage = await getMonthlyUsage(workspaceId);
  const backendCode = await getWorkspacePlanCode(workspaceId);
  const limits = getPlanLimits(backendCode);
  const portal = await createBillingPortal({
    workspaceId,
    returnUrl: "http://localhost:3000/studio/settings/billing",
    customerId: "cus_attacker",
  });

  const envLocal = parseEnvFile(path.join(process.cwd(), ".env.local"));
  const publicKeys = Object.keys(envLocal).filter((key) => key.startsWith("NEXT_PUBLIC_"));
  const leaked = publicKeys.filter((key) => {
    const value = envLocal[key] ?? "";
    return value.startsWith("sk_") || value.startsWith("rk_") || value.startsWith("whsec_");
  });

  const types = processed.map((item) => item.type);
  const purchaseTypes = [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "invoice.paid",
  ];

  console.log(
    JSON.stringify(
      {
        stripeMode: stripeSecretMode(),
        liveBlocked: isStripeLiveKeyBlocked(),
        workspaceMatchesProject: true,
        db: {
          planCode: row.plan.code,
          productPlan: productPlanCode(row.plan.code),
          status: row.status,
          customer: idKind(row.stripeCustomerId),
          subscription: idKind(row.stripeSubscriptionId),
          cancelAtPeriodEnd: row.cancelAtPeriodEnd,
          periodStart: row.currentPeriodStart?.toISOString() ?? null,
          periodEnd: row.currentPeriodEnd?.toISOString() ?? null,
        },
        stripe: stripeSub
          ? {
              status: stripeSub.status,
              cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
              livemode: stripeSub.livemode,
              customerMatches: typeof stripeSub.customer === "string" ? stripeSub.customer === customerId : false,
              metadataWorkspace: stripeSub.metadata?.workspaceId === workspaceId,
              planFromPrice: planFromStripePriceId(priceId),
              periodStart: period.start?.toISOString() ?? null,
              periodEnd: period.end?.toISOString() ?? null,
            }
          : null,
        price: price
          ? {
              active: price.active,
              currency: price.currency,
              unitAmount: price.unit_amount,
              interval: typeof price.recurring !== "string" ? price.recurring?.interval ?? null : null,
              nickname: price.nickname,
              productLive: price.livemode,
            }
          : null,
        checkout,
        usage: {
          effectivePlanCode: usage.effectivePlanCode,
          usedSeconds: usage.usedSeconds,
          remainingSeconds: usage.remainingSeconds,
          monthlyMinutes: usage.limits.monthlyMinutes,
          maxAccounts: usage.limits.maxAccounts,
          maxResolution: usage.limits.maxResolution,
          maxClipsPerProject: usage.limits.maxClipsPerProject,
          eventCount: usageEvents.length,
          eventSeconds: usageEvents.reduce((sum, item) => sum + item.amountSeconds, 0),
          oldestEvent: usageEvents[0]?.createdAt.toISOString() ?? null,
          periodStartVsOldest:
            row.currentPeriodStart && usageEvents[0]
              ? row.currentPeriodStart.getTime() <= usageEvents[0].createdAt.getTime()
                ? "period-includes-usage"
                : "period-excludes-older-usage"
              : "no-usage",
        },
        backendLimits: {
          planCode: backendCode,
          monthlyMinutes: limits.monthlyMinutes,
          maxAccounts: limits.maxAccounts,
          maxResolution: limits.maxResolution,
          maxClips: limits.maxClipsPerProject,
          clamp41: clampClipCount(backendCode, 41),
          clamp1080: clampExportResolution(backendCode, "1080p"),
        },
        portal: {
          mode: portal.mode,
          urlHost: portal.mode === "stripe" && portal.url ? new URL(portal.url).host : null,
          testPortal: portal.mode === "stripe" && Boolean(portal.url?.includes("billing.stripe.com")),
        },
        webhooks: {
          recentTypes: [...new Set(types)],
          purchaseTypesPresent: Object.fromEntries(purchaseTypes.map((type) => [type, types.includes(type)])),
        },
        parseAttack: parseCheckoutPlan("price_attacker"),
        secrets: {
          leakedPublic: leaked.length,
          publishableIsTest: (envLocal.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "").startsWith("pk_test_"),
        },
        project: project
          ? { status: project.status, clips: project._count.clips, transcript: project.transcript?.provider ?? null }
          : null,
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
  await prisma.$disconnect();
  process.exit(1);
});
