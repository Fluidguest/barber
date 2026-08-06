"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl, timeBR, STATUS_LABEL, STATUS_COLOR } from "@/lib/format";
import { useRealtime } from "@/lib/socket";

interface Appointment {
  id: string;
  startAt: string;
  endAt: string;
  status: string;
  priceCents: number;
  clientId: string;
  barberId: string;
  serviceId: string;
}
interface Named {
  id: string;
  name: string;
}

const TERMINAL = ["CANCELED", "DONE", "NO_SHOW"];

function pad(x: number) {
  return String(x).padStart(2, "0");
}
function defaultDateTime() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T10:00`;
}
function toLocalInput(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Data de hoje em YYYY-MM-DD (hora local). */
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** Intervalo [início, fim] do dia informado (YYYY-MM-DD), em ISO. */
function dayRange(dateStr: string) {
  const from = new Date(`${dateStr}T00:00:00`).toISOString();
  const to = new Date(`${dateStr}T23:59:59.999`).toISOString();
  return { from, to };
}
/** Soma `delta` dias a uma data YYYY-MM-DD. */
function shiftDate(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T12:00:00`); // meio-dia evita borda de horário de verão
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function AgendaPage() {
  const [appts, setAppts] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Named[]>([]);
  const [barbers, setBarbers] = useState<Named[]>([]);
  const [services, setServices] = useState<Named[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [clientId, setClientId] = useState("");
  const [barberId, setBarberId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [when, setWhen] = useState(defaultDateTime());
  const [saving, setSaving] = useState(false);

  const [reschedId, setReschedId] = useState<string | null>(null);
  const [reschedWhen, setReschedWhen] = useState("");

  // Filtros da agenda (aplicados sobre o dia já carregado — instantâneo).
  const [fBarber, setFBarber] = useState("");
  const [fClient, setFClient] = useState("");
  const [fService, setFService] = useState("");
  const filtered = appts.filter(
    (a) =>
      (!fBarber || a.barberId === fBarber) &&
      (!fClient || a.clientId === fClient) &&
      (!fService || a.serviceId === fService),
  );

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");
  const nameOf = (list: Named[], id: string) =>
    list.find((x) => x.id === id)?.name;

  // Data selecionada na agenda (padrão: hoje).
  const [selectedDate, setSelectedDate] = useState(todayStr());

  /** Carrega os agendamentos do dia selecionado. */
  const loadAppts = useCallback(async (date: string) => {
    const { from, to } = dayRange(date);
    try {
      setAppts(
        await api<Appointment[]>(
          `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        ),
      );
    } catch (e) {
      fail(e);
    }
  }, []);

  /** Carrega as listas auxiliares (clientes, barbeiros, serviços) — uma vez. */
  async function loadLists() {
    try {
      const [cs, bs, svc] = await Promise.all([
        api<Named[]>("/clients"),
        api<Named[]>("/barbers"),
        api<Named[]>("/services"),
      ]);
      setClients(cs);
      setBarbers(bs);
      setServices(svc);
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    loadLists();
  }, []);
  // Recarrega os agendamentos quando a data muda (e no primeiro render).
  useEffect(() => {
    loadAppts(selectedDate);
  }, [selectedDate, loadAppts]);

  // Realtime: recarrega o dia selecionado quando algo muda (novo horário,
  // confirmação ou cancelamento — inclusive vindos do agendamento online).
  const reloadAppts = useCallback(() => {
    loadAppts(selectedDate);
  }, [loadAppts, selectedDate]);
  useRealtime("appointment:changed", reloadAppts);

  const isToday = selectedDate === todayStr();

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setOk("");
    if (!clientId || !barberId || !serviceId) {
      setError("Selecione cliente, barbeiro e serviço.");
      return;
    }
    setSaving(true);
    try {
      await api("/appointments", {
        method: "POST",
        body: JSON.stringify({
          clientId,
          barberId,
          serviceId,
          startAt: new Date(when).toISOString(),
        }),
      });
      setOk("Agendamento criado. Lembrete de WhatsApp agendado.");
      setShowForm(false);
      setClientId("");
      setBarberId("");
      setServiceId("");
      // Vai para o dia do agendamento criado (mesmo que diferente do que estava
      // sendo visto) e recarrega — assim ele sempre aparece.
      const apptDate = when.slice(0, 10);
      setSelectedDate(apptDate);
      await loadAppts(apptDate);
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(id: string, status: string) {
    setError("");
    setOk("");
    try {
      await api(`/appointments/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadAppts(selectedDate);
    } catch (e) {
      fail(e);
    }
  }

  async function saveReschedule(id: string) {
    setError("");
    setOk("");
    try {
      await api(`/appointments/${id}/reschedule`, {
        method: "PATCH",
        body: JSON.stringify({ startAt: new Date(reschedWhen).toISOString() }),
      });
      setReschedId(null);
      await loadAppts(selectedDate);
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">
            {isToday ? "Agenda de hoje" : "Agenda"}
          </h1>
          <p className="text-sm text-muted-foreground">{appts.length} atendimentos</p>
        </div>

        {/* Seletor de data */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, -1))}
            title="Dia anterior"
            className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            ‹
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || todayStr())}
            className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => setSelectedDate(shiftDate(selectedDate, 1))}
            title="Próximo dia"
            className="rounded-lg border border-border px-2.5 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
          >
            ›
          </button>
          {!isToday && (
            <button
              onClick={() => setSelectedDate(todayStr())}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary hover:text-foreground"
            >
              Hoje
            </button>
          )}
        </div>

        <button
          onClick={() => {
            // Ao abrir, o novo agendamento nasce na DATA SELECIONADA (10:00),
            // não em "hoje" — assim ele cai no dia que você está vendo.
            if (!showForm) setWhen(`${selectedDate}T10:00`);
            setShowForm((v) => !v);
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          {showForm ? "Fechar" : "Novo agendamento"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={create}
          className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <Select label="Cliente" value={clientId} onChange={setClientId} options={clients} />
          <Select label="Barbeiro" value={barberId} onChange={setBarberId} options={barbers} />
          <Select label="Serviço" value={serviceId} onChange={setServiceId} options={services} />
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Data e hora</span>
            <input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Agendando..." : "Agendar"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
          {ok}
        </div>
      )}

      {/* Filtros: barbeiro, cliente, serviço */}
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Filtro label="Barbeiro" value={fBarber} onChange={setFBarber} options={barbers} />
        <Filtro label="Cliente" value={fClient} onChange={setFClient} options={clients} />
        <Filtro label="Serviço" value={fService} onChange={setFService} options={services} />
        {(fBarber || fClient || fService) && (
          <button
            onClick={() => { setFBarber(""); setFClient(""); setFService(""); }}
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:border-primary"
          >
            Limpar
          </button>
        )}
        <span className="ml-auto self-center text-sm text-muted-foreground">
          {filtered.length} de {appts.length}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((a) => {
          const terminal = TERMINAL.includes(a.status);
          return (
            <div key={a.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-4">
                <div className="w-24 shrink-0 font-mono text-sm">
                  {timeBR(a.startAt)} – {timeBR(a.endAt)}
                </div>
                <div className="flex-1">
                  <div className="font-medium">
                    {nameOf(clients, a.clientId) ?? "Cliente"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {nameOf(barbers, a.barberId) ?? "Barbeiro"}
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{brl(a.priceCents)}</div>
                <div className={`w-24 text-right text-sm ${STATUS_COLOR[a.status] ?? ""}`}>
                  {STATUS_LABEL[a.status] ?? a.status}
                </div>
              </div>

              {!terminal && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  {a.status === "SCHEDULED" && (
                    <Action onClick={() => setStatus(a.id, "CONFIRMED")}>Confirmar</Action>
                  )}
                  <Action onClick={() => setStatus(a.id, "DONE")}>Concluir</Action>
                  <Action onClick={() => setStatus(a.id, "NO_SHOW")}>Faltou</Action>
                  <Action
                    onClick={() => {
                      setReschedId(reschedId === a.id ? null : a.id);
                      setReschedWhen(toLocalInput(a.startAt));
                    }}
                  >
                    Reagendar
                  </Action>
                  <Action danger onClick={() => setStatus(a.id, "CANCELED")}>
                    Cancelar
                  </Action>
                </div>
              )}

              {reschedId === a.id && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="datetime-local"
                    value={reschedWhen}
                    onChange={(e) => setReschedWhen(e.target.value)}
                    className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => saveReschedule(a.id)}
                    className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                  >
                    Salvar
                  </button>
                  <button
                    onClick={() => setReschedId(null)}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    cancelar
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground">
            {appts.length === 0 ? "Nenhum atendimento hoje" : "Nenhum atendimento com esses filtros"}
          </div>
        )}
      </div>
    </div>
  );
}

/** Select de filtro da agenda. */
function Filtro({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Named[];
}) {
  return (
    <label>
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">Todos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  );
}

function Action({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-border px-3 py-1.5 text-xs transition hover:border-primary ${
        danger ? "text-muted-foreground hover:border-danger hover:text-danger" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Named[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
