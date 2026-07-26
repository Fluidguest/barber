"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Service {
  id: string;
  name: string;
}
interface Address {
  zip?: string; street?: string; number?: string; complement?: string;
  neighborhood?: string; city?: string; state?: string;
}
interface BankData {
  bank?: string; agency?: string; account?: string;
  accountType?: string; holder?: string;
}
interface Barber {
  id: string;
  name: string;
  phone: string | null;
  whatsapp?: string | null;
  email?: string | null;
  document?: string | null;
  birthDate?: string | null;
  address?: Address | null;
  pixKey?: string | null;
  bankData?: BankData | null;
  specialties: { serviceId: string }[];
}

const emptyForm = {
  name: "", phone: "", whatsapp: "", email: "", document: "", birthDate: "",
  zip: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
  pixKey: "", bankName: "", bankAgency: "", bankAccount: "", bankAccountType: "", bankHolder: "",
};
type Form = typeof emptyForm;

/** Dias da semana (0=Dom ... 6=Sáb), na ordem de exibição. */
const WEEK = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
interface DayRow {
  weekday: number;
  label: string;
  enabled: boolean;
  start: string;
  end: string;
}
/** Jornada padrão ao abrir um barbeiro sem jornada: Seg–Sex 09:00–18:00. */
function defaultDays(): DayRow[] {
  return WEEK.map((label, wd) => ({
    weekday: wd,
    label,
    enabled: wd >= 1 && wd <= 5,
    start: "09:00",
    end: "18:00",
  }));
}

