"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { createApiKey, revokeApiKey } from "@/lib/services/api-keys";

export async function createApiKeyAction(_prev: { error?: string; secret?: string } | null, formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Informe um nome para a chave." };
  }
  const scopes = formData.getAll("scopes").map(String).filter(Boolean);
  const { secret } = await createApiKey({
    workspaceId: ctx.workspace.id,
    userId: ctx.user.id,
    name,
    scopes: scopes.length > 0 ? scopes : ["clips:read", "projects:write"],
  });
  revalidatePath("/studio/api");
  return { secret };
}

export async function revokeApiKeyAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  await revokeApiKey(ctx.workspace.id, String(formData.get("keyId") ?? ""));
  revalidatePath("/studio/api");
}
