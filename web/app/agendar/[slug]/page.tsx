"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE } from "@/lib/api";

/**
 * Página PÚBLICA de agendamento (o link que a barbearia divulga).
 * Não usa `api()` de propósito: aqui não há sessão nem token — são endpoints
 * abertos em /api/public/:slug.
 */

interface Shop {
  name: string;
  unit?: { name: string; timezone: string; address?: unknown; phone?: string };
}
interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
}
interface Barber {
  id: string;
  name: string;
}
interface Slot {
  startAt: string;
  barberId: string;
  barberName: string;
}

const brl = (c: number) =>
  (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();

  const [shop, setShop] = useState<Shop | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [services, setServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);

  const [service, setService] = useState<Service | null>(null);
  const [barberId, setBarberId] = useState<string>(""); // "" = qualquer
  const [date, setDate] = useState(today());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<{ startAt: string } | null>(null);

  const base = `${API_BASE}/public/${slug}`;

  // Carrega barbearia + catálogo
  useEffect(() => {
    (async () => {
      const r = await fetch(base);
      if (!r.ok) return setNotFound(true);
      setShop(await r.json());
      const [s, b] = await Promise.all([
        fetch(`${base}/services`).then((x) => x.json()),
        fetch(`${base}/barbers`).then((x) => x.json()),
      ]);
      setServices(s);
      setBarbers(b);
    })().catch(() => setNotFound(true));
  }, [base]);

  // Busca horários sempre que serviço/data/profissional mudarem
  const loadSlots = useCallback(async () => {
    if (!service) return;
    setLoadingSlots(true);
    setSlot(null);
    try {
      const q = new URLSearchParams({ date, serviceId: service.id });
      if (barberId) q.set("barberId", barberId);
      const r = await fetch(`${base}/availability?${q}`);
      const body = await r.json();
      setSlots(r.ok ? (body.slots ?? []) : []);
    } finally {
      setLoadingSlots(false);
    }
  }, [base, service, date, barberId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!service || !slot) return;
    setError("");
    setSaving(true);
    try {
      const r = await fetch(`${base}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          serviceId: service.id,
          barberId: slot.barberId,
          startAt: slot.startAt,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? "Não foi possível agendar");
        throw new Error(msg);
      }
      setDone({ startAt: body.startAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao agendar");
      void loadSlots(); // o horário pode ter sido ocupado
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <Centered>
        <h1 className="text-xl font-semibold">Barbearia não encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">Confira o link e tente de novo.</p>
      </Centered>
    );
  }

  if (!shop) {
    return (
      <Centered>
        <p className="text-muted-foreground">Carregando...</p>
      </Centered>
    );
  }

  if (done) {
    const tz = shop.unit?.timezone;
    return (
      <Centered>
        <div className="text-3xl">✅</div>
        <h1 className="mt-3 text-xl font-semibold">Agendamento confirmado!</h1>
        <p className="mt-2 text-muted-foreground">
          {new Date(done.startAt).toLocaleString("pt-BR", {
            timeZone: tz,
            dateStyle: "full",
            timeStyle: "short",
          })}
        </p>
        <p className="mt-4 text-sm text-muted-foreground">
          Você receberá um lembrete no WhatsApp. Até breve!
        </p>
      </Centered>
    );
  }

  const tz = shop.unit?.timezone;

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
        <p className="text-sm text-muted-foreground">Agende seu horário</p>
      </header>

      {/* 1. Serviço */}
      <Step n={1} title="Escolha o serviço">
        <div className="grid gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              onClick={() => setService(s)}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                service?.id === s.id
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <span>
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.durationMin} min</span>
              </span>
              <span className="font-medium">{brl(s.priceCents)}</span>
            </button>
          ))}
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum serviço disponível.</p>
          )}
        </div>
      </Step>

      {service && (
        <>
          {/* 2. Profissional + data */}
          <Step n={2} title="Profissional e dia">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted-foreground">Profissional</span>
                <select
                  value={barberId}
                  onChange={(e) => setBarberId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="">Qualquer um</option>
                  {barbers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm text-muted-foreground">Data</span>
                <input
                  type="date"
                  value={date}
                  min={today()}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
                />
              </label>
            </div>
          </Step>

          {/* 3. Horário */}
          <Step n={3} title="Escolha o horário">
            {loadingSlots ? (
              <p className="text-sm text-muted-foreground">Buscando horários...</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum horário livre nesse dia. Tente outra data.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {slots.map((s) => (
                  <button
                    key={`${s.startAt}-${s.barberId}`}
                    onClick={() => setSlot(s)}
                    title={s.barberName}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      slot?.startAt === s.startAt && slot?.barberId === s.barberId
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    {new Date(s.startAt).toLocaleTimeString("pt-BR", {
                      timeZone: tz,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {!barberId && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {s.barberName.split(" ")[0]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Step>

          {/* 4. Contato */}
          {slot && (
            <Step n={4} title="Seus dados">
              <form onSubmit={confirm}>
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm text-muted-foreground">Nome</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={2}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
                  />
                </label>
                <label className="mb-4 block">
                  <span className="mb-1.5 block text-sm text-muted-foreground">
                    WhatsApp (com DDD)
                  </span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="(11) 99999-9999"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
                  />
                </label>

                {error && (
                  <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {error}
                  </div>
                )}

                <div className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm">
                  <div className="font-medium">{service.name}</div>
                  <div className="text-muted-foreground">
                    {new Date(slot.startAt).toLocaleString("pt-BR", {
                      timeZone: tz,
                      dateStyle: "long",
                      timeStyle: "short",
                    })}{" "}
                    · {slot.barberName} · {brl(service.priceCents)}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-lg bg-primary py-3 font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Confirmando..." : "Confirmar agendamento"}
                </button>
              </form>
            </Step>
          )}
        </>
      )}
    </div>
  );
}

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs text-primary-fg">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
      {children}
    </div>
  );
}

/** Data de hoje em YYYY-MM-DD (hora local do visitante). */
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
