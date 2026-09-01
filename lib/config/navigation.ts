import type { LucideIcon } from "lucide-react";
import {
  Home,
  Sparkles,
  FolderKanban,
  Scissors,
  Send,
  CalendarDays,
  Share2,
  BarChart3,
  Coins,
  Settings,
  ListTodo,
  Bot,
  Library,
  Clapperboard,
  LayoutTemplate,
  Radio,
  Trophy,
  Users,
  KeyRound,
  Plus,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
};

export type NavGroup = {
  id: string;
  label?: string;
  items: NavItem[];
};

export const studioNavGroups: NavGroup[] = [
  {
    id: "main",
    items: [
      { href: "/studio", label: "Dashboard", icon: Home },
      { href: "/studio/projects", label: "Projetos", icon: FolderKanban },
      { href: "/studio/clips", label: "Meus clips", icon: Scissors },
      { href: "/studio/create", label: "Criar", icon: Sparkles },
      { href: "/studio/publishing", label: "Publicar", icon: Send },
      { href: "/studio/calendar", label: "Calendário", icon: CalendarDays },
      { href: "/studio/accounts", label: "Contas sociais", icon: Share2 },
    ],
  },
  {
    id: "insights",
    items: [
      { href: "/studio/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/studio/settings/billing", label: "Plano e uso", icon: Coins },
    ],
  },
  {
    id: "settings",
    items: [{ href: "/studio/settings", label: "Configurações", icon: Settings }],
  },
];

export const studioMoreItems: NavItem[] = [
  { href: "/studio/library", label: "Biblioteca", icon: Library },
  { href: "/studio/editor", label: "Editor", icon: Clapperboard },
  { href: "/studio/templates", label: "Modelos", icon: LayoutTemplate },
  { href: "/studio/publishing/queue", label: "Fila", icon: ListTodo },
  { href: "/studio/publishing/autopilot", label: "Autopilot", icon: Bot },
  { href: "/studio/live", label: "Live", icon: Radio },
  { href: "/studio/championships", label: "Campeonatos", icon: Trophy },
  { href: "/studio/team", label: "Equipe", icon: Users },
  { href: "/studio/api", label: "API", icon: KeyRound },
];

export const studioNav: NavItem[] = [
  ...studioNavGroups.flatMap((group) => group.items),
  ...studioMoreItems,
];

export const createProjectNavItem: NavItem = {
  href: "/studio/create",
  label: "Novo projeto",
  icon: Plus,
};

export const editorNavItem: NavItem = {
  href: "/studio/clips",
  label: "Editor",
  icon: Clapperboard,
};

export const settingsNav = [
  { href: "/studio/settings/account", label: "Conta" },
  { href: "/studio/settings/profile", label: "Perfil" },
  { href: "/studio/settings/workspace", label: "Workspace" },
  { href: "/studio/settings/billing", label: "Plano e uso" },
  { href: "/studio/credits", label: "Histórico de créditos" },
  { href: "/studio/settings/integrations", label: "Integrações" },
  { href: "/studio/settings/status", label: "Diagnóstico" },
  { href: "/studio/settings/notifications", label: "Notificações" },
  { href: "/studio/settings/security", label: "Segurança" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: Home },
  { href: "/admin/users", label: "Usuários", icon: Users },
  { href: "/admin/workspaces", label: "Workspaces", icon: FolderKanban },
  { href: "/admin/jobs", label: "Jobs", icon: Clapperboard },
  { href: "/admin/billing", label: "Billing", icon: BarChart3 },
];
