"use client";

import { useCallback, useEffect, useState } from "react";
import { api, setSession } from "@/lib/api";

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
  current: boolean;
}

/**
 * Seletor de empresa ativa (multiempresa). Extraído do antigo layout.tsx.
 * Só vira dropdown quando a conta-dono tem acesso a mais de uma empresa.
 */
export function CompanySwitcher({ collapsed }: { collapsed?: boolean }) {
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

  async function switchTo(id: string) {
    if (switching) return;
    setSwitching(true);
    try {
      const s = await api<{ accessToken: string; tenantId: string }>(
        "/auth/switch-company",
        { method: "POST", body: JSON.stringify({ tenantId: id }) },
      );
      setSession({ accessToken: s.accessToken, tenantId: s.tenantId });
      window.location.href = "/home";
    } catch {
      setSwitching(false);
    }
  }

  if (collapsed) {
    // No modo rail mostramos só a inicial da empresa.
    return current ? (
      <div className="mb-3 flex h-9 items-center justify-center rounded-lg border border-border bg-surface-2 text-sm font-semibold text-primary">
        {current.name.charAt(0)}
      </div>
    ) : null;
  }

  if (companies.length <= 1) {
    return current ? (
      <div className="mb-3 truncate rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm">
        {current.name}
      </div>
    ) : null;
  }

  return (
    <div className="relative mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm hover:border-primary"
      >
        <span className="truncate">{current?.name ?? "Selecionar empresa"}</span>
        <span className="ml-2 text-xs text-muted-foreground">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
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
