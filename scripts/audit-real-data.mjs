import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function kindOfProject(project) {
  const storageKey = project.sourceVideo?.storageKey ?? null;
  const provider = project.transcript?.provider ?? null;
  const hash = project.transcript?.sourceHash ?? null;
  const text = project.transcript?.fullText ?? "";
  if (hash === "seed") return "DEMO";
  if (provider === "MOCK" && !storageKey && /\[MOCK\]/.test(text)) return "DEMO";
  if (storageKey && provider === "OPENAI") return "REAL";
  if (storageKey) return "REAL";
  return "UNKNOWN";
}

async function main() {
  const projects = await prisma.project.findMany({
    include: {
      sourceVideo: true,
      transcript: true,
      _count: { select: { clips: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const clips = await prisma.clip.findMany({
    include: { project: { include: { transcript: true, sourceVideo: true } } },
  });
  const accounts = await prisma.socialAccount.findMany();
  const publications = await prisma.socialPublication.findMany({
    include: { targets: true },
  });
  const schedules = await prisma.schedule.findMany({ include: { publication: true } });
  const credits = await prisma.creditTransaction.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const balances = await prisma.creditBalance.findMany();
  const snapshots = await prisma.socialMetricSnapshot.findMany({
    include: { socialAccount: { select: { username: true, mock: true, provider: true, platform: true } } },
    orderBy: { capturedAt: "desc" },
    take: 20,
  });
  const notifications = await prisma.notification.findMany({ take: 20 });

  console.log("PROJECTS", projects.length);
  for (const p of projects) {
    console.log(
      JSON.stringify({
        class: kindOfProject(p),
        id: p.id,
        name: p.name,
        status: p.status,
        creditsUsed: p.creditsUsed,
        clips: p._count.clips,
        storageKey: Boolean(p.sourceVideo?.storageKey),
        thumb: Boolean(p.sourceVideo?.thumbnailKey),
        provider: p.transcript?.provider ?? null,
        hash: p.transcript?.sourceHash ?? null,
        durationMs: p.sourceVideo?.durationMs ?? null,
      }),
    );
  }

  const clipSummary = clips.map((c) => ({
    id: c.id,
    title: c.title,
    project: c.project.name,
    storageKey: Boolean(c.storageKey),
    status: c.status,
    projectClass: kindOfProject(c.project),
  }));
  console.log("CLIPS", clipSummary.length);
  const byProject = {};
  for (const c of clipSummary) {
    byProject[c.project] = (byProject[c.project] ?? 0) + 1;
  }
  console.log("CLIPS_BY_PROJECT", byProject);
  console.log(
    "CLIPS_WITH_FILE",
    clipSummary.filter((c) => c.storageKey).map((c) => ({ title: c.title, project: c.project })),
  );

  console.log("ACCOUNTS", accounts.length);
  for (const a of accounts) {
    console.log(
      JSON.stringify({
        id: a.id,
        platform: a.platform,
        username: a.username,
        mock: a.mock,
        provider: a.provider,
        status: a.status,
        externalAccountId: a.externalAccountId,
      }),
    );
  }

  console.log("PUBLICATIONS", publications.length);
  for (const p of publications) {
    console.log(
      JSON.stringify({
        id: p.id,
        status: p.status,
        mock: p.mock,
        provider: p.provider,
        providerPublicationId: p.providerPublicationId,
        scheduledFor: p.scheduledFor,
        publishedAt: p.publishedAt,
        caption: (p.caption ?? "").slice(0, 60),
        clipId: p.clipId,
      }),
    );
  }

  console.log("SCHEDULES", schedules.length);
  for (const s of schedules) {
    console.log(JSON.stringify({ id: s.id, mock: s.publication.mock, status: s.publication.status, at: s.scheduledFor }));
  }

  console.log("BALANCES", balances);
  console.log(
    "CREDITS",
    credits.map((c) => ({ type: c.type, amount: c.amount, description: c.description, reference: c.reference })),
  );

  console.log(
    "SNAPSHOTS",
    snapshots.map((s) => ({
      views: s.views,
      likes: s.likes,
      mock: s.socialAccount.mock,
      user: s.socialAccount.username,
      provider: s.socialAccount.provider,
      platform: s.socialAccount.platform,
      payload: s.rawPayload,
      at: s.capturedAt,
    })),
  );

  console.log(
    "NOTIFICATIONS",
    notifications.map((n) => ({ type: n.type, title: n.title, body: n.body })),
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
