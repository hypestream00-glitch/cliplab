import { prisma } from "@/lib/db/prisma";

export async function recordSocialUsage(params: {
  workspaceId: string;
  kind: "post" | "profile" | "upload" | "analytics_sync" | "connect";
  quantity?: number;
  reference?: string;
}) {
  await prisma.socialUsageEvent.create({
    data: {
      workspaceId: params.workspaceId,
      kind: params.kind,
      quantity: params.quantity ?? 1,
      reference: params.reference,
    },
  });
}
