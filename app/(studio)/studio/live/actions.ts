"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { createLiveChannel, setLiveAutoPublish, toggleLiveMonitoring, updateLiveSettings } from "@/lib/services/live";
import type { SocialPlatform } from "@/generated/prisma/client";

const LIVE_PLATFORMS: SocialPlatform[] = ["TWITCH", "KICK", "YOUTUBE"];

export async function createLiveChannelAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const platform = String(formData.get("platform") ?? "TWITCH") as SocialPlatform;
  const username = String(formData.get("username") ?? "");
  if (!LIVE_PLATFORMS.includes(platform)) {
    redirect("/studio/live/channels");
  }
  const channel = await createLiveChannel({
    workspaceId: ctx.workspace.id,
    platform,
    username,
  });
  revalidatePath("/studio/live");
  revalidatePath("/studio/live/channels");
  redirect(`/studio/live/${channel.id}`);
}

export async function toggleLiveMonitoringAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const channelId = String(formData.get("channelId") ?? "");
  await toggleLiveMonitoring(ctx.workspace.id, channelId);
  revalidatePath("/studio/live");
  revalidatePath(`/studio/live/${channelId}`);
  redirect(`/studio/live/${channelId}`);
}

export async function saveLiveSettingsAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const channelId = String(formData.get("channelId") ?? "");
  await updateLiveSettings({
    workspaceId: ctx.workspace.id,
    channelId,
    clipEveryMinutes: Number(formData.get("clipEveryMinutes") ?? 10),
    minimumScore: Number(formData.get("minimumScore") ?? 70),
    clipDuration: Number(formData.get("clipDuration") ?? 45),
  });
  revalidatePath(`/studio/live/${channelId}`);
  redirect(`/studio/live/${channelId}`);
}

export async function setLiveAutoPublishAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const channelId = String(formData.get("channelId") ?? "");
  const enabled = formData.get("enabled") === "on" || formData.get("enabled") === "true";
  const consent = formData.get("consent") === "on";
  try {
    await setLiveAutoPublish({
      workspaceId: ctx.workspace.id,
      channelId,
      enabled,
      consent,
    });
  } catch {
    redirect(`/studio/live/${channelId}?error=consent`);
  }
  revalidatePath(`/studio/live/${channelId}`);
  redirect(`/studio/live/${channelId}`);
}
