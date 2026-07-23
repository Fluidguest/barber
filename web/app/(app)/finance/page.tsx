"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl, reaisToCents } from "@/lib/format";

interface Cashflow {
  salesIncomeCents: number;
  realizedIncomeCents: number;
  realizedExpenseCents: number;
  realizedBalanceCents: number;
  forecastIncomeCents: number;
  forecastExpenseCents: number;
  forecastBalanceCents: number;
}
interface Category {
  id: string;
  name: string;
  kind: string;
}
interface Entry {
  id: string;
  type: string;
  description: string;
  amountCents: number;
  dueDate: string;
  status: string;
  categoryId: string | null;
  method: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  PAYABLE: "A pagar",
  RECEIVABLE: "A receber",
};

const dateBR = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const todayInput = () => {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
};

export default function FinancePage() {
  const [cf, setCf] = useState<Cashflow | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filter, setFilter] = useState<"" | "PAYABLE" | "RECEIVABLE">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  // form lançamento
  const [type, setType] = useState<"PAYABLE" | "RECEIVABLE">("PAYABLE");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(todayInput());
  const [categoryId, setCategoryId] = useState("");
  const [saving, setSaving] = useState(false);

  // form categoria
  const [catName, setCatName] = useState("");
  const [catKind, setCatKind] = useState<"INCOME" | "EXPENSE">("EXPENSE");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load(p = page) {
    try {
      const q = new URLSearchParams({ page: String(p), pageSize: "20" });
      if (filter) q.set("type", filter);
      const [c, e, cats] = await Promise.all([
        api<Cashflow>("/finance/cashflow"),
        api<{ items: Entry[]; page: number; totalPages: number }>(
          `/finance/entries?${q.toString()}`,
        ),
        api<Category[]>("/finance/categories"),
      ]);
      setCf(c);
      setEntries(e.items);
      setPage(e.page);
      setTotalPages(e.totalPages);
      setCategories(cats);
    } catch (err) {
      fail(err);
    }
  }
  useEffect(() => {
    load(1); // troca de filtro volta para a 1ª página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function createEntry(ev: React.FormEvent) {
    ev.preventDefault();
    if (!description.trim() || !amount) return;
    setSaving(true);
    setError("");
    try {
      await api("/finance/entries", {
        method: "POST",
        body: JSON.stringify({
          type,
          description,
          amountCents: reaisToCents(amount),
          dueDate: new Date(dueDate).toISOString(),
          categoryId: categoryId || undefined,
        }),
      });
      setDescription("");
      setAmount("");
      setOpen(false);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function createCategory() {
    if (!catName.trim()) return;
    setError("");
    try {
      await api("/finance/categories", {
        method: "POST",
        body: JSON.stringify({ name: catName, kind: catKind }),
      });
      setCatName("");
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function pay(id: string) {
    setError("");
    try {
      await api(`/finance/entries/${id}/pay`, {
        method: "POST",
        body: JSON.stringify({ method: "PIX" }),
      });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancelar este lançamento?")) return;
    try {
      await api(`/finance/entries/${id}/cancel`, { method: "POST" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este lançamento?")) return;
    try {
      await api(`/finance/entries/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  const catName_ = (id: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "" : "";
  const isOverdue = (e: Entry) =>
    e.status === "PENDING" && new Date(e.dueDate) < new Date();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted">Fluxo de caixa do mês</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          {open ? "Fechar" : "Novo lançamento"}
        </button>
      </div>

      {cf && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card title="Receita realizada" value={brl(cf.realizedIncomeCents)} tone="success" />
          <Card title="Despesa realizada" value={brl(cf.realizedExpenseCents)} tone="danger" />
          <Card
            title="Saldo realizado"
            value={brl(cf.realizedBalanceCents)}
            tone={cf.realizedBalanceCents >= 0 ? "success" : "danger"}
          />
          <Card
            title="Previsto (a receber − a pagar)"
            value={brl(cf.forecastBalanceCents)}
          />
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {open && (
        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <form
            onSubmit={createEntry}
            className="rounded-xl border border-border bg-surface p-4 lg:col-span-2"
          >
            <div className="mb-3 font-medium">Novo lançamento</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Tipo</span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as "PAYABLE" | "RECEIVABLE")}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
                >
                  <option value="PAYABLE">A pagar (despesa)</option>
                  <option value="RECEIVABLE">A receber (receita)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Categoria</span>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
                >
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs text-muted">Descrição</span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Valor (R$)</span>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Vencimento</span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="mt-3 rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </form>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 font-medium">Nova categoria</div>
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Ex.: Aluguel"
              className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={catKind}
              onChange={(e) => setCatKind(e.target.value as "INCOME" | "EXPENSE")}
              className="mb-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none"
            >
              <option value="EXPENSE">Despesa</option>
              <option value="INCOME">Receita</option>
            </select>
            <button
              onClick={createCategory}
              className="w-full rounded-lg border border-border py-2 text-sm hover:border-primary"
            >
              Adicionar categoria
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {[
          ["", "Todos"],
          ["RECEIVABLE", "A receber"],
          ["PAYABLE", "A pagar"],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v as "" | "PAYABLE" | "RECEIVABLE")}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              filter === v ? "bg-primary text-primary-fg" : "border border-border text-muted hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Tipo</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {e.description}
                  {catName_(e.categoryId) && (
                    <span className="ml-2 text-xs text-muted">· {catName_(e.categoryId)}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{TYPE_LABEL[e.type]}</td>
                <td className="px-4 py-3 text-muted">{dateBR(e.dueDate)}</td>
                <td className={`px-4 py-3 ${e.type === "PAYABLE" ? "text-danger" : "text-success"}`}>
                  {brl(e.amountCents)}
                </td>
                <td className="px-4 py-3">
                  {e.status === "PAID" ? (
                    <span className="text-success">Pago</span>
                  ) : e.status === "CANCELED" ? (
                    <span className="text-muted line-through">Cancelado</span>
                  ) : isOverdue(e) ? (
                    <span className="text-warning">Atrasado</span>
                  ) : (
                    <span className="text-muted">Pendente</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {e.status === "PENDING" && (
                    <>
                      <button
                        onClick={() => pay(e.id)}
                        className="mr-3 text-xs text-primary hover:underline"
                      >
                        dar baixa
                      </button>
                      <button
                        onClick={() => cancel(e.id)}
                        className="mr-3 text-xs text-muted hover:text-warning"
                      >
                        cancelar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => remove(e.id)}
                    className="text-xs text-muted hover:text-danger"
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Nenhum lançamento
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-3 text-sm">
          <button
            onClick={() => load(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-muted">Página {page} de {totalPages}</span>
          <button
            onClick={() => load(page + 1)}
            disabled={page >= totalPages}
            className="rounded-lg border border-border px-3 py-1.5 text-muted hover:text-foreground disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "";
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-sm text-muted">{title}</div>
      <div className={`mt-2 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}
