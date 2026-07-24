"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, setSession, logout as apiLogout, getToken, ApiError } from "@/lib/api";

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

/** Itens operacionais (todos os papéis). */
const MAIN_NAV: NavItem[] = [
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
  { href: "/security", label: "Segurança", icon: "⚿" },
];

/** Menu Administrador — funcionalidades administrativas centralizadas. */
const ADMIN_NAV: NavItem[] = [
  { href: "/users", label: "Usuários", icon: "☷", roles: ["ADMIN", "MANAGER"] },
  { href: "/barbers", label: "Barbeiros", icon: "♦", roles: ["ADMIN", "MANAGER"] },
  { href: "/audit", label: "Auditoria", icon: "⎘", roles: ["ADMIN", "MANAGER"] },
  { href: "/configuracoes", label: "Integrações", icon: "⚙", roles: ["ADMIN"] },
  { href: "/controle-geral", label: "Controle Geral", icon: "▣", roles: ["ADMIN"] },
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
    api<Me>("/auth/me").then(setMe).catch(() => {}).finally(() => setReady(true));
  }, [router]);

  function logout() {
    void apiLogout();
  }

  const canAdmin = me?.role === "ADMIN" || me?.role === "MANAGER";
  const visibleAdmin = ADMIN_NAV.filter((n) => !n.roles || (me && n.roles.includes(me.role)));

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        Carregando...
      </div>
    );
  }

  const renderLink = (n: NavItem) => {
    const active = pathname === n.href;
    return (
      <Link
        key={n.href}
        href={n.href}
        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
          active ? "bg-primary text-primary-fg" : "text-muted hover:bg-surface-2 hover:text-foreground"
        }`}
      >
        <span className="opacity-70">{n.icon}</span>
        {n.label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r border-border bg-surface p-4">
        <div className="mb-4 px-2 text-lg font-semibold">Barber SaaS</div>

        {/* Seletor de empresa (multiempresa) */}
        <CompanySwitcher />

        <nav className="flex flex-col gap-1">
          {MAIN_NAV.map(renderLink)}

          {canAdmin && visibleAdmin.length > 0 && (
            <>
              <div className="mt-4 px-3 text-xs font-medium uppercase tracking-wide text-muted">
                Administrador
              </div>
              {visibleAdmin.map(renderLink)}
            </>
          )}
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

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
  current: boolean;
}

/**
 * Seletor de empresa ativa (multiempresa). Só aparece quando a conta-dono tem
 * acesso a mais de uma empresa. Trocar reemite o token e recarrega a página.
 */
function CompanySwitcher() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    try {
      setCompanies(await api<Company[]>("/auth/companies"));
    } catch {
      // ignora
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const current = companies.find((c) => c.current);
  if (companies.length <= 1) {
    // Só uma empresa: mostra o nome, sem seletor.
    return current ? (
      <div className="mb-4 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
        {current.name}
      </div>
    ) : null;
  }

  async function switchTo(id: string) {
    if (switching) return;
    setSwitching(true);
    try {
      const s = await api<{ accessToken: string; tenantId: string }>(
        "/auth/switch-company",
        { method: "POST", body: JSON.stringify({ tenantId: id }) },
      );
      setSession({ accessToken: s.accessToken, tenantId: s.tenantId });
      window.location.href = "/dashboard"; // recarrega tudo sob a nova empresa
    } catch {
      setSwitching(false);
    }
  }

  return (
    <div className="relative mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:border-primary"
      >
        <span className="truncate">{current?.name ?? "Selecionar empresa"}</span>
        <span className="ml-2 text-xs text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
          {companies.map((c) => (
            <button
              key={c.id}
              onClick={() => (c.current ? setOpen(false) : switchTo(c.id))}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-2 ${
                c.current ? "text-primary" : ""
              }`}
            >
              <span className="truncate">{c.name}</span>
              {c.current && <span className="text-xs">●</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
