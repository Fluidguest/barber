"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl } from "@/lib/format";

interface SummaryRow {
  barberId: string;
  status: string;
  count: number;
  amountCents: number;
}
interface Entry {
  id: string;
  barberId: string;
  amountCents: number;
  baseCents: number;
  status: string;
  periodRef: string;
}
interface Named {
  id: string;
  name: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  CLOSED: "Fechado",
  PAID: "Pago",
};

function currentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}

export default function CommissionsPage() {
  const [period, setPeriod] = useState(currentMonth());
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [barbers, setBarbers] = useState<Named[]>([]);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");
  const barberName = (id: string) =>
    barbers.find((b) => b.id === id)?.name ?? "Barbeiro";

  async function load() {
    setError("");
    try {
      const [sum, ent, bs] = await Promise.all([
        api<SummaryRow[]>(`/commissions/summary?periodRef=${period}`),
        api<Entry[]>(`/commissions?periodRef=${period}`),
        api<Named[]>("/barbers"),
      ]);
      setSummary(sum);
      setEntries(ent);
      setBarbers(bs);
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  async function closePeriod() {
    if (!window.confirm(`Fechar todas as comissões pendentes de ${period}?`)) return;
    setClosing(true);
    setError("");
    try {
      const r = await api<{ closed: number }>("/commissions/close", {
        method: "POST",
        body: JSON.stringify({ periodRef: period }),
      });
      window.alert(`${r.closed} comissão(ões) fechada(s).`);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setClosing(false);
    }
  }

  // agrega por barbeiro
  const byBarber = new Map<string, { pending: number; closed: number; paid: number }>();
  for (const row of summary) {
    const cur = byBarber.get(row.barberId) ?? { pending: 0, closed: 0, paid: 0 };
    if (row.status === "PENDING") cur.pending += row.amountCents;
    if (row.status === "CLOSED") cur.closed += row.amountCents;
    if (row.status === "PAID") cur.paid += row.amountCents;
    byBarber.set(row.barberId, cur);
  }
  const rows = [...byBarber.entries()];
  const totalPending = rows.reduce((a, [, v]) => a + v.pending, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Comissões</h1>
          <p className="text-sm text-muted">Fechamento por período</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={closePeriod}
            disabled={closing || totalPending === 0}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
          >
            {closing ? "Fechando..." : "Fechar período"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Resumo por barbeiro */}
      <div className="mb-6 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Barbeiro</th>
              <th className="px-4 py-3 font-medium">Pendente</th>
              <th className="px-4 py-3 font-medium">Fechado</th>
              <th className="px-4 py-3 font-medium">Pago</th>
              <th className="px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, v]) => (
              <tr key={id} className="border-t border-border">
                <td className="px-4 py-3">{barberName(id)}</td>
                <td className="px-4 py-3 text-warning">{brl(v.pending)}</td>
                <td className="px-4 py-3">{brl(v.closed)}</td>
                <td className="px-4 py-3 text-success">{brl(v.paid)}</td>
                <td className="px-4 py-3 font-medium">{brl(v.pending + v.closed + v.paid)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Nenhuma comissão neste período
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Lançamentos detalhados */}
      <div className="mb-2 text-sm text-muted">
        {entries.length} lançamento(s)
      </div>
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Barbeiro</th>
              <th className="px-4 py-3 font-medium">Base</th>
              <th className="px-4 py-3 font-medium">Comissão</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-border">
                <td className="px-4 py-3">{barberName(e.barberId)}</td>
                <td className="px-4 py-3 text-muted">{brl(e.baseCents)}</td>
                <td className="px-4 py-3">{brl(e.amountCents)}</td>
                <td className="px-4 py-3 text-muted">{STATUS_LABEL[e.status] ?? e.status}</td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Sem lançamentos
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
