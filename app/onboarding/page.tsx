import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveOnboardingAction } from "@/app/onboarding/actions";
import { brand } from "@/lib/config/brand";
import type { PageSearchProps } from "@/types/routes";
import { redirect } from "next/navigation";
import { sessionGreetingName } from "@/lib/auth/identity";
import {
  ONBOARDING_GOALS,
  ONBOARDING_STEPS,
  clampOnboardingStep,
  onboardingPlans,
  onboardingPlatforms,
} from "@/lib/onboarding/config";

export default async function OnboardingPage({ searchParams }: PageSearchProps) {
  const user = await requireUser();
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (dbUser.onboardingCompleted) redirect("/studio");
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
    orderBy: { createdAt: "asc" },
  });
  const params = await searchParams;
  const step = clampOnboardingStep(params.step ?? dbUser.onboardingStep ?? 1);
  const selectedPlan = typeof params.plan === "string" ? params.plan : "FREE";
  const firstName = sessionGreetingName(dbUser);
  const selectedPlatforms = new Set((dbUser.userType ?? "").split(",").filter(Boolean));
  const plans = onboardingPlans();
  const platforms = onboardingPlatforms();

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-10">
      <p className="text-[12px] font-medium text-muted-foreground">
        Passo {step} de {ONBOARDING_STEPS} · {brand.name}
      </p>
      {step === 1 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Bem-vindo ao {brand.name}</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            {firstName
              ? `Olá, ${firstName}. Vamos preparar seu workspace em poucos passos.`
              : "Vamos preparar seu workspace em poucos passos."}
          </p>
        </>
      ) : null}
      {step === 2 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Nome do workspace</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Você pode alterar isso depois em Configurações.</p>
        </>
      ) : null}
      {step === 3 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Qual é o objetivo principal?</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">Usamos isso só para organizar a interface.</p>
        </>
      ) : null}
      {step === 4 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Quais plataformas você usa?</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Apenas as redes que o {brand.name} consegue publicar hoje. Você conecta as contas depois, sem senha social.
          </p>
        </>
      ) : null}
      {step === 5 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Escolha um plano</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            O plano Free já existe na conta. Planos pagos só mudam depois da confirmação do pagamento (Stripe em modo teste).
          </p>
        </>
      ) : null}
      {step === 6 ? (
        <>
          <h1 className="mt-2 text-[28px] font-semibold">Tudo pronto</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Seu workspace está configurado. O próximo passo é enviar um vídeo e gerar clips.
          </p>
        </>
      ) : null}

      <form action={saveOnboardingAction} className="mt-6 space-y-3">
        <input type="hidden" name="step" value={step} />
        {step === 2 ? (
          <div className="space-y-1.5">
            <Label htmlFor="workspaceName">Nome do workspace</Label>
            <Input
              id="workspaceName"
              name="workspaceName"
              required
              minLength={2}
              maxLength={80}
              defaultValue={membership?.workspace.name ?? (firstName ? `Workspace de ${firstName}` : "Meu workspace")}
            />
          </div>
        ) : null}
        {step === 3
          ? ONBOARDING_GOALS.map((goal) => (
              <label key={goal.value} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px]">
                <input
                  type="radio"
                  name="primaryGoal"
                  value={goal.value}
                  required
                  defaultChecked={dbUser.primaryGoal === goal.value}
                />
                {goal.label}
              </label>
            ))
          : null}
        {step === 4
          ? platforms.map((platform) => (
              <label key={platform.value} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-[13px]">
                <input type="checkbox" name="platforms" value={platform.value} defaultChecked={selectedPlatforms.has(platform.value)} />
                {platform.label}
              </label>
            ))
          : null}
        {step === 5
          ? plans.map((plan) => (
              <label key={plan.code} className="flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-[13px]">
                <input type="radio" name="plan" value={plan.code} required defaultChecked={plan.code === "FREE"} className="mt-1" />
                <span>
                  <span className="font-medium">
                    {plan.name} · {plan.price}
                  </span>
                  <span className="mt-0.5 block text-muted-foreground">
                    {plan.minutes} min/mês · {plan.clips} clips por projeto · {plan.accounts}{" "}
                    {plan.accounts === 1 ? "conta social" : "contas sociais"}
                  </span>
                </span>
              </label>
            ))
          : null}
        {step === 6 ? <input type="hidden" name="plan" value={selectedPlan} /> : null}
        <div className="flex pt-2">
          <Button type="submit" className="ml-auto">
            {step === ONBOARDING_STEPS ? "Ir para o dashboard" : "Continuar"}
          </Button>
        </div>
      </form>
    </div>
  );
}
