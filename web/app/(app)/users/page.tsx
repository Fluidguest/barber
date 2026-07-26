"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  totpEnabled: boolean;
}

const ROLES: [string, string][] = [
  ["ADMIN", "Administrador"],
  ["MANAGER", "Gerente"],
  ["RECEPTION", "Recepção"],
  ["BARBER", "Barbeiro"],
  ["FINANCE", "Financeiro"],
  ["MARKETING", "Marketing"],
];
const roleLabel = (r: string) => ROLES.find(([v]) => v === r)?.[1] ?? r;

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("RECEPTION");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load() {
    try {
      setUsers(await api<User[]>("/users"));
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Preencha nome, e-mail e senha (mín. 8 caracteres).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ name, email, password, role }),
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("RECEPTION");
      setOpen(false);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function patch(id: string, data: Record<string, unknown>) {
    setError("");
    try {
      await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function resetPassword(id: string) {
    const pw = window.prompt("Nova senha (mín. 8 caracteres):");
    if (!pw) return;
    if (pw.length < 8) {
      setError("Senha muito curta.");
      return;
    }
    await patch(id, { password: pw });
    window.alert("Senha redefinida.");
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este usuário?")) return;
    setError("");
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">{users.length} cadastrados</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          {open ? "Fechar" : "Novo usuário"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {open && (
        <form
          onSubmit={create}
          className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">E-mail</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Senha</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Perfil</span>
            <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary">
              {ROLES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button type="submit" disabled={saving} className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50">
              {saving ? "Salvando..." : "Cadastrar"}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">E-mail</th>
              <th className="px-4 py-3 font-medium">Perfil</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {u.name}
                  {u.totpEnabled && <span className="ml-2 text-xs text-success">2FA</span>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs outline-none"
                  >
                    {ROLES.map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {u.isActive ? (
                    <span className="text-success">Ativo</span>
                  ) : (
                    <span className="text-muted-foreground">Inativo</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => patch(u.id, { isActive: !u.isActive })} className="mr-3 text-xs text-muted-foreground hover:text-foreground">
                    {u.isActive ? "desativar" : "ativar"}
                  </button>
                  <button onClick={() => resetPassword(u.id)} className="mr-3 text-xs text-muted-foreground hover:text-foreground">
                    senha
                  </button>
                  <button onClick={() => remove(u.id)} className="text-xs text-muted-foreground hover:text-danger">
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum usuário</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
