import type { LucideIcon } from "lucide-react";
import {
  Home,
  LayoutDashboard,
  Users,
  CalendarDays,
  MessageSquare,
  DollarSign,
  Percent,
  Package,
  Scissors,
  UserCog,
  Wallet,
  BarChart3,
  ClipboardList,
  Settings,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

/** Submódulo (deep-link, normalmente uma aba `?tab=` da própria página). */
export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Se definido, só estes papéis veem o item. */
  roles?: string[];
  /** Fonte de um badge dinâmico (ex.: não lidas do WhatsApp). */
  badge?: "whatsapp";
  /** Submódulos colapsáveis. */
  children?: NavChild[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Arquitetura de navegação (módulo → submódulo), derivada dos módulos reais do
 * backend. Fonte única do sidebar e do título da topbar. Os papéis por item
 * refletem o RBAC (ver users/roles). Submódulos usam `?tab=` nas páginas que já
 * têm abas (ex.: Relatórios), sem inventar rotas novas.
 */
export const NAV: NavSection[] = [
  {
    title: "Principal",
    items: [
      { href: "/home", label: "Home", icon: Home },
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/clients", label: "Clientes", icon: Users },
      { href: "/agenda", label: "Agenda", icon: CalendarDays },
      { href: "/conversas", label: "Conversas", icon: MessageSquare, badge: "whatsapp" },
    ],
  },
  {
    title: "Operacional",
    items: [
      { href: "/pos", label: "Caixa / PDV", icon: DollarSign },
      { href: "/commissions", label: "Comissões", icon: Percent },
      {
        href: "/stock",
        label: "Estoque",
        icon: Package,
        children: [
          { href: "/stock", label: "Produtos" },
          { href: "/stock?tab=alerts", label: "Alertas" },
        ],
      },
      { href: "/services", label: "Serviços", icon: Scissors },
      { href: "/barbers", label: "Barbeiros", icon: UserCog, roles: ["ADMIN", "MANAGER"] },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { href: "/finance", label: "Financeiro", icon: Wallet },
      {
        href: "/reports",
        label: "Relatórios",
        icon: BarChart3,
        children: [
          { href: "/reports?tab=dre", label: "DRE" },
          { href: "/reports?tab=barbers", label: "Ranking de barbeiros" },
          { href: "/reports?tab=abc", label: "Curva ABC" },
          { href: "/reports?tab=inactive", label: "Clientes inativos" },
        ],
      },
    ],
  },
  {
    title: "Administração",
    items: [
      { href: "/users", label: "Usuários", icon: Users, roles: ["ADMIN", "MANAGER"] },
      { href: "/audit", label: "Auditoria", icon: ClipboardList, roles: ["ADMIN", "MANAGER"] },
      { href: "/configuracoes", label: "Integrações", icon: Settings, roles: ["ADMIN"] },
      { href: "/security", label: "Segurança", icon: Shield },
      { href: "/controle-geral", label: "Controle Geral", icon: SlidersHorizontal, roles: ["ADMIN"] },
    ],
  },
];

/** Só as seções/itens visíveis para o papel (RBAC). Seção sem item some. */
export function visibleNav(role: string | undefined): NavSection[] {
  return NAV.map((s) => ({
    ...s,
    items: s.items.filter((i) => !i.roles || (role && i.roles.includes(role))),
  })).filter((s) => s.items.length > 0);
}

/** Título da página a partir da rota (ignora query). */
export function pageTitle(pathname: string): string {
  for (const s of NAV) {
    for (const i of s.items) {
      if (i.href === pathname) return i.label;
    }
  }
  return "Barber SaaS";
}
