"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { joinCompetition } from "@/lib/competitions/join";
import { createCompetitionSubmission } from "@/lib/competitions/submit";

export async function joinCompetitionAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const competitionId = String(formData.get("competitionId") ?? "");
  const result = await joinCompetition({
    competitionId,
    userId: ctx.user.id,
    workspaceId: ctx.workspace.id,
  });
  const slug = String(formData.get("slug") ?? "");
  if (!result.ok) {
    redirect(`/studio/competitions/${slug}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(`/studio/competitions/${slug}`);
  redirect(`/studio/competitions/${slug}`);
}

export async function submitCompetitionClipAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const slug = String(formData.get("slug") ?? "");
  const result = await createCompetitionSubmission({
    competitionId: String(formData.get("competitionId") ?? ""),
    userId: ctx.user.id,
    workspaceId: ctx.workspace.id,
    socialAccountId: String(formData.get("socialAccountId") ?? ""),
    publicationId: String(formData.get("publicationId") ?? "") || null,
    postUrl: String(formData.get("postUrl") ?? "") || null,
  });
  if (!result.ok) {
    redirect(`/studio/competitions/${slug}?error=${encodeURIComponent(result.error)}`);
  }
  revalidatePath(`/studio/competitions/${slug}`);
  redirect(`/studio/competitions/${slug}/me`);
}
