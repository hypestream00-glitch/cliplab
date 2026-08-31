import "dotenv/config";
import { prisma } from "../lib/db/prisma";
import { ensureProductPlans } from "../lib/billing/ensure-plans";
import { processingIdempotencyKey, secondsFromDurationMs } from "../lib/billing/usage-math";

async function main() {
  await ensureProductPlans();

  const owners = await prisma.user.findMany({
    where: { memberships: { some: {} } },
  });

  for (const user of owners) {
    if (!user.onboardingCompleted || !user.onboardingCompletedAt) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          onboardingCompleted: true,
          onboardingCompletedAt: user.onboardingCompletedAt ?? user.updatedAt ?? new Date(),
          onboardingStep: Math.max(user.onboardingStep, 4),
        },
      });
    }
  }

  const renato = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA", isDemo: false },
    include: { sourceVideo: true },
  });

  if (renato?.sourceVideo?.durationMs) {
    const amountSeconds = secondsFromDurationMs(renato.sourceVideo.durationMs);
    await prisma.usageEvent.upsert({
      where: { idempotencyKey: processingIdempotencyKey(renato.id) },
      create: {
        workspaceId: renato.workspaceId,
        projectId: renato.id,
        type: "VIDEO_PROCESSING",
        amountSeconds,
        idempotencyKey: processingIdempotencyKey(renato.id),
      },
      update: {},
    });
  }

  const tiktok = await prisma.socialAccount.findFirst({
    where: { mock: false, platform: "TIKTOK", status: "CONNECTED" },
    select: { id: true, username: true, workspaceId: true, provider: true },
  });

  const clips = renato ? await prisma.clip.count({ where: { projectId: renato.id } }) : 0;

  console.log(
    JSON.stringify(
      {
        plansEnsured: true,
        ownerOnboardingPreserved: true,
        renato: renato ? { id: renato.id, workspaceId: renato.workspaceId, clips } : null,
        usageBackfill: renato?.sourceVideo?.durationMs ? secondsFromDurationMs(renato.sourceVideo.durationMs) : null,
        tiktok: tiktok ? { username: tiktok.username, workspaceId: tiktok.workspaceId, provider: tiktok.provider } : null,
        sameWorkspace: Boolean(renato && tiktok && renato.workspaceId === tiktok.workspaceId),
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
