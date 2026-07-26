"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  CalendarDays,
  DollarSign,
  Wallet,
  MessageCircle,
  Plus,
  ShoppingCart,
} from "lucide-react";
import { api } from "@/lib/api";
import { brl, timeBR, STATUS_LABEL, STATUS_COLOR } from "@/lib/format";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Badge } from "@/components/ui/badge";

interface Today {
  revenueCents: number;
  appointments: { total: number; done: number };
  activeBarbers: number;
  cashOpen: { openingCents: number } | null;
  agenda: {
    id: string;
    startAt: string;
    status: string;
  }[];
}

interface Me {
  name: string;
}

interface InactiveRow {
  clientId: string;
  name: string;
  phone: string | null;
  daysSince: number | null;
}

/** Número só com dígitos, para o link do WhatsApp (assume BR se faltar DDI). */
function waLink(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}`;
}

export default function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [clientCount, setClientCount] = useState<number | null>(null);
  const [inactive, setInactive] = useState<InactiveRow[] | null>(null);

  useEffect(() => {
    api<Me>("/auth/me").then(setMe).catch(() => {});
    api<Today>("/dashboard/today").then(setToday).catch(() => {});
    api<unknown[]>("/clients").then((c) => setClientCount(c.length)).catch(() => {});
    api<{ rows: InactiveRow[] }>("/reports/inactive-clients?days=30")
      .then((r) => setInactive(r.rows))
      .catch(() => setInactive([]));
  }, []);

  const firstName = me?.name?.split(" ")[0] ?? "";

  return (
    <div>
      <PageHeader
        title={firstName ? `Olá, ${firstName}!` : "Início"}
        subtitle="O que precisa da sua atenção hoje na barbearia."
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Clientes"
          value={clientCount != null ? String(clientCount) : "—"}
          icon={Users}
          hint="cadastrados"
        />
        <StatCard
          title="Agendamentos hoje"
          value={today ? String(today.appointments.total) : "—"}
          icon={CalendarDays}
          hint={today ? `${today.appointments.done} concluídos` : undefined}
        />
        <StatCard
          title="Faturamento hoje"
          value={today ? brl(today.revenueCents) : "—"}
          icon={DollarSign}
          accent
        />
        <StatCard
          title="Caixa"
          value={
            today ? (today.cashOpen ? "Aberto" : "Fechado") : "—"
          }
          icon={Wallet}
          hint={today?.cashOpen ? `fundo ${brl(today.cashOpen.openingCents)}` : undefined}
        />
      </div>

      {/* Ações rápidas */}
      <div className="mt-4 flex flex-wrap gap-2">
        <QuickAction href="/pos" icon={<ShoppingCart size={16} />} label="Nova venda" />
        <QuickAction href="/clients" icon={<Plus size={16} />} label="Novo cliente" />
        <QuickAction href="/agenda" icon={<CalendarDays size={16} />} label="Ver agenda" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Clientes para contatar */}
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="font-medium">Clientes para contatar</h2>
            <Link href="/reports?tab=inactive" className="text-xs text-primary hover:underline">
              ver todos
            </Link>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">
            Sem atendimento há 30+ dias — bons candidatos a reativação.
          </p>
          {inactive == null ? (
            <Spinner />
          ) : inactive.length === 0 ? (
            <EmptyState>Nenhum cliente inativo. 🎉</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {inactive.slice(0, 6).map((c) => {
                const wa = waLink(c.phone);
                return (
                  <li key={c.clientId} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{c.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.phone ?? "sem telefone"}
                        {c.daysSince != null && ` · ${c.daysSince} dias`}
                      </div>
                    </div>
                    {wa ? (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-gold inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                      >
                        <MessageCircle size={14} /> Contatar
                      </a>
                    ) : (
                      <Badge variant="muted">sem contato</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Agenda de hoje */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Agenda de hoje</h2>
            <Link href="/agenda" className="text-xs text-primary hover:underline">
              abrir agenda
            </Link>
          </div>
          {today == null ? (
            <Spinner />
          ) : today.agenda.length === 0 ? (
            <EmptyState>Nenhum atendimento agendado para hoje.</EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {today.agenda.slice(0, 7).map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-mono text-muted-foreground">{timeBR(a.startAt)}</span>
                  <span className={STATUS_COLOR[a.status] ?? "text-muted-foreground"}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm transition hover:border-primary/40 hover:text-primary"
    >
      {icon}
      {label}
    </Link>
  );
}
