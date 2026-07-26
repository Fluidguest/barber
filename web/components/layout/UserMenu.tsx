"use client";

import { LogOut } from "lucide-react";
import { logout as apiLogout } from "@/lib/api";

export interface Me {
  name: string;
  email: string;
  role: string;
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gerente",
  RECEPTION: "Recepção",
  BARBER: "Barbeiro",
  FINANCE: "Financeiro",
  MARKETING: "Marketing",
};

export function UserMenu({ me, collapsed }: { me: Me | null; collapsed?: boolean }) {
  const initials = (me?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((p) => p.charAt(0))
    .join("")
    .toUpperCase();

  if (collapsed) {
    return (
      <div className="mt-auto flex flex-col items-center gap-2 border-t border-border pt-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-gradient text-sm font-semibold text-primary-fg">
          {initials}
        </div>
        <button
          onClick={() => void apiLogout()}
          title="Sair"
          className="rounded-lg p-2 text-muted-foreground transition hover:text-danger"
        >
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto border-t border-border pt-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold-gradient text-sm font-semibold text-primary-fg">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm">{me?.name ?? "—"}</div>
          <div className="truncate text-xs text-muted-foreground">
            {ROLE_LABEL[me?.role ?? ""] ?? me?.role}
          </div>
        </div>
      </div>
      <button
        onClick={() => void apiLogout()}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-border py-2 text-sm text-muted-foreground transition hover:border-danger/40 hover:text-danger"
      >
        <LogOut size={16} /> Sair
      </button>
    </div>
  );
}
