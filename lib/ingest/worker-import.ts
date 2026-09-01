import { prisma } from "@/lib/db/prisma";
import { getPlanLimits } from "@/lib/config/plans";
import { getMonthlyUsage } from "@/lib/billing/usage";
import { IngestError, ingestErrorMessage } from "@/lib/ingest/errors";
import { classifyIngestUrl } from "@/lib/ingest/classify";
import { getMediaImportProvider } from "@/lib/ingest/providers";
import type { SourceKind } from "@/generated/prisma/client";

export async function ingestPendingSourceVideo(params: {
  projectId: string;
  workspaceId: string;
  source: {
    id: string;
    kind: SourceKind;
    sourceUrl: string | null;
    storageKey: string | null;
  };
}) {
  if (params.source.storageKey) return params.source.storageKey;
  if (!params.source.sourceUrl) {
    throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  }
  const classified = classifyIngestUrl(params.source.sourceUrl);
  if (!classified) throw new IngestError(ingestErrorMessage("invalid-url"), "invalid-url");
  const provider = getMediaImportProvider(classified.provider);
  if (!provider.canImport(classified) || !provider.importMedia) {
    throw new IngestError(ingestErrorMessage("import-unavailable"), "import-unavailable");
  }
  const usage = await getMonthlyUsage(params.workspaceId);
  const limits = getPlanLimits(usage.effectivePlanCode);
  const imported = await provider.importMedia(classified, {
    workspaceId: params.workspaceId,
    maxBytes: limits.maxFileSizeBytes,
  });
  await prisma.sourceVideo.update({
    where: { id: params.source.id },
    data: {
      storageKey: imported.storageKey,
      mimeType: imported.mimeType,
      sizeBytes: imported.sizeBytes,
      originalName: imported.filename,
      sourceUrl: imported.finalUrl,
    },
  });
  return imported.storageKey;
}
