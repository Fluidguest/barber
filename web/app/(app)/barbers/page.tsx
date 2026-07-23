"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Service {
  id: string;
  name: string;
}
interface Address {
  zip?: string; street?: string; number?: string;
  neighborhood?: string; city?: string; state?: string;
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
  specialties: { serviceId: string }[];
}

const emptyForm = {
  name: "", phone: "", whatsapp: "", email: "", document: "", birthDate: "",
  zip: "", street: "", number: "", neighborhood: "", city: "", state: "",
};

export default function BarbersPage() {
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState({ ...emptyForm });
  const set = (k: keyof typeof emptyForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // jornada rápida
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("18:00");

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const address = pickAddress(form);
      await api("/barbers", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          phone: form.phone || undefined,
          whatsapp: form.whatsapp || undefined,
          email: form.email || undefined,
          document: form.document || undefined,
          birthDate: form.birthDate || undefined,
          address,
          specialtyIds: specialtyIds.length ? specialtyIds : undefined,
        }),
      });
      setForm({ ...emptyForm });
      setSpecialtyIds([]);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function setSchedule(id: string) {
    setError("");
    try {
      const items = [1, 2, 3, 4, 5].map((weekday) => ({
        weekday,
        startTime: start,
        endTime: end,
      }));
      await api(`/barbers/${id}/schedule`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      window.alert(`Jornada Seg–Sex ${start}–${end} definida.`);
    } catch (e) {
      fail(e);
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
      <p className="mb-6 text-sm text-muted">{barbers.length} cadastrados</p>

      <form
        onSubmit={create}
        className="mb-6 rounded-xl border border-border bg-surface p-4"
      >
        {/* Dados pessoais e contatos */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Nome" value={form.name} onChange={set("name")} className="col-span-2" />
          <Campo label="CPF" value={form.document} onChange={set("document")} placeholder="000.000.000-00" />
          <Campo label="Nascimento" type="date" value={form.birthDate} onChange={set("birthDate")} />
          <Campo label="Telefone" value={form.phone} onChange={set("phone")} />
          <Campo label="WhatsApp" value={form.whatsapp} onChange={set("whatsapp")} />
          <Campo label="E-mail" type="email" value={form.email} onChange={set("email")} className="col-span-2" />
        </div>
        {/* Endereço */}
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Campo label="CEP" value={form.zip} onChange={set("zip")} />
          <Campo label="Rua" value={form.street} onChange={set("street")} className="sm:col-span-3" />
          <Campo label="Nº" value={form.number} onChange={set("number")} />
          <Campo label="Bairro" value={form.neighborhood} onChange={set("neighborhood")} />
          <Campo label="Cidade" value={form.city} onChange={set("city")} className="sm:col-span-2" />
          <Campo label="UF" value={form.state} onChange={set("state")} />
          <div className="flex items-end sm:col-span-3">
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "..." : "Adicionar barbeiro"}
            </button>
          </div>
        </div>
        {services.length > 0 && (
          <div>
            <span className="mb-2 block text-xs text-muted">Especialidades</span>
            <div className="flex flex-wrap gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleSpecialty(s.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    specialtyIds.includes(s.id)
                      ? "border-primary bg-primary/15 text-foreground"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4">
        <span className="text-sm text-muted">Jornada rápida (Seg–Sex):</span>
        <input
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none"
        />
        <span className="text-muted">até</span>
        <input
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-sm outline-none"
        />
        <span className="text-xs text-muted">
          (aplique em um barbeiro na lista)
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {barbers.map((b) => (
          <div
            key={b.id}
            className="flex items-center gap-4 rounded-xl border border-border bg-surface p-4"
          >
            <div className="flex-1">
              <div className="font-medium">{b.name}</div>
              <div className="text-sm text-muted">
                {[b.phone, b.email].filter(Boolean).join(" · ") || "sem contato"}
                {b.document && ` · CPF ${b.document}`}
              </div>
              {b.address?.city && (
                <div className="text-xs text-muted">
                  {[b.address.street, b.address.number, b.address.city, b.address.state]
                    .filter(Boolean)
                    .join(", ")}
                </div>
              )}
              {b.specialties.length > 0 && (
                <div className="mt-1 text-xs text-muted">
                  {b.specialties.map((s) => svcName(s.serviceId)).join(", ")}
                </div>
              )}
            </div>
            <button
              onClick={() => setSchedule(b.id)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:border-primary hover:text-foreground"
            >
              definir jornada
            </button>
            <button
              onClick={() => remove(b.id)}
              className="text-xs text-muted hover:text-danger"
            >
              remover
            </button>
          </div>
        ))}
        {barbers.length === 0 && (
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
            Nenhum barbeiro ainda
          </div>
        )}
      </div>
    </div>
  );
}

/** Campo de formulário compacto. */
function Campo({
  label, value, onChange, type = "text", placeholder, className = "",
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}

/** Monta o objeto address só com os campos preenchidos (ou undefined). */
function pickAddress(f: typeof emptyForm): Address | undefined {
  const a: Address = {
    zip: f.zip || undefined, street: f.street || undefined, number: f.number || undefined,
    neighborhood: f.neighborhood || undefined, city: f.city || undefined,
    state: f.state || undefined,
  };
  return Object.values(a).some(Boolean) ? a : undefined;
}
