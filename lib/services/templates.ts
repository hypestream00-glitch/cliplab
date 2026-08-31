import { prisma } from "@/lib/db/prisma";
import type { AspectRatio } from "@/generated/prisma/client";

function ratioFromTemplate(canvas: unknown): AspectRatio {
  const value = typeof canvas === "object" && canvas && "ratio" in canvas ? String((canvas as { ratio?: string }).ratio) : "";
  if (value === "16:9") return "SIXTEEN_NINE";
  if (value === "1:1") return "ONE_ONE";
  if (value === "4:5") return "FOUR_FIVE";
  return "NINE_SIXTEEN";
}

export async function applyTemplateToClips(params: {
  workspaceId: string;
  templateId: string;
  clipIds: string[];
}) {
  const template = await prisma.template.findFirst({
    where: { id: params.templateId, workspaceId: params.workspaceId },
  });
  if (!template) throw new Error("Template não encontrado");
  const clips = await prisma.clip.findMany({
    where: { workspaceId: params.workspaceId, id: { in: params.clipIds } },
  });
  for (const clip of clips) {
    await prisma.editorProject.upsert({
      where: { clipId: clip.id },
      create: {
        workspaceId: params.workspaceId,
        clipId: clip.id,
        templateId: template.id,
        aspectRatio: ratioFromTemplate(template.canvas),
        canvasJson: template.canvas ?? {},
        captionStyle: template.captionStyle ?? {},
      },
      update: {
        templateId: template.id,
        canvasJson: template.canvas ?? {},
        captionStyle: template.captionStyle ?? {},
        aspectRatio: ratioFromTemplate(template.canvas),
      },
    });
  }
  return clips.length;
}
