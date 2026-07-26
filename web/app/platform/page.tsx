"use client";

import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

/**
 * Painel do OPERADOR DA PLATAFORMA (quem vende o SaaS) — não é a área da
 * barbearia. Identidade e token próprios, guardados numa chave separada para
 * não se misturar com a sessão do lojista no mesmo navegador.
 */

const TOKEN_KEY = "platformToken";

interface Assinatura {
  status: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
}
interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CANCELED";
  createdAt: string;
  users: number;
  subscription?: Assinatura | null;
}
interface Stats {
  total: number;
  ativas: number;
  teste: number;
  suspensas: number;
  canceladas: number;
}

const CORES: Record<Tenant["status"], string> = {
  ACTIVE: "border-success/40 bg-success/10 text-success",
  TRIAL: "border-primary/40 bg-primary/10 text-primary",
  SUSPENDED: "border-danger/40 bg-danger/10 text-danger",
  CANCELED: "border-border bg-surface-2 text-muted-foreground",
};

export default function PlatformPage() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setToken(localStorage.getItem(TOKEN_KEY));
    setReady(true);
  }, []);

  if (!ready) return null;
  return token ? (
    <Dashboard token={token} onLogout={() => { localStorage.removeItem(TOKEN_KEY); setToken(null); }} />
  ) : (
    <Login onLogged={(t) => { localStorage.setItem(TOKEN_KEY, t); setToken(t); }} />
  );
}

function Login({ onLogged }: { onLogged: (t: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/platform/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) throw new Error("Credenciais inválidas");
      onLogged((await r.json()).accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Painel da Plataforma</div>
          <p className="mt-1 text-sm text-muted-foreground">Acesso do operador do SaaS</p>
        </div>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-muted-foreground">E-mail</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary" />
        </label>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm text-muted-foreground">Senha</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary" />
        </label>
        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        <button type="submit" disabled={loading}
          className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50">
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Operador criado via <code>npm run platform:admin</code>
        </p>
      </form>
    </div>
  );
}

function Dashboard({ token, onLogout }: { token: string; onLogout: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const call = useCallback(
    async (path: string, init?: RequestInit) => {
      const r = await fetch(`${API_BASE}/platform${path}`, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        onLogout();
        throw new Error("Sessão expirada");
      }
      if (!r.ok) throw new Error("Falha na operação");
      return r.json();
    },
    [token, onLogout],
  );

  const load = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        call("/stats"),
        call(`/tenants${search ? `?search=${encodeURIComponent(search)}` : ""}`),
      ]);
      setStats(s);
      setTenants(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }, [call, search]);

  useEffect(() => {
    void load();
  }, [load]);

  async function alterar(t: Tenant, acao: "suspend" | "reactivate") {
    const verbo = acao === "suspend" ? "suspender" : "reativar";
    if (!window.confirm(`Deseja ${verbo} "${t.name}"?`)) return;
    try {
      await call(`/tenants/${t.id}/${acao}`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Painel da Plataforma</h1>
          <p className="text-sm text-muted-foreground">Barbearias clientes</p>
        </div>
        <button onClick={onLogout} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:border-primary">
          Sair
        </button>
      </header>

      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card rotulo="Total" valor={stats.total} />
          <Card rotulo="Ativas" valor={stats.ativas} tom="text-success" />
          <Card rotulo="Em teste" valor={stats.teste} tom="text-primary" />
          <Card rotulo="Suspensas" valor={stats.suspensas} tom="text-danger" />
          <Card rotulo="Canceladas" valor={stats.canceladas} />
        </div>
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por nome ou slug..."
        className="mb-4 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary sm:w-80"
      />

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Barbearia</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Usuários</th>
              <th className="px-4 py-3">Cliente desde</th>
              <th className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">/{t.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${CORES[t.status]}`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3">{t.users}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(t.createdAt).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right">
                  {t.status === "SUSPENDED" ? (
                    <button onClick={() => alterar(t, "reactivate")}
                      className="rounded-lg border border-border px-3 py-1 text-xs hover:border-success hover:text-success">
                      Reativar
                    </button>
                  ) : (
                    <button onClick={() => alterar(t, "suspend")}
                      className="rounded-lg border border-border px-3 py-1 text-xs hover:border-danger hover:text-danger">
                      Suspender
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {tenants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhuma barbearia encontrada
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className={`mt-1 text-2xl font-semibold ${tom ?? ""}`}>{valor}</div>
    </div>
  );
}
