"use client";

import { useEffect, useState } from "react";
import {
  DollarSign,
  Receipt,
  ShoppingBag,
  Percent,
  CalendarCheck,
  CheckCircle2,
  Scissors,
  UserPlus,
} from "lucide-react";
import { api } from "@/lib/api";
import { brl } from "@/lib/format";
import { StatCard } from "@/components/ui/StatCard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/card";

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

  if (error)
    return (
      <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-danger">
        {error}
      </div>
    );
  if (!data) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Indicadores de hoje" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Faturamento" value={brl(data.revenueCents)} icon={DollarSign} accent />
        <StatCard title="Ticket médio" value={brl(data.averageTicketCents)} icon={Receipt} />
        <StatCard title="Comandas pagas" value={String(data.paidSales)} icon={ShoppingBag} />
        <StatCard title="Comissões" value={brl(data.commissionsGeneratedCents)} icon={Percent} />
        <StatCard title="Atendimentos" value={String(data.appointments.total)} icon={CalendarCheck} />
        <StatCard title="Concluídos" value={String(data.appointments.done)} icon={CheckCircle2} />
        <StatCard title="Barbeiros ativos" value={String(data.activeBarbers)} icon={Scissors} />
        <StatCard title="Clientes novos" value={String(data.newClients)} icon={UserPlus} />
      </div>

      <Card className="mt-6 p-5">
        <div className="text-sm text-muted-foreground">Caixa</div>
        <div className="mt-1 text-lg">
          {data.cashOpen ? (
            <span className="text-success">
              Aberto · fundo {brl(data.cashOpen.openingCents)}
            </span>
          ) : (
            <span className="text-muted-foreground">Fechado</span>
          )}
        </div>
      </Card>
    </div>
  );
}
