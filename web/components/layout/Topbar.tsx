"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell } from "lucide-react";
import { pageTitle } from "@/lib/nav";

export function Topbar({ whatsappUnread }: { whatsappUnread: number }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    if (term) router.push(`/clients?search=${encodeURIComponent(term)}`);
  }

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-6 py-3 backdrop-blur">
      <h1 className="font-display text-lg uppercase">{pageTitle(pathname)}</h1>

      <div className="ml-auto flex items-center gap-3">
        <form onSubmit={submit} className="relative hidden sm:block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clientes..."
            className="w-56 rounded-lg border border-border bg-surface-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </form>

        <Link
          href="/conversas"
          title="Conversas"
          className="relative rounded-lg p-2 text-muted-foreground transition hover:text-foreground"
        >
          <Bell size={18} />
          {whatsappUnread > 0 && (
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" />
          )}
        </Link>
      </div>
    </header>
  );
}
