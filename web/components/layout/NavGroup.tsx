"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { NavItem as NavItemType } from "@/lib/nav";

/**
 * Módulo com submódulos: o cabeçalho é um Link para a página do módulo; o
 * chevron expande/colapsa os submódulos (não navega). No modo rail vira só o
 * ícone (Link), sem submódulos.
 */
export function NavGroup({
  item,
  active,
  current,
  collapsed,
}: {
  item: NavItemType;
  active: boolean;
  current: string; // pathname + query, p/ marcar o submódulo ativo
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  const childActive = item.children?.some((c) => c.href === current) ?? false;
  const [open, setOpen] = useState(active || childActive);

  if (collapsed) {
    return (
      <Link
        href={item.href}
        title={item.label}
        className={`flex items-center justify-center rounded-lg px-3 py-2 text-sm transition ${
          active || childActive
            ? "btn-gold font-medium"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <Icon size={18} />
      </Link>
    );
  }

  return (
    <div>
      <div
        className={`flex items-center gap-3 rounded-lg pr-1 text-sm transition ${
          active
            ? "btn-gold font-medium"
            : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <Link href={item.href} className="flex flex-1 items-center gap-3 py-2 pl-3">
          <Icon size={18} className="shrink-0" />
          <span className="flex-1 truncate">{item.label}</span>
        </Link>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Recolher" : "Expandir"}
          className="rounded p-1 hover:bg-black/10"
        >
          <ChevronDown
            size={16}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && (
        <div className="mt-1 flex flex-col gap-0.5 border-l border-border pl-3 ml-4">
          {item.children!.map((c) => {
            const on = c.href === current;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  on
                    ? "text-primary"
                    : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
