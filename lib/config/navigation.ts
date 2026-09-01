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
  Flame,
  Gift,
  Banknote,
  Medal,
  Palette,
  Briefcase,
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
    label: "Principal",
    items: [
      { href: "/studio", label: "Dashboard", icon: Home },
      { href: "/studio/trending", label: "Em alta", icon: Flame },
      { href: "/studio/projects", label: "Projetos", icon: FolderKanban },
      { href: "/studio/clips", label: "Meus clips", icon: Scissors },
      { href: "/studio/create", label: "Criar", icon: Sparkles },
    ],
  },
  {
    id: "publishing",
    label: "Publicação",
    items: [
      { href: "/studio/publishing", label: "Publicar", icon: Send },
      { href: "/studio/calendar", label: "Calendário", icon: CalendarDays },
      { href: "/studio/accounts", label: "Contas sociais", icon: Share2 },
    ],
  },
  {
    id: "compete",
    label: "Competir",
    items: [
      { href: "/studio/competitions", label: "Campeonatos", icon: Trophy },
      { href: "/studio/ranking", label: "Ranking", icon: Medal },
      { href: "/studio/competitions/me", label: "Minhas participações", icon: Users },
    ],
  },
  {
    id: "tools",
    label: "Ferramentas",
    items: [
      { href: "/studio/templates", label: "Templates", icon: LayoutTemplate },
      { href: "/studio/brand-kit", label: "Brand Kit", icon: Palette },
      { href: "/studio/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/studio/live", label: "Clipping ao vivo", icon: Radio },
    ],
  },
  {
    id: "account",
    label: "Conta",
    items: [
      { href: "/studio/settings/billing", label: "Plano e uso", icon: Coins },
      { href: "/studio/referrals", label: "Indique e ganhe", icon: Gift },
      { href: "/studio/clients", label: "Clientes", icon: Briefcase },
      { href: "/studio/settings", label: "Configurações", icon: Settings },
    ],
  },
];

export const studioMoreItems: NavItem[] = [
  { href: "/studio/library", label: "Biblioteca", icon: Library },
  { href: "/studio/editor", label: "Editor", icon: Clapperboard },
  { href: "/studio/publishing/queue", label: "Fila", icon: ListTodo },
  { href: "/studio/publishing/autopilot", label: "Autopilot", icon: Bot },
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
  { href: "/admin/competitions", label: "Campeonatos", icon: Trophy },
  { href: "/admin/trending", label: "Em alta", icon: Flame },
  { href: "/admin/billing", label: "Billing", icon: BarChart3 },
  { href: "/admin/affiliates", label: "Afiliados", icon: Gift },
  { href: "/admin/affiliates/withdrawals", label: "Saques", icon: Banknote },
];
