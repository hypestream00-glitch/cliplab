"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { grantCredits } from "@/lib/billing/credits";

export async function adminGrantCreditsAction(formData: FormData) {
  const admin = await requireAdmin();
  const workspaceId = String(formData.get("workspaceId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  if (!workspaceId || amount <= 0) {
    redirect("/admin/billing");
  }
  await grantCredits({
    workspaceId,
    amount,
    type: "ADMIN_ADJUSTMENT",
    description: `Ajuste admin por ${admin.email}`,
  });
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      workspaceId,
      action: "ADMIN_CREDITS_GRANTED",
      entityType: "Workspace",
      entityId: workspaceId,
      metadata: { amount },
    },
  });
  revalidatePath("/admin/billing");
  redirect("/admin/billing");
}
