import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

import { prisma } from "../lib/db/prisma";
import { getMonthlyUsage } from "../lib/billing/usage";

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { workspaceId: true },
  });
  if (!project) throw new Error("workspace-missing");
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId: project.workspaceId } });
  const oldest = await prisma.usageEvent.findFirst({
    where: { workspaceId: project.workspaceId, type: "VIDEO_PROCESSING" },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true, amountSeconds: true },
  });
  let repaired = false;
  if (subscription && oldest && subscription.currentPeriodStart && oldest.createdAt < subscription.currentPeriodStart) {
    await prisma.subscription.update({
      where: { workspaceId: project.workspaceId },
      data: { currentPeriodStart: oldest.createdAt },
    });
    repaired = true;
  }
  const usage = await getMonthlyUsage(project.workspaceId);
  console.log(
    JSON.stringify({
      repaired,
      usedSeconds: usage.usedSeconds,
      remainingSeconds: usage.remainingSeconds,
      monthlyMinutes: usage.limits.monthlyMinutes,
      effectivePlanCode: usage.effectivePlanCode,
      status: usage.status,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  await prisma.$disconnect();
  process.exit(1);
});
