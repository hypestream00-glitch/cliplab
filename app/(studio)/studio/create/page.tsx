import { CreateProjectForm } from "@/app/(studio)/studio/create/create-form";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { getPlanLimits } from "@/lib/config/plans";
import { getWorkspacePlanCode, getMonthlyUsage, formatMinutesUsed } from "@/lib/billing/usage";
import { CreateHeroArt } from "@/components/create/hero-art";
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
      <div className="mb-8 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-9 font-semibold tracking-tight text-white">
            Criar clips com <span className="gradient-brand-text">IA</span> ✨
          </h1>
          <p className="mt-2 text-[15px] leading-6 text-text-secondary">
            Envie um vídeo e deixe a IA encontrar os melhores momentos.
          </p>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-text-secondary">
            <span>{formatMinutesUsed(usage.usedSeconds, limits.monthlyMinutes)}</span>
            <span aria-hidden className="text-magenta/70">•</span>
            <span>até {limits.maxClipsPerProject} clips</span>
            <span aria-hidden className="text-magenta/70">•</span>
            <span>{limits.maxResolution}</span>
          </p>
        </div>
        <CreateHeroArt />
      </div>
      {blocked ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-[16px] font-medium">Você atingiu o limite do seu plano.</p>
          <Link href="/studio/settings/billing" className="mt-3 inline-block text-[14px] text-primary hover:underline">
            Ver planos
          </Link>
        </div>
      ) : (
        <CreateProjectForm maxClipsPerProject={limits.maxClipsPerProject} />
      )}
    </div>
  );
}
