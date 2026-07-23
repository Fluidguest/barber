"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  ip: string | null;
  createdAt: string;
}

const ACTION_LABEL: Record<string, string> = {
  POST: "Criação",
  PATCH: "Alteração",
  PUT: "Alteração",
  DELETE: "Remoção",
};
const ACTION_COLOR: Record<string, string> = {
  POST: "text-success",
  PATCH: "text-warning",
  PUT: "text-warning",
  DELETE: "text-danger",
};

const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entity, setEntity] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  async function load(p = page) {
    setError("");
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (entity) q.set("entity", entity);
      const data = await api<Page<AuditLog>>(`/audit?${q.toString()}`);
      setLogs(data.items);
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro inesperado");
    }
  }
  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  const entities = Array.from(new Set(logs.map((l) => l.entity)));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Auditoria</h1>
          <p className="text-sm text-muted">{total} ações registradas</p>
        </div>
        <div className="flex gap-2">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
          >
            <option value="">Todas as entidades</option>
            {entities.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <button
            onClick={() => load()}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
          >
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium">Ação</th>
              <th className="px-4 py-3 font-medium">Entidade</th>
              <th className="px-4 py-3 font-medium">Registro</th>
              <th className="px-4 py-3 font-medium">IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="px-4 py-3 text-muted">{dt(l.createdAt)}</td>
                <td className={`px-4 py-3 ${ACTION_COLOR[l.action] ?? ""}`}>
                  {ACTION_LABEL[l.action] ?? l.action}
                </td>
                <td className="px-4 py-3">{l.entity}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {l.entityId ? l.entityId.slice(0, 12) + "…" : "—"}
                </td>
                <td className="px-4 py-3 text-muted">{l.ip ?? "—"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Nenhum registro
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} totalPages={totalPages} onChange={(p) => load(p)} />
    </div>
  );
}

function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40"
      >
        Anterior
      </button>
      <span className="text-muted">
        Página {page} de {totalPages}
      </span>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40"
      >
        Próxima
      </button>
    </div>
  );
}
