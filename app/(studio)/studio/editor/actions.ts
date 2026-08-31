"use server";

import { revalidatePath } from "next/cache";
import { Readable } from "node:stream";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { saveEditorProject } from "@/lib/services/editor";
import { randomStorageKey, mediaUrl } from "@/lib/storage";
import { putUploadStream } from "@/lib/storage/materialize";
import type { EditorCanvasState } from "@/lib/editor/state";

export async function saveEditorStateAction(payload: {
  clipId: string;
  aspectRatio: string;
  captionPreset: string;
  captionStyle: Record<string, unknown>;
  canvas: EditorCanvasState | Record<string, unknown>;
  templateId?: string | null;
  createRevision?: boolean;
  title?: string;
  suggestedCaption?: string;
  hashtags?: string[];
}) {
  const ctx = await requireWorkspaceContext();
  await saveEditorProject({
    workspaceId: ctx.workspace.id,
    clipId: payload.clipId,
    aspectRatio: payload.aspectRatio,
    captionPreset: payload.captionPreset,
    captionStyle: payload.captionStyle,
    canvas: payload.canvas,
    templateId: payload.templateId,
    createRevision: payload.createRevision,
    title: payload.title,
    suggestedCaption: payload.suggestedCaption,
    hashtags: payload.hashtags,
  });
  revalidatePath(`/studio/editor/${payload.clipId}`);
  return { ok: true as const };
}

export async function uploadOverlayImageAction(formData: FormData) {
  const ctx = await requireWorkspaceContext();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return { error: "Selecione uma imagem PNG, JPG ou WEBP." };
  }
  if (file.size > 8 * 1024 * 1024) {
    return { error: "Imagem maior que 8 MB." };
  }
  const type = file.type.toLowerCase();
  if (!["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    return { error: "Formato de imagem inválido." };
  }
  const key = randomStorageKey(file.name, `overlays/${ctx.workspace.id}`);
  const stream = Readable.fromWeb(file.stream() as import("node:stream/web").ReadableStream);
  await putUploadStream(key, stream, type || "image/png");
  return { storageKey: key, url: mediaUrl(key) };
}
