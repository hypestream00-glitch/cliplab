import { PageHeader } from "@/components/dashboard/primitives";
import { CreateProjectForm } from "@/app/(studio)/studio/create/create-form";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/config/plans";
import { getWorkspacePlanCode, getMonthlyUsage, formatMinutesUsed } from "@/lib/billing/usage";
import Link from "next/link";

export const metadata = { title: "Criar clips" };

export default async function CreateProjectPage() {
  const { workspace } = await requireWorkspaceContext();
  const planCode = await getWorkspacePlanCode(workspace.id);
  const limits = getPlanLimits(planCode);
  const usage = await getMonthlyUsage(workspace.id);
  const blocked = usage.remainingSeconds <= 0;
  return (
    <div>
      <PageHeader
        title="Criar clips com IA"
        description="Envie um vídeo e deixe a IA encontrar os melhores momentos."
      />
      <p className="mb-4 text-[13px] text-muted-foreground">
        {formatMinutesUsed(usage.usedSeconds, limits.monthlyMinutes)} · até {limits.maxClipsPerProject} clips · {limits.maxResolution}
      </p>
      {blocked ? (
        <div className="rounded-2xl border bg-card p-6 text-center">
          <p className="text-[15px] font-medium">Você atingiu o limite do seu plano.</p>
          <Link href="/studio/settings/billing" className="mt-3 inline-block text-[13px] text-primary hover:underline">
            Ver planos
          </Link>
        </div>
      ) : (
        <CreateProjectForm maxClipsPerProject={limits.maxClipsPerProject} />
      )}
    </div>
  );
}
