import { redirect } from "next/navigation";
import Link from "next/link";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { visibleClipLibraryWhere } from "@/lib/data/visibility";

export const metadata = { title: "Editor" };

export default async function EditorIndexPage() {
  const { workspace } = await requireWorkspaceContext();
  const clip = await prisma.clip.findFirst({
    where: visibleClipLibraryWhere(workspace.id),
    orderBy: { createdAt: "desc" },
  });
  if (clip) {
    redirect(`/studio/editor/${clip.id}`);
  }
  return (
    <div>
      <PageHeader title="Editor" description="Abra um clipe para editar canvas, legendas e timeline." />
      <EmptyState
        title="Nenhum clipe para editar."
        description="Gere clipes em um projeto para abrir o editor."
        actionLabel="Criar projeto"
        actionHref="/studio/create"
      />
      <div className="mt-4">
        <Button asChild variant="outline">
          <Link href="/studio/clips">Ver clipes</Link>
        </Button>
      </div>
    </div>
  );
}
