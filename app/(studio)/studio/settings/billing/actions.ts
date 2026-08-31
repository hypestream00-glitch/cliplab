"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBillingOwner } from "@/lib/auth/session";
import { createBillingPortal, startPlanCheckout } from "@/lib/billing/stripe";
import { parseCheckoutPlan } from "@/lib/billing/plan-from-price";
import { rateLimitGuard } from "@/lib/security/guard";
import { publicBaseUrl } from "@/lib/env/app-url";

export async function changePlanAction(formData: FormData) {
  const limited = await rateLimitGuard("billing-checkout", 8, 60_000);
  if (limited) {
    redirect("/studio/settings/billing?error=rate-limit");
  }
  const ctx = await requireBillingOwner();
  const plan = parseCheckoutPlan(String(formData.get("plan") ?? formData.get("planCode") ?? ""));
  if (!plan) {
    redirect("/studio/settings/billing?error=invalid-plan");
  }
  const origin = publicBaseUrl();
  const result = await startPlanCheckout({
    workspaceId: ctx.workspace.id,
    plan,
    successUrl: `${origin}/billing/success`,
    cancelUrl: `${origin}/billing/cancel`,
  });
  revalidatePath("/studio/settings/billing");
  if (result.mode === "stripe" && result.url) {
    redirect(result.url);
  }
  if (result.mode === "scheduled-downgrade") {
    redirect("/studio/settings/billing?downgrade=scheduled");
  }
  if (result.mode === "invalid-plan") {
    redirect("/studio/settings/billing?error=invalid-plan");
  }
  if (result.mode === "blocked-live") {
    redirect("/studio/settings/billing?error=live-blocked");
  }
  redirect("/studio/settings/billing?payments=configuring");
}

export async function manageSubscriptionAction() {
  const limited = await rateLimitGuard("billing-portal", 8, 60_000);
  if (limited) {
    redirect("/studio/settings/billing?error=rate-limit");
  }
  const ctx = await requireBillingOwner();
  const origin = publicBaseUrl();
  const result = await createBillingPortal({
    workspaceId: ctx.workspace.id,
    returnUrl: `${origin}/studio/settings/billing`,
  });
  if (result.mode === "stripe" && result.url) {
    redirect(result.url);
  }
  redirect("/studio/settings/billing?payments=configuring");
}
