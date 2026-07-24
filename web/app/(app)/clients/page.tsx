"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface ClientListItem {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  discountBalanceCents: number;
}

interface Address {
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}
interface ClientDetail extends ClientListItem {
  document: string | null;
  birthDate: string | null;
  instagram: string | null;
  origin: string | null;
  notes: string | null;
  address: Address | null;
  discountBalanceCents: number;
}

const EMPTY = {
  name: "",
  phone: "",
  whatsapp: "",
  email: "",
  document: "",
  birthDate: "",
  instagram: "",
  origin: "",
  notes: "",
  zip: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
};
type Form = typeof EMPTY;

const ORIGINS = ["Indicação", "Instagram", "Google", "Passando na rua", "Outro"];

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<Form>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Saldo de desconto do cliente em edição.
  const [balanceCents, setBalanceCents] = useState(0);
  const [balanceInput, setBalanceInput] = useState("");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");
  const set = (k: keyof Form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function load(q = search) {
    try {
      const path = q ? `/clients?search=${encodeURIComponent(q)}` : "/clients";
      setClients(await api<ClientListItem[]>(path));
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load("");
  }, []);

  function startNew() {
    setForm(EMPTY);
    setEditingId(null);
    setOpen(true);
    setError("");
  }

  async function startEdit(id: string) {
    setError("");
    try {
      const c = await api<ClientDetail>(`/clients/${id}`);
      const a = c.address ?? {};
      setForm({
        name: c.name ?? "",
        phone: c.phone ?? "",
        whatsapp: c.whatsapp ?? "",
        email: c.email ?? "",
        document: c.document ?? "",
        birthDate: c.birthDate ? c.birthDate.slice(0, 10) : "",
        instagram: c.instagram ?? "",
        origin: c.origin ?? "",
        notes: c.notes ?? "",
        zip: a.zip ?? "",
        street: a.street ?? "",
        number: a.number ?? "",
        complement: a.complement ?? "",
        neighborhood: a.neighborhood ?? "",
        city: a.city ?? "",
        state: a.state ?? "",
      });
      setBalanceCents(c.discountBalanceCents ?? 0);
      setBalanceInput("");
      setEditingId(id);
      setOpen(true);
    } catch (e) {
      fail(e);
    }
  }

  /** Define o saldo de desconto (valor absoluto em reais). */
  async function saveBalance() {
    if (!editingId) return;
    const reais = Number(balanceInput.replace(",", "."));
    if (!Number.isFinite(reais) || reais < 0) return;
    setError("");
    try {
      const r = await api<{ discountBalanceCents: number }>(
        `/clients/${editingId}/discount-balance`,
        { method: "PATCH", body: JSON.stringify({ setCents: Math.round(reais * 100) }) },
      );
      setBalanceCents(r.discountBalanceCents);
      setBalanceInput("");
      await load();
    } catch (e) {
      fail(e);
    }
  }

  function buildPayload() {
    const v = (s: string) => (s.trim() ? s.trim() : undefined);
    const address = {
      zip: v(form.zip),
      street: v(form.street),
      number: v(form.number),
      complement: v(form.complement),
      neighborhood: v(form.neighborhood),
      city: v(form.city),
      state: v(form.state),
    };
    const hasAddress = Object.values(address).some(Boolean);
    return {
      name: form.name.trim(),
      phone: v(form.phone),
      whatsapp: v(form.whatsapp),
      email: v(form.email),
      document: v(form.document),
      birthDate: v(form.birthDate),
      instagram: v(form.instagram),
      origin: v(form.origin),
      notes: v(form.notes),
      address: hasAddress ? address : undefined,
    };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const payload = buildPayload();
      if (editingId) {
        await api(`/clients/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/clients", { method: "POST", body: JSON.stringify(payload) });
      }
      setOpen(false);
      setForm(EMPTY);
      setEditingId(null);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este cliente?")) return;
    try {
      await api(`/clients/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted">{clients.length} cadastrados</p>
        </div>
        <button
          onClick={startNew}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          Novo cliente
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Buscar por nome, telefone ou e-mail..."
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => load()}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Buscar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {open && (
        <form
          onSubmit={submit}
          className="mb-6 rounded-xl border border-border bg-surface p-5"
        >
          <div className="mb-4 font-medium">
            {editingId ? "Editar cliente" : "Novo cliente"}
          </div>

          <Group title="Dados">
            <Input label="Nome *" value={form.name} onChange={(v) => set("name", v)} />
            <Input label="CPF" value={form.document} onChange={(v) => set("document", v)} />
            <Input label="Nascimento" type="date" value={form.birthDate} onChange={(v) => set("birthDate", v)} />
            <Select label="Origem" value={form.origin} onChange={(v) => set("origin", v)} options={ORIGINS} />
          </Group>

          <Group title="Contato">
            <Input label="Telefone" value={form.phone} onChange={(v) => set("phone", v)} />
            <Input label="WhatsApp" value={form.whatsapp} onChange={(v) => set("whatsapp", v)} />
            <Input label="E-mail" type="email" value={form.email} onChange={(v) => set("email", v)} />
            <Input label="Instagram" value={form.instagram} onChange={(v) => set("instagram", v)} />
          </Group>

          <Group title="Endereço">
            <Input label="CEP" value={form.zip} onChange={(v) => set("zip", v)} />
            <Input label="Rua" value={form.street} onChange={(v) => set("street", v)} />
            <Input label="Número" value={form.number} onChange={(v) => set("number", v)} />
            <Input label="Complemento" value={form.complement} onChange={(v) => set("complement", v)} />
            <Input label="Bairro" value={form.neighborhood} onChange={(v) => set("neighborhood", v)} />
            <Input label="Cidade" value={form.city} onChange={(v) => set("city", v)} />
            <Input label="UF" value={form.state} onChange={(v) => set("state", v)} />
          </Group>

          <label className="mb-4 block">
            <span className="mb-1 block text-xs text-muted">Observações</span>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {/* Saldo de desconto — aplicado automaticamente no próximo atendimento */}
          {editingId && (
            <div className="mb-4 rounded-lg border border-border bg-surface-2 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Saldo de desconto</span>
                <span className="text-lg font-semibold text-success">
                  {(balanceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
              <p className="mb-2 text-xs text-muted">
                Aplicado automaticamente no próximo atendimento (comanda). Ajuste
                manual define o valor total do crédito.
              </p>
              <div className="flex gap-2">
                <input
                  value={balanceInput}
                  onChange={(e) => setBalanceInput(e.target.value)}
                  placeholder="Novo saldo (ex.: 30,00)"
                  className="w-40 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={saveBalance}
                  className="rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
                >
                  Definir saldo
                </button>
                {balanceCents > 0 && (
                  <button
                    type="button"
                    onClick={() => { setBalanceInput("0"); }}
                    className="rounded-lg border border-border px-3 py-2 text-sm text-muted hover:border-danger hover:text-danger"
                  >
                    Zerar
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Contato</th>
              <th className="px-4 py-3 font-medium">Saldo desconto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="px-4 py-3">{c.name}</td>
                <td className="px-4 py-3 text-muted">{c.whatsapp ?? c.phone ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.discountBalanceCents > 0 ? (
                    <span className="text-success">
                      {(c.discountBalanceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => startEdit(c.id)}
                    className="mr-3 text-xs text-muted hover:text-foreground"
                  >
                    editar
                  </button>
                  <button
                    onClick={() => remove(c.id)}
                    className="text-xs text-muted hover:text-danger"
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nenhum cliente
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-xs uppercase tracking-wide text-muted">{title}</div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {children}
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
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
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
