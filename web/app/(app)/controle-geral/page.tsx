"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError, setSession } from "@/lib/api";

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  role: string;
  current: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  TRIAL: "Em teste",
  ACTIVE: "Ativa",
  SUSPENDED: "Suspensa",
  CANCELED: "Cancelada",
};

/**
 * Controle Geral (multiempresa): as barbearias às quais a conta-dono tem
 * acesso. Permite cadastrar novas, renomear e alternar entre elas. Os dados de
 * cada empresa são isolados (RLS) — trocar aqui muda a empresa ativa.
 */
export default function ControleGeralPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [error, setError] = useState("");

  // Nova empresa
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [creating, setCreating] = useState(false);

  // Renomear
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  const load = useCallback(async () => {
    try {
      setCompanies(await api<Company[]>("/auth/companies"));
    } catch (e) {
      fail(e);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !newSlug.trim()) return;
    setCreating(true);
    setError("");
    try {
      await api("/auth/companies", {
        method: "POST",
        body: JSON.stringify({ barbershopName: newName.trim(), slug: newSlug.trim() }),
      });
      setNewName("");
      setNewSlug("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setCreating(false);
    }
  }

  async function saveRename(id: string) {
    if (!renameValue.trim()) return;
    setError("");
    try {
      await api(`/auth/companies/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenameId(null);
      setRenameValue("");
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function switchTo(id: string) {
    setError("");
    try {
      const s = await api<{ accessToken: string; tenantId: string }>(
        "/auth/switch-company",
        { method: "POST", body: JSON.stringify({ tenantId: id }) },
      );
      setSession({ accessToken: s.accessToken, tenantId: s.tenantId });
      window.location.href = "/dashboard";
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Controle Geral</h1>
      <p className="mb-6 text-sm text-muted">
        Empresas às quais você tem acesso. Os dados de cada uma são isolados.
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Cadastrar nova empresa */}
      <form
        onSubmit={createCompany}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <div className="text-sm font-medium">Nova empresa</div>
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted">Nome</span>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Barbearia Filial 2"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="w-48">
          <span className="mb-1 block text-xs text-muted">Slug (link público)</span>
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
            placeholder="filial-2"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {creating ? "Criando..." : "Criar empresa"}
        </button>
      </form>

      {/* Lista de empresas */}
      <div className="flex flex-col gap-3">
        {companies.map((c) => (
          <div
            key={c.id}
            className={`flex items-center gap-4 rounded-xl border p-4 ${
              c.current ? "border-primary bg-primary/5" : "border-border bg-surface"
            }`}
          >
            <div className="flex-1">
              {renameId === c.id ? (
                <div className="flex items-center gap-2">
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
                    autoFocus
                  />
                  <button
                    onClick={() => saveRename(c.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-primary"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setRenameId(null)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    cancelar
                  </button>
                </div>
              ) : (
                <>
                  <div className="font-medium">
                    {c.name}
                    {c.current && (
                      <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                        atual
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted">
                    /{c.slug} · {STATUS_LABEL[c.status] ?? c.status} · seu papel: {c.role}
                  </div>
                </>
              )}
            </div>

            {renameId !== c.id && (
              <>
                {!c.current && (
                  <button
                    onClick={() => switchTo(c.id)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-fg hover:opacity-90"
                  >
                    Acessar
                  </button>
                )}
                <button
                  onClick={() => { setRenameId(c.id); setRenameValue(c.name); }}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-primary hover:text-foreground"
                >
                  renomear
                </button>
              </>
            )}
          </div>
        ))}
        {companies.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
            Nenhuma empresa
          </div>
        )}
      </div>
    </div>
  );
}
