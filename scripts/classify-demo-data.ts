import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { classifyProject, classifyPublication } from "../lib/data/classify";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const projects = await prisma.project.findMany({
    include: { sourceVideo: true, transcript: true },
  });
  let markedProjects = 0;
  let preserved = 0;
  for (const project of projects) {
    const kind = classifyProject({
      name: project.name,
      storageKey: project.sourceVideo?.storageKey,
      transcriptProvider: project.transcript?.provider,
      transcriptSourceHash: project.transcript?.sourceHash,
      transcriptText: project.transcript?.fullText,
    });
    if (kind === "DEMO" || kind === "FIXTURE" || kind === "MOCK") {
      if (!project.isDemo) {
        await prisma.project.update({ where: { id: project.id }, data: { isDemo: true } });
        markedProjects += 1;
      }
    } else {
      preserved += 1;
    }
  }

  const publications = await prisma.socialPublication.findMany({
    include: { clip: { include: { project: { include: { sourceVideo: true, transcript: true } } } } },
  });
  let markedPubs = 0;
  for (const publication of publications) {
    const projectClass = publication.clip
      ? classifyProject({
          name: publication.clip.project.name,
          storageKey: publication.clip.project.sourceVideo?.storageKey,
          transcriptProvider: publication.clip.project.transcript?.provider,
          transcriptSourceHash: publication.clip.project.transcript?.sourceHash,
          transcriptText: publication.clip.project.transcript?.fullText,
        })
      : "UNKNOWN";
    const kind = classifyPublication({
      mock: publication.mock,
      provider: publication.provider,
      providerPublicationId: publication.providerPublicationId,
      caption: publication.caption,
      clipProjectClass: projectClass,
    });
    if ((kind === "DEMO" || kind === "MOCK" || kind === "FIXTURE") && !publication.mock) {
      await prisma.socialPublication.update({ where: { id: publication.id }, data: { mock: true } });
      markedPubs += 1;
    }
  }

  console.log(
    JSON.stringify({
      markedDemoProjects: markedProjects,
      preservedProjects: preserved,
      markedDemoPublications: markedPubs,
    }),
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
