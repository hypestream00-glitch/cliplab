import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hash } from "bcryptjs";
import { PLAN_LIMITS } from "../lib/config/plans";
import { hashToken } from "../lib/security/crypto";
import { shouldRunSeed } from "../lib/data/demo-mode";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  if (!shouldRunSeed()) {
    console.log("Seed skipped. Demo data is not created on normal startup.");
    console.log("To seed locally: npm run db:seed");
    return;
  }
  await prisma.processedStripeEvent.deleteMany();
  await prisma.adminAction.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.invoiceRecord.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.creditTransaction.deleteMany();
  await prisma.creditBatch.deleteMany();
  await prisma.creditBalance.deleteMany();
  await prisma.clipSubmission.deleteMany();
  await prisma.championshipParticipant.deleteMany();
  await prisma.championship.deleteMany();
  await prisma.liveSession.deleteMany();
  await prisma.liveChannel.deleteMany();
  await prisma.autopilotRule.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.socialPostMetricSnapshot.deleteMany();
  await prisma.socialMetricSnapshot.deleteMany();
  await prisma.socialPublicationTarget.deleteMany();
  await prisma.socialPublication.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.renderedAsset.deleteMany();
  await prisma.renderJob.deleteMany();
  await prisma.editorRevision.deleteMany();
  await prisma.editorElement.deleteMany();
  await prisma.editorProject.deleteMany();
  await prisma.clipScore.deleteMany();
  await prisma.clip.deleteMany();
  await prisma.transcriptSegment.deleteMany();
  await prisma.transcript.deleteMany();
  await prisma.sourceVideo.deleteMany();
  await prisma.processingJob.deleteMany();
  await prisma.project.deleteMany();
  await prisma.client.deleteMany();
  await prisma.template.deleteMany();
  await prisma.captionPreset.deleteMany();
  await prisma.brandKit.deleteMany();
  await prisma.workspaceInvitation.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.loginHistory.deleteMany();
  await prisma.authenticator.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.plan.deleteMany();

  for (const plan of Object.values(PLAN_LIMITS)) {
    await prisma.plan.create({
      data: {
        code: plan.code,
        name: plan.name,
        active: true,
        limits: plan as object,
      },
    });
  }

  const passwordHash = await hash("demo123456", 12);
  const user = await prisma.user.create({
    data: {
      name: "Ana Demo",
      email: "demo@cliplab.app",
      passwordHash,
      emailVerified: new Date(),
      onboardingCompleted: true,
      onboardingStep: 5,
      userType: "Creator",
      primaryGoal: "Gerar clipes",
      role: "USER",
    },
  });
  const admin = await prisma.user.create({
    data: {
      name: "CLIPLAB Admin",
      email: "admin@cliplab.app",
      passwordHash,
      emailVerified: new Date(),
      onboardingCompleted: true,
      role: "SUPER_ADMIN",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Ana Studio",
      slug: "ana-studio",
      type: "PERSONAL",
      members: {
        create: [
          { userId: user.id, role: "OWNER" },
          { userId: admin.id, role: "ADMIN" },
        ],
      },
    },
  });

  const plus = await prisma.plan.findUniqueOrThrow({ where: { code: "PLUS" } });
  await prisma.subscription.create({
    data: {
      workspaceId: workspace.id,
      planId: plus.id,
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18),
    },
  });

  await prisma.creditBalance.create({ data: { workspaceId: workspace.id, available: 1280 } });
  await prisma.creditBatch.create({
    data: {
      workspaceId: workspace.id,
      amount: 1500,
      remaining: 1280,
      type: "SUBSCRIPTION_GRANT",
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  await prisma.creditTransaction.createMany({
    data: [
      { workspaceId: workspace.id, type: "SUBSCRIPTION_GRANT", amount: 1500, description: "Créditos Plus" },
      { workspaceId: workspace.id, type: "VIDEO_ANALYSIS", amount: -12, description: "Análise live ranking" },
      { workspaceId: workspace.id, type: "TRANSCRIPTION", amount: -8, description: "Transcrição podcast" },
    ],
  });

  const projectNames = ["Live Ranking #482", "Podcast corte 08", "Review setup", "Final da copa"];
  const projects = [];
  for (const [index, name] of projectNames.entries()) {
    const project = await prisma.project.create({
      data: {
        workspaceId: workspace.id,
        name,
        status: "READY",
        mode: index === 1 ? "PODCAST" : index === 2 ? "INFORMATIVE" : "VIRAL",
        creditsUsed: 12,
        authorized: true,
        isDemo: true,
        sourceVideo: {
          create: {
            kind: index === 0 ? "TWITCH" : "YOUTUBE",
            originalName: `${name}.mp4`,
            durationMs: (38 + index * 12) * 60 * 1000,
            mimeType: "video/mp4",
            sizeBytes: 900_000_000 + index * 100000,
            width: 1920,
            height: 1080,
          },
        },
      },
    });
    projects.push(project);
    await prisma.transcript.create({
      data: {
        projectId: project.id,
        language: "pt-BR",
        fullText: "[MOCK] Transcrição de demonstração. OPENAI_API_KEY ausente no seed.",
        provider: "MOCK",
        sourceHash: "seed",
        segments: {
          create: Array.from({ length: 8 }).map((_, i) => ({
            projectId: project.id,
            startMs: i * 5000,
            endMs: i * 5000 + 4500,
            text: `[MOCK] Segmento ${i + 1} do projeto ${name}.`,
            speakerId: i % 2 === 0 ? "spk_1" : "spk_2",
            confidence: 0.9,
          })),
        },
      },
    });
  }

  const titles = [
    "O momento que ninguém esperava",
    "Chat explode nesse corte",
    "A frase que virou meme",
    "Reação mais honesta",
    "Virada em 20 segundos",
    "Hook perfeito para Reels",
    "Quando o plano falhou",
    "O clip mais comentado",
  ];
  let clipCount = 0;
  for (const project of projects) {
    for (let i = 0; i < 7; i++) {
      const score = 58 + ((clipCount * 9) % 40);
      const clip = await prisma.clip.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          title: `${titles[i % titles.length]} · ${project.name}`,
          summary: "Momento de alta retenção selecionado pelo provedor de IA (mock).",
          reason: "Gancho + troca de speaker + pico de energia.",
          startMs: i * 40000,
          endMs: i * 40000 + 28000,
          durationMs: 28000,
          status: "READY",
          hashtags: ["clipes", "viral"],
        },
      });
      await prisma.clipScore.create({
        data: {
          clipId: clip.id,
          overall: score,
          hookScore: Math.min(100, score + 4),
          retentionScore: Math.max(50, score - 6),
          clarityScore: Math.min(100, score + 2),
          emotionScore: Math.max(40, score - 10),
          shareabilityScore: Math.min(100, score),
        },
      });
      clipCount += 1;
    }
  }

  const platforms = ["TIKTOK", "INSTAGRAM", "YOUTUBE", "X", "TWITCH"] as const;
  const accounts = [];
  for (const platform of platforms) {
    const account = await prisma.socialAccount.create({
      data: {
        workspaceId: workspace.id,
        platform,
        externalAccountId: `demo_${platform}`,
        username: platform === "YOUTUBE" ? "anademo" : "ana.clips",
        displayName: "Ana Demo",
        status: "CONNECTED",
        mock: true,
        lastSyncAt: new Date(),
        scopes: ["mock"],
      },
    });
    accounts.push(account);
    for (let day = 29; day >= 0; day--) {
      const capturedAt = new Date(Date.now() - day * 86400000);
      await prisma.socialMetricSnapshot.create({
        data: {
          socialAccountId: account.id,
          capturedAt,
          followers: 12000 + (29 - day) * 18 + platforms.indexOf(platform) * 400,
          views: 80000 + (29 - day) * 1200,
          likes: 4200 + (29 - day) * 40,
          comments: 310 + (29 - day) * 3,
          shares: 140 + (29 - day) * 2,
          posts: 40 + Math.floor((29 - day) / 3),
          engagement: 4.2 + (29 - day) * 0.02,
          rawPayload: { source: "seed", mocked: true },
        },
      });
    }
  }

  const clips = await prisma.clip.findMany({ take: 12 });
  for (const [index, clip] of clips.entries()) {
    const scheduledFor = new Date(Date.now() + index * 3600000 * 6);
    const publication = await prisma.socialPublication.create({
      data: {
        workspaceId: workspace.id,
        clipId: clip.id,
        caption: `Corte ${index + 1} — gerado no CLIPLAB`,
        hashtags: ["clipes", "shorts"],
        status: index % 3 === 0 ? "PUBLISHED" : "SCHEDULED",
        scheduledFor,
        publishedAt: index % 3 === 0 ? new Date() : null,
        mock: true,
        timezone: "America/Sao_Paulo",
      },
    });
    await prisma.socialPublicationTarget.create({
      data: {
        publicationId: publication.id,
        socialAccountId: accounts[index % accounts.length].id,
        platform: accounts[index % accounts.length].platform,
        status: publication.status,
        views: 1200 * (index + 1),
        likes: 80 * (index + 1),
        comments: 12 * (index + 1),
        shares: 4 * (index + 1),
      },
    });
    await prisma.schedule.create({
      data: {
        workspaceId: workspace.id,
        publicationId: publication.id,
        scheduledFor,
        timezone: "America/Sao_Paulo",
      },
    });
  }

  await prisma.liveChannel.create({
    data: {
      workspaceId: workspace.id,
      platform: "TWITCH",
      channelId: "ana-live",
      username: "anademo",
      monitoringEnabled: true,
      status: "OFFLINE",
      autoPublish: false,
    },
  });

  await prisma.template.createMany({
    data: [
      { workspaceId: workspace.id, name: "Vertical Bold", canvas: { ratio: "9:16" } },
      { workspaceId: workspace.id, name: "Podcast Clean", canvas: { ratio: "9:16" } },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { workspaceId: workspace.id, userId: user.id, type: "CLIPS_READY", title: "Clipes prontos", body: "8 clipes gerados em Live Ranking #482." },
      { workspaceId: workspace.id, userId: user.id, type: "CREDITS_LOW", title: "Créditos", body: "Seu saldo ainda está saudável neste workspace." },
      { workspaceId: workspace.id, userId: user.id, type: "PUBLISH_SUCCESS", title: "Publicação mock", body: "Nenhuma publicação real foi feita. Modo de desenvolvimento." },
    ],
  });

  await prisma.apiKey.create({
    data: {
      workspaceId: workspace.id,
      userId: user.id,
      name: "Demo key",
      prefix: "clp_demo",
      hashedKey: hashToken("clp_demo_seed_key_do_not_use_in_prod"),
      scopes: ["projects:read", "projects:write"],
    },
  });

  console.log("Seed OK");
  console.log("Login demo: demo@cliplab.app / demo123456");
  console.log("Admin: admin@cliplab.app / demo123456");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
