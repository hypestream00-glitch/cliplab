"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";

const labels: Record<string, string> = {
  studio: "Dashboard",
  create: "Criar",
  projects: "Projetos",
  clips: "Meus clips",
  editor: "Editor",
  templates: "Modelos",
  publishing: "Publicar",
  calendar: "Calendário",
  queue: "Fila",
  accounts: "Contas sociais",
  metrics: "Analytics",
  analytics: "Analytics",
  credits: "Créditos",
  content: "Conteúdo",
  live: "Live",
  channels: "Canais",
  championships: "Campeonatos",
  new: "Novo",
  team: "Equipe",
  api: "API",
  settings: "Configurações",
  profile: "Perfil",
  workspace: "Workspace",
  billing: "Plano",
  integrations: "Integrações",
  status: "Diagnóstico",
  security: "Segurança",
  notifications: "Notificações",
  admin: "Admin",
  users: "Usuários",
  jobs: "Jobs",
};

export function AppBreadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return null;

  return (
    <nav className="hidden items-center gap-1 text-[12px] text-muted-foreground sm:flex">
      {parts.map((part, index) => {
        const href = "/" + parts.slice(0, index + 1).join("/");
        const isLast = index === parts.length - 1;
        const label = labels[part] ?? (part.length > 12 ? part.slice(0, 8) + "…" : part);
        return (
          <Fragment key={href}>
            {index > 0 && <ChevronRight className="size-3" />}
            {isLast ? (
              <span className="text-foreground">{label}</span>
            ) : (
              <Link href={href} className="hover:text-foreground">
                {label}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
