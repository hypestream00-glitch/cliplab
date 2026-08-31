import { prisma } from "@/lib/db/prisma";
import type { SocialPlatform } from "@/generated/prisma/client";

export async function createLiveChannel(params: {
  workspaceId: string;
  platform: SocialPlatform;
  username: string;
}) {
  const username = params.username.replace(/^@/, "").trim();
  if (!username) throw new Error("Informe o usuário do canal");
  return prisma.liveChannel.create({
    data: {
      workspaceId: params.workspaceId,
      platform: params.platform,
      username,
      channelId: `${params.platform.toLowerCase()}_${username.toLowerCase()}`,
      monitoringEnabled: false,
      autoPublish: false,
      status: "OFFLINE",
    },
  });
}

export async function toggleLiveMonitoring(workspaceId: string, channelId: string) {
  const channel = await prisma.liveChannel.findFirst({ where: { id: channelId, workspaceId } });
  if (!channel) return null;
  return prisma.liveChannel.update({
    where: { id: channel.id },
    data: { monitoringEnabled: !channel.monitoringEnabled },
  });
}

export async function setLiveAutoPublish(params: {
  workspaceId: string;
  channelId: string;
  enabled: boolean;
  consent: boolean;
}) {
  const channel = await prisma.liveChannel.findFirst({
    where: { id: params.channelId, workspaceId: params.workspaceId },
  });
  if (!channel) return null;
  if (params.enabled && !params.consent) {
    throw new Error("Autopublish exige consentimento explícito");
  }
  return prisma.liveChannel.update({
    where: { id: channel.id },
    data: { autoPublish: params.enabled && params.consent },
  });
}

export async function updateLiveSettings(params: {
  workspaceId: string;
  channelId: string;
  clipEveryMinutes: number;
  minimumScore: number;
  clipDuration: number;
}) {
  const channel = await prisma.liveChannel.findFirst({
    where: { id: params.channelId, workspaceId: params.workspaceId },
  });
  if (!channel) return null;
  return prisma.liveChannel.update({
    where: { id: channel.id },
    data: {
      clipEveryMinutes: params.clipEveryMinutes,
      minimumScore: params.minimumScore,
      clipDuration: params.clipDuration,
    },
  });
}
