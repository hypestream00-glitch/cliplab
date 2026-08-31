import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageHeader, StatusBadge, EmptyState } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { retryPublicationAction, publishNowAction, cancelPublicationAction } from "@/app/(studio)/studio/publishing/actions";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { visiblePublicationWhere } from "@/lib/data/visibility";

export const metadata = { title: "Fila" };

export default async function QueuePage() {
  const { workspace } = await requireWorkspaceContext();
  const posts = await prisma.socialPublication.findMany({
    where: { ...visiblePublicationWhere(workspace.id), status: { in: ["QUEUED", "UPLOADING", "PROCESSING", "FAILED"] } },
    include: { clip: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader title="Fila" description="Acompanhe o envio dos seus clips." />
      {posts.length === 0 ? (
        <EmptyState
          title="Fila vazia."
          description="Nenhuma publicação ainda. Quando você publicar seu primeiro clip, os resultados aparecerão aqui."
          actionLabel="Publicação"
          actionHref="/studio/publishing"
        />
      ) : (
        <div className="divide-y rounded-lg border">
          {posts.map((post) => (
            <div key={post.id} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
              <Link href={`/studio/publishing?id=${post.id}`} className="truncate hover:underline">
                {post.clip?.title ?? post.caption}
              </Link>
              <div className="flex items-center gap-2">
                <StatusBadge status={post.status} />
                {post.status === "FAILED" ? (
                  <form action={retryPublicationAction}>
                    <input type="hidden" name="publicationId" value={post.id} />
                    <Button size="xs" variant="outline" type="submit">
                      Tentar de novo
                    </Button>
                  </form>
                ) : post.mock ? (
                  <form action={publishNowAction}>
                    <input type="hidden" name="publicationId" value={post.id} />
                    <Button size="xs" variant="outline" type="submit">
                      Processar
                    </Button>
                  </form>
                ) : (
                  <ConfirmSubmit
                    action={publishNowAction}
                    name="publicationId"
                    value={post.id}
                    extra={{ confirmRealPublish: "1" }}
                    label="Processar"
                    confirmLabel="Publicar agora"
                    message="Publicar este clip nesta conta?"
                    size="xs"
                    variant="outline"
                  />
                )}
                {post.status === "QUEUED" ? (
                  <ConfirmSubmit
                    action={cancelPublicationAction}
                    name="publicationId"
                    value={post.id}
                    label="Cancelar"
                    destructive
                    size="xs"
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
