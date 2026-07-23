"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { brl } from "@/lib/format";

interface Dashboard {
  revenueCents: number;
  paidSales: number;
  averageTicketCents: number;
  commissionsGeneratedCents: number;
  activeBarbers: number;
  newClients: number;
  appointments: { total: number; done: number; missed: number };
  cashOpen: { openingCents: number } | null;
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<Dashboard>("/dashboard/today")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <p className="text-muted">Carregando...</p>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Dashboard</h1>
      <p className="mb-6 text-sm text-muted">Indicadores de hoje</p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Faturamento" value={brl(data.revenueCents)} accent />
        <Card title="Ticket médio" value={brl(data.averageTicketCents)} />
        <Card title="Comandas pagas" value={String(data.paidSales)} />
        <Card title="Comissões" value={brl(data.commissionsGeneratedCents)} />
        <Card title="Atendimentos" value={String(data.appointments.total)} />
        <Card title="Concluídos" value={String(data.appointments.done)} />
        <Card title="Barbeiros ativos" value={String(data.activeBarbers)} />
        <Card title="Clientes novos" value={String(data.newClients)} />
      </div>

      <div className="mt-6 rounded-xl border border-border bg-surface p-5">
        <div className="text-sm text-muted">Caixa</div>
        <div className="mt-1 text-lg">
          {data.cashOpen ? (
            <span className="text-success">
              Aberto · fundo {brl(data.cashOpen.openingCents)}
            </span>
          ) : (
            <span className="text-muted">Fechado</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  accent,
}: {
  title: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      <div className="text-sm text-muted">{title}</div>
      <div
        className={`mt-2 text-2xl font-semibold ${accent ? "text-primary" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
      {message}
    </div>
  );
}
