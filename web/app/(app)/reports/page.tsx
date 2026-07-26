"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError, downloadFile } from "@/lib/api";
import { brl } from "@/lib/format";

interface Line {
  label: string;
  amountCents: number;
}
interface Dre {
  income: Line[];
  expense: Line[];
  totalIncomeCents: number;
  totalExpenseCents: number;
  resultCents: number;
}
interface BarberRow {
  barberId: string;
  name: string;
  appointmentsDone: number;
  revenueCents: number;
  commissionCents: number;
}
interface AbcRow {
  productId: string;
  name: string;
  revenueCents: number;
  quantity: number;
  curve: string;
}

interface InactiveRow {
  clientId: string;
  name: string;
  phone: string | null;
  lastServiceAt: string | null;
  daysSince: number | null;
}

type Tab = "dre" | "barbers" | "abc" | "inactive";

function currentMonth() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(y, m - 1, 1).toISOString();
  const to = new Date(y, m, 1).toISOString();
  return `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

const CURVE_COLOR: Record<string, string> = {
  A: "text-success",
  B: "text-warning",
  C: "text-muted-foreground",
};

const TABS: Tab[] = ["dre", "barbers", "abc", "inactive"];

export default function ReportsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  // A aba é derivada da URL (?tab=) — o submódulo na sidebar controla a página.
  const raw = sp.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "dre";
  const setTab = (t: Tab) => router.push(`/reports?tab=${t}`);
  const [month, setMonth] = useState(currentMonth());
  const [dre, setDre] = useState<Dre | null>(null);
  const [barbers, setBarbers] = useState<BarberRow[]>([]);
  const [abc, setAbc] = useState<AbcRow[]>([]);
  const [inactive, setInactive] = useState<InactiveRow[]>([]);
  const [inactiveDays, setInactiveDays] = useState(30);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  useEffect(() => {
    const q = monthRange(month);
    setError("");
    Promise.all([
      api<Dre>(`/reports/dre?${q}`),
      api<{ rows: BarberRow[] }>(`/reports/barbers?${q}`),
      api<{ rows: AbcRow[] }>(`/reports/products-abc?${q}`),
    ])
      .then(([d, b, a]) => {
        setDre(d);
        setBarbers(b.rows);
        setAbc(a.rows);
      })
      .catch(fail);
  }, [month]);

  // Inativos: período em DIAS (independente do mês).
  useEffect(() => {
    if (tab !== "inactive") return;
    api<{ rows: InactiveRow[] }>(`/reports/inactive-clients?days=${inactiveDays}`)
      .then((r) => setInactive(r.rows))
      .catch(fail);
  }, [tab, inactiveDays]);

  /** Baixa a aba visível em CSV. */
  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      if (tab === "inactive") {
        await downloadFile(
          `/reports/inactive-clients.csv?days=${inactiveDays}`,
          "clientes-inativos.csv",
        );
      } else {
        const rota = { dre: "dre.csv", barbers: "barbers.csv", abc: "products-abc.csv" }[tab];
        await downloadFile(`/reports/${rota}?${monthRange(month)}`, rota);
      }
    } catch (e) {
      fail(e);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Business Intelligence</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "inactive" ? (
            <select
              value={inactiveDays}
              onChange={(e) => setInactiveDays(Number(e.target.value))}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {[15, 30, 45, 60, 90].map((d) => (
                <option key={d} value={d}>Sem serviço há {d}+ dias</option>
              ))}
            </select>
          ) : (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}
          <button
            onClick={exportCsv}
            disabled={exporting}
            title="Baixar a aba atual em CSV (abre no Excel)"
            className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary disabled:opacity-50"
          >
            {exporting ? "Gerando..." : "Exportar CSV"}
          </button>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        {([
          ["dre", "DRE"],
          ["barbers", "Ranking de barbeiros"],
          ["abc", "Curva ABC (produtos)"],
          ["inactive", "Clientes inativos"],
        ] as [Tab, string][]).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === v ? "bg-primary text-primary-fg" : "border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {tab === "dre" && dre && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Receitas" total={dre.totalIncomeCents} lines={dre.income} tone="success" />
          <Panel title="Despesas" total={dre.totalExpenseCents} lines={dre.expense} tone="danger" />
          <div className="rounded-xl border border-border bg-surface p-5 lg:col-span-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">Resultado do período</span>
              <span
                className={`text-xl font-semibold ${dre.resultCents >= 0 ? "text-success" : "text-danger"}`}
              >
                {brl(dre.resultCents)}
              </span>
            </div>
          </div>
        </div>
      )}

      {tab === "barbers" && (
        <Table
          head={["Barbeiro", "Atendimentos", "Faturamento", "Comissão"]}
          rows={barbers.map((b) => [
            b.name,
            String(b.appointmentsDone),
            brl(b.revenueCents),
            brl(b.commissionCents),
          ])}
          empty="Nenhum dado no período"
        />
      )}

      {tab === "abc" && (
        <Table
          head={["Produto", "Qtd vendida", "Faturamento", "Curva"]}
          rows={abc.map((r) => [
            r.name,
            String(r.quantity),
            brl(r.revenueCents),
            <span key={r.productId} className={CURVE_COLOR[r.curve] ?? ""}>
              {r.curve}
            </span>,
          ])}
          empty="Nenhuma venda de produto no período"
        />
      )}

      {tab === "inactive" && (
        <>
          <p className="mb-3 text-sm text-muted-foreground">
            {inactive.length} cliente(s) sem atendimento há {inactiveDays}+ dias —
            bons candidatos a uma mensagem de reativação.
          </p>
          <Table
            head={["Cliente", "Contato", "Último serviço", "Dias sem vir"]}
            rows={inactive.map((r) => [
              r.name,
              r.phone ?? "—",
              r.lastServiceAt
                ? new Date(r.lastServiceAt).toLocaleDateString("pt-BR")
                : "Nunca",
              r.daysSince != null ? String(r.daysSince) : "—",
            ])}
            empty="Nenhum cliente inativo nesse período"
          />
        </>
      )}
    </div>
  );
}

function Panel({
  title,
  total,
  lines,
  tone,
}: {
  title: string;
  total: number;
  lines: Line[];
  tone: "success" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-medium">{title}</span>
        <span className={tone === "success" ? "text-success" : "text-danger"}>
          {brl(total)}
        </span>
      </div>
      <div className="flex flex-col gap-1 text-sm">
        {lines.map((l, i) => (
          <div key={i} className="flex justify-between">
            <span className="text-muted-foreground">{l.label}</span>
            <span>{brl(l.amountCents)}</span>
          </div>
        ))}
        {lines.length === 0 && <span className="text-muted-foreground">Sem lançamentos</span>}
      </div>
    </div>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: React.ReactNode[][];
  empty: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-surface text-left text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-3">
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
