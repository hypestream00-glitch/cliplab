import "dotenv/config";
import { config } from "dotenv";

config({ path: ".env.local", override: true });

import { prisma } from "../lib/db/prisma";

async function main() {
  const result = await prisma.user.updateMany({
    where: { emailVerified: null },
    data: { emailVerified: new Date() },
  });
  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    select: { status: true, _count: { select: { clips: true } } },
  });
  const sub = await prisma.subscription.findFirst({
    where: { workspace: { projects: { some: { name: "RENATO GARCIA" } } } },
    include: { plan: true },
  });
  console.log(
    JSON.stringify({
      verifiedExistingUsers: result.count,
      project: project ? { status: project.status, clips: project._count.clips } : null,
      plan: sub?.plan.code ?? null,
      status: sub?.status ?? null,
    }),
  );
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.log(JSON.stringify({ ok: false, reason: error instanceof Error ? error.message : "unknown" }));
  await prisma.$disconnect();
  process.exit(1);
});
