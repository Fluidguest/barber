"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

/**
 * Página PÚBLICA do cliente (link do lembrete no WhatsApp): ver, confirmar ou
 * desmarcar o próprio horário. Sem login — a autorização é o token assinado.
 */

interface Appointment {
  shopName?: string;
  clientName?: string;
  serviceName?: string;
  barberName?: string;
  startAt: string;
  status: "SCHEDULED" | "CONFIRMED" | "DONE" | "CANCELED" | "NO_SHOW";
  timezone: string;
  unitName?: string;
  unitPhone?: string;
  canConfirm: boolean;
  canCancel: boolean;
}

const ROTULO: Record<Appointment["status"], string> = {
  SCHEDULED: "Aguardando confirmação",
  CONFIRMED: "Presença confirmada",
  DONE: "Atendimento concluído",
  CANCELED: "Agendamento cancelado",
  NO_SHOW: "Não compareceu",
};

export default function AppointmentPage() {
  const { token } = useParams<{ token: string }>();
  const base = `${API_BASE}/public/appointments/${token}`;

  const [appt, setAppt] = useState<Appointment | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(base);
    if (!r.ok) return setInvalid(true);
    setAppt(await r.json());
  }, [base]);

  useEffect(() => {
    load().catch(() => setInvalid(true));
  }, [load]);

  async function act(acao: "confirm" | "cancel") {
    if (acao === "cancel" && !window.confirm("Deseja mesmo desmarcar?")) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${base}/${acao}`, { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(
          Array.isArray(body?.message)
            ? body.message.join(", ")
            : (body?.message ?? "Não foi possível concluir"),
        );
      }
      setAppt(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha");
      void load();
    } finally {
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Entre em contato com a barbearia para confirmar seu horário.
        </p>
      </Centered>
    );
  }

  if (!appt) {
    return (
      <Centered>
        <p className="text-muted-foreground">Carregando...</p>
      </Centered>
    );
  }

  const quando = new Date(appt.startAt).toLocaleString("pt-BR", {
    timeZone: appt.timezone,
    dateStyle: "full",
    timeStyle: "short",
  });

  const cor =
    appt.status === "CONFIRMED"
      ? "border-success/40 bg-success/10 text-success"
      : appt.status === "CANCELED"
        ? "border-danger/40 bg-danger/10 text-danger"
        : "border-border bg-surface-2 text-muted-foreground";

  return (
    <div className="mx-auto max-w-md p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold">{appt.shopName}</h1>
        <p className="text-sm text-muted-foreground">Seu agendamento</p>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className={`mb-4 rounded-lg border px-3 py-2 text-sm ${cor}`}>
          {ROTULO[appt.status]}
        </div>

        <dl className="space-y-2 text-sm">
          <Linha rotulo="Quando" valor={quando} destaque />
          <Linha rotulo="Serviço" valor={appt.serviceName} />
          <Linha rotulo="Profissional" valor={appt.barberName} />
          <Linha rotulo="Cliente" valor={appt.clientName} />
          {appt.unitName && <Linha rotulo="Unidade" valor={appt.unitName} />}
        </dl>

        {error && (
          <div className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {(appt.canConfirm || appt.canCancel) && (
          <div className="mt-5 flex gap-2">
            {appt.canConfirm && (
              <button
                onClick={() => act("confirm")}
                disabled={busy}
                className="flex-1 rounded-lg bg-primary py-2.5 font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50"
              >
                Confirmar presença
              </button>
            )}
            {appt.canCancel && (
              <button
                onClick={() => act("cancel")}
                disabled={busy}
                className="flex-1 rounded-lg border border-border py-2.5 text-sm transition hover:border-danger hover:text-danger disabled:opacity-50"
              >
                Desmarcar
              </button>
            )}
          </div>
        )}

        {appt.unitPhone && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Precisa remarcar? Fale com a barbearia: {appt.unitPhone}
          </p>
        )}
      </div>
    </div>
  );
}

function Linha({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor?: string;
  destaque?: boolean;
}) {
  if (!valor) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={`text-right ${destaque ? "font-medium" : ""}`}>{valor}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}
