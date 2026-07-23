"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, logout as apiLogout, getToken, ApiError } from "@/lib/api";

interface Me {
  name: string;
  email: string;
  role: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: string;
  roles?: string[]; // se definido, só esses papéis veem o item
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▨" },
  { href: "/reports", label: "Relatórios", icon: "⊞" },
  { href: "/agenda", label: "Agenda", icon: "▤" },
  { href: "/conversas", label: "Conversas", icon: "✉" },
  { href: "/pos", label: "Caixa / PDV", icon: "$" },
  { href: "/finance", label: "Financeiro", icon: "◈" },
  { href: "/commissions", label: "Comissões", icon: "%" },
  { href: "/stock", label: "Estoque", icon: "▧" },
  { href: "/clients", label: "Clientes", icon: "☺" },
  { href: "/services", label: "Serviços", icon: "✂" },
  { href: "/barbers", label: "Barbeiros", icon: "♦" },
  { href: "/users", label: "Usuários", icon: "☷", roles: ["ADMIN", "MANAGER"] },
  { href: "/audit", label: "Auditoria", icon: "⎘", roles: ["ADMIN", "MANAGER"] },
  { href: "/configuracoes", label: "Configurações", icon: "⚙", roles: ["ADMIN"] },
  { href: "/security", label: "Segurança", icon: "⚿" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/auth/me")
      .then(setMe)
      .catch((e) => {
        if (e instanceof ApiError && e.status === 402) {
          // suspenso: /auth/me é @AllowSuspended, então não deveria cair aqui
        }
      })
      .finally(() => setReady(true));
  }, [router]);

  function logout() {
    // Revoga o refresh no backend + limpa o cookie httpOnly, depois redireciona.
    void apiLogout();
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-surface p-4">
        <div className="mb-8 px-2 text-lg font-semibold">Barber SaaS</div>
        <nav className="flex flex-col gap-1">
          {NAV.filter((n) => !n.roles || (me && n.roles.includes(me.role))).map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "bg-primary text-primary-fg"
                    : "text-muted hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <span className="opacity-70">{n.icon}</span>
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-border pt-4">
          <div className="px-2 text-sm">{me?.name ?? "—"}</div>
          <div className="px-2 text-xs text-muted">{me?.role}</div>
          <button
            onClick={logout}
            className="mt-3 w-full rounded-lg border border-border py-2 text-sm text-muted transition hover:text-foreground"
          >
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden p-8">{children}</main>
    </div>
  );
}
