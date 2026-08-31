import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { prisma } from "../lib/db/prisma";

async function main() {
  mkdirSync("backups", { recursive: true });
  const [projects, clips, publications, accounts, users, workspaces] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, name: true, workspaceId: true, status: true, isDemo: true },
    }),
    prisma.clip.findMany({
      select: { id: true, title: true, projectId: true, workspaceId: true, status: true },
    }),
    prisma.socialPublication.findMany({
      select: { id: true, workspaceId: true, status: true, mock: true },
    }),
    prisma.socialAccount.findMany({
      select: { id: true, workspaceId: true, platform: true, username: true, status: true, mock: true, provider: true },
    }),
    prisma.user.findMany({
      select: { id: true, email: true, name: true, onboardingCompleted: true },
    }),
    prisma.workspace.findMany({
      select: { id: true, name: true, slug: true },
    }),
  ]);

  const payload = {
    createdAt: new Date().toISOString(),
    counts: {
      projects: projects.length,
      clips: clips.length,
      publications: publications.length,
      accounts: accounts.length,
      users: users.length,
      workspaces: workspaces.length,
    },
    projects,
    clips,
    publications,
    accounts,
    users,
    workspaces,
  };

  writeFileSync("backups/module17-pre.json", JSON.stringify(payload, null, 2));
  console.log("Backup saved to backups/module17-pre.json");
  console.log(JSON.stringify(payload.counts));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
