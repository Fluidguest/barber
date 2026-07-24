"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl, reaisToCents } from "@/lib/format";

interface Service {
  id: string;
  name: string;
  durationMin: number;
  priceCents: number;
  isActive: boolean;
}

export default function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [name, setName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load() {
    try {
      setServices(await api<Service[]>("/services"));
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setEditingId(null);
    setName("");
    setPrice("");
    setDuration("30");
  }

  /** Prepara o formulário para editar um serviço existente. */
  function startEdit(s: Service) {
    setEditingId(s.id);
    setName(s.name);
    setDuration(String(s.durationMin));
    setPrice((s.priceCents / 100).toFixed(2).replace(".", ","));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Cria (POST) ou atualiza (PATCH) conforme o modo. */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    const payload = {
      name,
      durationMin: parseInt(duration, 10) || 30,
      priceCents: reaisToCents(price),
    };
    try {
      if (editingId) {
        await api(`/services/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/services", { method: "POST", body: JSON.stringify(payload) });
      }
      resetForm();
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este serviço?")) return;
    try {
      await api(`/services/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Serviços</h1>
      <p className="mb-6 text-sm text-muted">{services.length} cadastrados</p>

      <form
        onSubmit={submit}
        className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-surface p-4"
      >
        <label className="flex-1">
          <span className="mb-1 block text-xs text-muted">Nome</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Corte, Barba..."
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="w-28">
          <span className="mb-1 block text-xs text-muted">Duração (min)</span>
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <label className="w-32">
          <span className="mb-1 block text-xs text-muted">Preço (R$)</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="50,00"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "..." : editingId ? "Salvar edição" : "Adicionar"}
        </button>
        {editingId && (
          <button
            type="button"
            onClick={resetForm}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:border-primary"
          >
            Cancelar
          </button>
        )}
      </form>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Serviço</th>
              <th className="px-4 py-3 font-medium">Duração</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-t border-border">
                <td className="px-4 py-3">{s.name}</td>
                <td className="px-4 py-3 text-muted">{s.durationMin} min</td>
                <td className="px-4 py-3">{brl(s.priceCents)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => startEdit(s)}
                    className="mr-3 text-xs text-muted hover:text-primary"
                  >
                    editar
                  </button>
                  <button
                    onClick={() => remove(s.id)}
                    className="text-xs text-muted hover:text-danger"
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  Nenhum serviço ainda
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
