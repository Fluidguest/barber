"use client";

import Link from "next/link";
import type { NavItem as NavItemType } from "@/lib/nav";

/** Item de navegação folha (sem submódulos). */
export function NavItem({
  item,
  active,
  collapsed,
  badge,
}: {
  item: NavItemType;
  active: boolean;
  collapsed?: boolean;
  badge?: number;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        collapsed ? "justify-center" : ""
      } ${
        active
          ? "btn-gold font-medium"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      }`}
    >
      <Icon size={18} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && badge ? (
        <span className="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs font-semibold text-white">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      {collapsed && badge ? (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
      ) : null}
    </Link>
  );
}
