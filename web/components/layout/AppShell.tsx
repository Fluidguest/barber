"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { Me } from "./UserMenu";

const RAIL_KEY = "sidebar:collapsed";

/**
 * Casca autenticada: guarda de sessão (/auth/me), sidebar agrupada colapsável,
 * topbar e área de conteúdo. Substitui a sidebar inline do antigo layout.tsx.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [whatsappUnread, setWhatsappUnread] = useState(0);

  useEffect(() => {
    setCollapsed(localStorage.getItem(RAIL_KEY) === "1");
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    api<Me>("/auth/me")
      .then(setMe)
      .catch(() => {})
      .finally(() => setReady(true));
  }, [router]);

  // Badge de não lidas (soma dos unreadCount das conversas).
  useEffect(() => {
    if (!me) return;
    api<{ unreadCount?: number }[]>("/whatsapp/conversations")
      .then((cs) => setWhatsappUnread(cs.reduce((n, c) => n + (c.unreadCount ?? 0), 0)))
      .catch(() => {});
  }, [me]);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(RAIL_KEY, next ? "1" : "0");
      return next;
    });
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Suspense fallback={<div className="w-60 border-r border-border bg-surface" />}>
        <Sidebar
          me={me}
          collapsed={collapsed}
          onToggle={toggle}
          whatsappUnread={whatsappUnread}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-14 border-b border-border" />}>
          <Topbar whatsappUnread={whatsappUnread} />
        </Suspense>
        <main className="flex-1 overflow-x-hidden p-6 lg:p-8">
          <Suspense fallback={<div className="text-sm text-muted-foreground">Carregando...</div>}>
            {children}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
