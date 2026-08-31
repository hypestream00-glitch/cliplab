import { visiblePublicationWhere } from "@/lib/data/visibility";
import type { Prisma } from "@/generated/prisma/client";

export function cliplabPublishedWhere(workspaceId: string): Prisma.SocialPublicationWhereInput {
  return {
    ...visiblePublicationWhere(workspaceId),
    status: "PUBLISHED",
  };
}

export function accountAnalyticsDisclaimer() {
  return "Métricas da conta social conectada. Incluem conteúdo publicado fora do CLIPLAB.";
}

export function cliplabViewsEmptyHint() {
  return "Os dados aparecerão depois que você publicar seus primeiros clips.";
}
