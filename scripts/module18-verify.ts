import "dotenv/config";
import { prisma } from "../lib/db/prisma";

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: "RENATO GARCIA" },
    include: { _count: { select: { clips: true } }, transcript: { select: { provider: true } } },
  });
  const tiktok = await prisma.socialAccount.findFirst({
    where: { platform: "TIKTOK", mock: false },
    select: { username: true, status: true, provider: true, workspaceId: true },
  });
  const owners = await prisma.workspaceMember.findMany({
    where: { role: "OWNER" },
    include: { user: { select: { email: true, name: true } }, workspace: { select: { id: true, name: true } } },
  });
  console.log(
    JSON.stringify(
      {
        project: project
          ? {
              name: project.name,
              status: project.status,
              clips: project._count.clips,
              transcript: project.transcript?.provider ?? null,
              workspaceId: project.workspaceId,
            }
          : null,
        tiktok,
        owners: owners.map((item) => ({
          email: item.user.email,
          name: item.user.name,
          workspace: item.workspace.name,
          workspaceId: item.workspace.id,
        })),
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
