import { PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { saveNotificationPrefsAction } from "@/app/(studio)/studio/settings/actions";
import { parseNotificationPrefs } from "@/lib/notifications/prefs";
import { requireWorkspaceContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { PageSearchProps } from "@/types/routes";

export const metadata = { title: "Notificações" };

const FIELDS = [
  ["clipsReady", "Processamento concluído"],
  ["processingFailed", "Falha de processamento"],
  ["publishing", "Publicação"],
  ["creditsLow", "Limite de uso"],
  ["billing", "Cobrança e plano"],
  ["teamInvites", "Convites de equipe"],
] as const;

export default async function NotificationsSettingsPage({ searchParams }: PageSearchProps) {
  const { user } = await requireWorkspaceContext();
  const params = await searchParams;
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const prefs = parseNotificationPrefs(dbUser.notificationPrefs);
  const saved = params.saved === "1";

  return (
    <div>
      <PageHeader title="Notificações" description="Preferências gravadas no usuário. O sino do studio respeita esses flags." />
      {saved ? <p className="mb-3 text-[12px] text-emerald-300">Preferências salvas.</p> : null}
      <form action={saveNotificationPrefsAction} className="max-w-md space-y-3 text-[13px]">
        {FIELDS.map(([name, label]) => (
          <label key={name} className="flex items-center justify-between rounded-lg border px-3 py-2">
            <span>{label}</span>
            <input
              type="checkbox"
              name={name}
              defaultChecked={prefs[name] ?? name !== "teamInvites"}
              className="size-3.5 accent-primary"
            />
          </label>
        ))}
        <Button type="submit">Salvar preferências</Button>
      </form>
    </div>
  );
}