export default function BarbersPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<Form>({ ...emptyForm });
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Editor de jornada (por dia da semana)
  const [scheduleBarber, setScheduleBarber] = useState<{ id: string; name: string } | null>(null);
  const [days, setDays] = useState<DayRow[]>(defaultDays());
  const [savingSchedule, setSavingSchedule] = useState(false);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load() {
    try {
      const [bs, svc] = await Promise.all([
        api<Barber[]>("/barbers"),
        api<Service[]>("/services"),
      ]);
      setBarbers(bs);
      setServices(svc);
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function toggleSpecialty(id: string) {
    setSpecialtyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setSpecialtyIds([]);
  }

  /** Carrega o barbeiro no formulário para edição. */
  function startEdit(b: Barber) {
    setEditingId(b.id);
    const a = b.address ?? {};
    const bank = b.bankData ?? {};
    setForm({
      name: b.name ?? "",
      phone: b.phone ?? "",
      whatsapp: b.whatsapp ?? "",
      email: b.email ?? "",
      document: b.document ?? "",
      birthDate: b.birthDate ? b.birthDate.slice(0, 10) : "",
      zip: a.zip ?? "", street: a.street ?? "", number: a.number ?? "",
      complement: a.complement ?? "", neighborhood: a.neighborhood ?? "",
      city: a.city ?? "", state: a.state ?? "",
      pixKey: b.pixKey ?? "",
      bankName: bank.bank ?? "", bankAgency: bank.agency ?? "",
      bankAccount: bank.account ?? "", bankAccountType: bank.accountType ?? "",
      bankHolder: bank.holder ?? "",
    });
    setSpecialtyIds(b.specialties.map((s) => s.serviceId));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Cria (POST) ou atualiza (PATCH) conforme o modo. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      name: form.name,
      phone: form.phone || undefined,
      whatsapp: form.whatsapp || undefined,
      email: form.email || undefined,
      document: form.document || undefined,
      birthDate: form.birthDate || undefined,
      address: {
        zip: form.zip, street: form.street, number: form.number,
        complement: form.complement || undefined,
        neighborhood: form.neighborhood, city: form.city, state: form.state,
      },
      pixKey: form.pixKey || undefined,
      bankData: pickBank(form),
      specialtyIds: specialtyIds.length ? specialtyIds : undefined,
    };
    try {
      if (editingId) {
        await api(`/barbers/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/barbers", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  /** Abre o editor de jornada carregando a jornada atual do barbeiro. */
  async function openSchedule(b: Barber) {
    setError("");
    try {
      const detail = await api<{
        schedules?: { weekday: number; startTime: string; endTime: string }[];
      }>(`/barbers/${b.id}`);
      const existing = detail.schedules ?? [];
      setDays(
        WEEK.map((label, wd) => {
          const s = existing.find((e) => e.weekday === wd);
          return {
            weekday: wd,
            label,
            enabled: !!s,
            start: s?.startTime ?? "09:00",
            end: s?.endTime ?? "18:00",
          };
        }),
      );
      setScheduleBarber({ id: b.id, name: b.name });
    } catch (e) {
      fail(e);
    }
  }

  function updateDay(weekday: number, patch: Partial<DayRow>) {
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
  }

  /** Salva a jornada: envia só os dias marcados (com horário início < fim). */
  async function saveSchedule() {
    if (!scheduleBarber) return;
    const enabled = days.filter((d) => d.enabled);
    for (const d of enabled) {
      if (d.start >= d.end) {
        setError(`${d.label}: o horário de início deve ser antes do fim.`);
        return;
      }
    }
    setSavingSchedule(true);
    setError("");
    try {
      const items = enabled.map((d) => ({
        weekday: d.weekday,
        startTime: d.start,
        endTime: d.end,
      }));
      await api(`/barbers/${scheduleBarber.id}/schedule`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      setScheduleBarber(null);
    } catch (e) {
      fail(e);
    } finally {
      setSavingSchedule(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este barbeiro?")) return;
    try {
      await api(`/barbers/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  const svcName = (id: string) => services.find((s) => s.id === id)?.name ?? "";

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Barbeiros</h1>
      <p className="mb-6 text-sm text-muted-foreground">{barbers.length} cadastrados</p>

      <form onSubmit={submit} className="mb-6 rounded-xl border border-border bg-surface p-4">
        <div className="mb-2 text-sm font-medium">
          {editingId ? "Editar barbeiro" : "Novo barbeiro"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">* campos obrigatórios</span>
        </div>

        {/* Dados pessoais (obrigatórios) */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Nome completo" req value={form.name} onChange={set("name")} className="col-span-2" />
          <Campo label="CPF" req value={form.document} onChange={set("document")} placeholder="000.000.000-00" />
          <Campo label="Nascimento" req type="date" value={form.birthDate} onChange={set("birthDate")} />
        </div>

        {/* Contatos (opcionais) */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Telefone" value={form.phone} onChange={set("phone")} />
          <Campo label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} />
          <Campo label="E-mail" type="email" value={form.email} onChange={set("email")} className="col-span-2" />
        </div>

        {/* Endereço (obrigatório) */}
        <div className="mb-1 text-xs text-muted-foreground">Endereço *</div>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Campo label="CEP" req value={form.zip} onChange={set("zip")} />
          <Campo label="Rua" req value={form.street} onChange={set("street")} className="sm:col-span-3" />
          <Campo label="Nº" req value={form.number} onChange={set("number")} />
          <Campo label="Complemento" value={form.complement} onChange={set("complement")} />
          <Campo label="Bairro" req value={form.neighborhood} onChange={set("neighborhood")} className="sm:col-span-2" />
          <Campo label="Cidade" req value={form.city} onChange={set("city")} className="sm:col-span-2" />
          <Campo label="UF" req value={form.state} onChange={set("state")} />
        </div>

        {/* Dados bancários e PIX (opcionais) */}
        <div className="mb-1 text-xs text-muted-foreground">Dados bancários e PIX (opcional)</div>
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Campo label="Chave PIX" value={form.pixKey} onChange={set("pixKey")} className="sm:col-span-2" />
          <Campo label="Banco" value={form.bankName} onChange={set("bankName")} className="sm:col-span-2" />
          <Campo label="Agência" value={form.bankAgency} onChange={set("bankAgency")} />
          <Campo label="Conta" value={form.bankAccount} onChange={set("bankAccount")} />
          <Campo label="Tipo (corrente/poupança)" value={form.bankAccountType} onChange={set("bankAccountType")} className="sm:col-span-2" />
          <Campo label="Titular" value={form.bankHolder} onChange={set("bankHolder")} className="sm:col-span-2" />
        </div>

        {services.length > 0 && (
          <div className="mb-4">
            <span className="mb-2 block text-xs text-muted-foreground">Especialidades</span>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    specialtyIds.includes(s.id)
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "..." : editingId ? "Salvar alterações" : "Adicionar barbeiro"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary"
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-3">
        {barbers.map((b) => (
          <div key={b.id} className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4">
            <div className="flex-1">
              <div className="font-medium">{b.name}</div>
              <div className="text-sm text-muted-foreground">
                {[b.phone, b.email].filter(Boolean).join(" · ") || "sem contato"}
                {b.document && ` · CPF ${b.document}`}
              </div>
              {b.address?.city && (
                <div className="text-xs text-muted-foreground">
                  {[b.address.street, b.address.number, b.address.city, b.address.state]
                    .filter(Boolean).join(", ")}
                </div>
              )}
              {(b.pixKey || b.bankData?.bank) && (
                <div className="text-xs text-muted-foreground">
                  {b.pixKey && `PIX: ${b.pixKey}`}
                  {b.pixKey && b.bankData?.bank && " · "}
                  {b.bankData?.bank && `${b.bankData.bank} ${b.bankData.agency ?? ""}/${b.bankData.account ?? ""}`}
                </div>
              )}
              {b.specialties.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {b.specialties.map((s) => svcName(s.serviceId)).join(", ")}
                </div>
              )}
            </div>
            <button onClick={() => startEdit(b)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
              editar
            </button>
            <button onClick={() => openSchedule(b)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground">
              jornada
            </button>
            <button onClick={() => remove(b.id)}
              className="text-xs text-muted-foreground hover:text-danger">
              remover
            </button>
          </div>
        ))}
        {barbers.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted-foreground">
            Nenhum barbeiro ainda
          </div>
        )}
      </div>

      {/* Editor de jornada por dia da semana */}
      {scheduleBarber && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
            <div className="mb-1 text-lg font-semibold">Jornada de {scheduleBarber.name}</div>
            <p className="mb-4 text-xs text-muted-foreground">
              Marque os dias que ele atende e defina o horário de cada um.
            </p>

            <div className="flex flex-col gap-2">
              {days.map((d) => (
                <div key={d.weekday} className="flex items-center gap-3">
                  <label className="flex w-28 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      onChange={(e) => updateDay(d.weekday, { enabled: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                    {d.label}
                  </label>
                  <input
                    type="time"
                    value={d.start}
                    disabled={!d.enabled}
                    onChange={(e) => updateDay(d.weekday, { start: e.target.value })}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-40"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="time"
                    value={d.end}
                    disabled={!d.enabled}
                    onChange={(e) => updateDay(d.weekday, { end: e.target.value })}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-primary disabled:opacity-40"
                  />
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setScheduleBarber(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:border-primary"
              >
                Cancelar
              </button>
              <button
                onClick={saveSchedule}
                disabled={savingSchedule}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
              >
                {savingSchedule ? "Salvando..." : "Salvar jornada"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Campo de formulário compacto. `req` marca obrigatório (asterisco + required). */
function Campo({
  label, value, onChange, type = "text", placeholder, className = "", req = false,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  className?: string;
  req?: boolean;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs text-muted-foreground">
        {label}{req && <span className="text-danger"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={req}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

/** Monta bankData só com campos preenchidos (ou undefined). */
function pickBank(f: Form): BankData | undefined {
  const b: BankData = {
    bank: f.bankName || undefined, agency: f.bankAgency || undefined,
    account: f.bankAccount || undefined, accountType: f.bankAccountType || undefined,
    holder: f.bankHolder || undefined,
  };
  return Object.values(b).some(Boolean) ? b : undefined;
}
