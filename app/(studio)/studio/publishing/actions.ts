"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { createPublication, publishNow, retryPublication, cancelPublication } from "@/lib/services/publishing";
import { updateUploadPostSchedule } from "@/lib/social/upload-post/publish";
import { rateLimitGuard } from "@/lib/security/guard";
import { prisma } from "@/lib/db/prisma";

export async function createPublicationAction(formData: FormData) {
  const limited = await rateLimitGuard("publish", 10, 60_000);
  if (limited) {
    const clipId = String(formData.get("clipId") ?? "");
    redirect(`/studio/publishing?clip=${clipId}&error=${encodeURIComponent(limited.error)}`);
  }
  const ctx = await requireWorkspaceContext();
  const clipId = String(formData.get("clipId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim();
  const hashtags = String(formData.get("hashtags") ?? "")
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter(Boolean);
  const mode = (String(formData.get("mode") ?? "now") as "now" | "schedule" | "queue");
  const scheduledRaw = String(formData.get("scheduledFor") ?? "");
  const accountIds = formData.getAll("accountIds").map(String).filter(Boolean);
  const timezone = String(formData.get("timezone") ?? "America/Sao_Paulo");
  if (!clipId || accountIds.length === 0) {
    redirect(`/studio/publishing?clip=${clipId}&error=accounts`);
  }
  try {
    await createPublication({
      workspaceId: ctx.workspace.id,
      clipId,
      accountIds,
      caption,
      hashtags,
      mode,
      scheduledFor: scheduledRaw ? new Date(scheduledRaw) : undefined,
      timezone,
      privacy: String(formData.get("privacy") ?? "") || undefined,
      disableComment: formData.get("disableComment") === "on",
      disableDuet: formData.get("disableDuet") === "on",
      disableStitch: formData.get("disableStitch") === "on",
      shareToFeed: formData.get("shareToFeed") === "on",
      youtubeTitle: String(formData.get("youtubeTitle") ?? "").trim() || undefined,
      youtubeDescription: String(formData.get("youtubeDescription") ?? "").trim() || undefined,
      youtubePrivacy: String(formData.get("youtubePrivacy") ?? "").trim() || undefined,
      youtubeTags: String(formData.get("youtubeTags") ?? "")
        .split(/[\s,]+/)
        .map((tag) => tag.replace(/^#/, "").trim())
        .filter(Boolean),
      confirmReal: formData.get("confirmRealPublish") === "1",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "publish";
    redirect(`/studio/publishing?clip=${clipId}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/studio/publishing");
  revalidatePath("/studio/publishing/calendar");
  revalidatePath("/studio/publishing/queue");
  revalidatePath("/studio/clips");
  redirect(mode === "schedule" ? "/studio/publishing/calendar" : mode === "queue" ? "/studio/publishing/queue" : "/studio/publishing");
}

export async function publishNowAction(formData: FormData) {
  const limited = await rateLimitGuard("publish-now", 10, 60_000);
  if (limited) redirect(`/studio/publishing?error=${encodeURIComponent(limited.error)}`);
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("publicationId") ?? "");
  const publication = await prisma.socialPublication.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (publication && !publication.mock && formData.get("confirmRealPublish") !== "1") {
    redirect(`/studio/publishing?id=${id}&error=${encodeURIComponent("Confirme a publicação real.")}`);
  }
  await publishNow(ctx.workspace.id, id);
  revalidatePath("/studio/publishing");
  revalidatePath("/studio/publishing/calendar");
  revalidatePath("/studio/publishing/queue");
  redirect("/studio/publishing/queue");
}

export async function retryPublicationAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("publicationId") ?? "");
  try {
    await retryPublication(ctx.workspace.id, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "retry";
    redirect(`/studio/publishing?id=${id}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/studio/publishing/queue");
  redirect("/studio/publishing/queue");
}

export async function cancelPublicationAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("publicationId") ?? "");
  try {
    await cancelPublication(ctx.workspace.id, id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "cancel";
    redirect(`/studio/publishing?id=${id}&error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/studio/publishing");
  revalidatePath("/studio/publishing/calendar");
  revalidatePath("/studio/publishing/queue");
  redirect("/studio/publishing");
}

export async function reschedulePublicationAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const id = String(formData.get("publicationId") ?? "");
  const scheduledRaw = String(formData.get("scheduledFor") ?? "");
  const timezone = String(formData.get("timezone") ?? "America/Sao_Paulo");
  if (!scheduledRaw) {
    redirect(`/studio/publishing/calendar?error=${encodeURIComponent("Informe a nova data")}`);
  }
  try {
    await updateUploadPostSchedule({
      workspaceId: ctx.workspace.id,
      publicationId: id,
      scheduledFor: new Date(scheduledRaw),
      timezone,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "reschedule";
    redirect(`/studio/publishing/calendar?error=${encodeURIComponent(message)}`);
  }
  revalidatePath("/studio/publishing/calendar");
  redirect("/studio/publishing/calendar");
}
