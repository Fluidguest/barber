"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { visibleNav } from "@/lib/nav";
import { NavItem } from "./NavItem";
import { NavGroup } from "./NavGroup";
import { CompanySwitcher } from "./CompanySwitcher";
import { UserMenu, type Me } from "./UserMenu";
import { Logo } from "./Logo";

export function Sidebar({
  me,
  collapsed,
  onToggle,
  whatsappUnread,
}: {
  me: Me | null;
  collapsed: boolean;
  onToggle: () => void;
  whatsappUnread: number;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const current = sp.toString() ? `${pathname}?${sp.toString()}` : pathname;
  const sections = visibleNav(me?.role);

  return (
    <aside
      className={`flex ${collapsed ? "w-16" : "w-60"} flex-col border-r border-border bg-surface p-3 transition-[width] duration-200`}
    >
      <div
        className={`mb-4 flex items-center px-1 ${collapsed ? "justify-center" : "justify-between gap-2"}`}
      >
        {!collapsed && <Logo />}
        <button
          onClick={onToggle}
          title={collapsed ? "Expandir" : "Recolher"}
          className="rounded-lg p-1.5 text-muted-foreground transition hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <CompanySwitcher collapsed={collapsed} />

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {sections.map((s) => (
          <div key={s.title} className="mb-2">
            {!collapsed && (
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.title}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              {s.items.map((item) =>
                item.children ? (
                  <NavGroup
                    key={item.href}
                    item={item}
                    active={pathname === item.href}
                    current={current}
                    collapsed={collapsed}
                  />
                ) : (
                  <div key={item.href} className="relative">
                    <NavItem
                      item={item}
                      active={pathname === item.href}
                      collapsed={collapsed}
                      badge={item.badge === "whatsapp" ? whatsappUnread : undefined}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <UserMenu me={me} collapsed={collapsed} />
    </aside>
  );
}
