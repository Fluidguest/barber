"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl, reaisToCents } from "@/lib/format";

interface Product {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  barcode: string | null;
  unit: string;
  costCents: number;
  priceCents: number;
  stockCurrent: number;
  stockMin: number;
  expiresAt: string | null;
}
interface Alerts {
  lowStock: Product[];
  expiringSoon: Product[];
}

export default function StockPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");
  const [stock, setStock] = useState("0");
  const [stockMin, setStockMin] = useState("0");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load(q = search) {
    try {
      const path = q ? `/products?search=${encodeURIComponent(q)}` : "/products";
      const [p, a] = await Promise.all([
        api<Product[]>(path),
        api<Alerts>("/products/alerts"),
      ]);
      setProducts(p);
      setAlerts(a);
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load("");
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await api("/products", {
        method: "POST",
        body: JSON.stringify({
          name,
          barcode: barcode || undefined,
          priceCents: reaisToCents(price),
          costCents: reaisToCents(cost),
          stockCurrent: parseInt(stock, 10) || 0,
          stockMin: parseInt(stockMin, 10) || 0,
        }),
      });
      setName("");
      setBarcode("");
      setPrice("");
      setCost("");
      setStock("0");
      setStockMin("0");
      setOpen(false);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  }

  async function move(id: string, type: "IN" | "OUT") {
    const q = window.prompt(type === "IN" ? "Entrada — quantidade:" : "Saída — quantidade:");
    if (!q) return;
    setError("");
    try {
      await api(`/products/${id}/movements`, {
        method: "POST",
        body: JSON.stringify({
          type,
          quantity: parseInt(q, 10),
          reason: type === "IN" ? "compra" : "venda",
        }),
      });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function adjust(id: string) {
    const q = window.prompt("Estoque contado (inventário):");
    if (q === null) return;
    setError("");
    try {
      await api(`/products/${id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ targetStock: parseInt(q, 10) || 0 }),
      });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Remover este produto?")) return;
    try {
      await api(`/products/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      fail(e);
    }
  }

  const low = (p: Product) => p.stockCurrent <= p.stockMin;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Estoque</h1>
          <p className="text-sm text-muted">{products.length} produtos</p>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          {open ? "Fechar" : "Novo produto"}
        </button>
      </div>

      {alerts && (alerts.lowStock.length > 0 || alerts.expiringSoon.length > 0) && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
          {alerts.lowStock.length > 0 && (
            <div>⚠ {alerts.lowStock.length} produto(s) com estoque baixo</div>
          )}
          {alerts.expiringSoon.length > 0 && (
            <div>⏳ {alerts.expiringSoon.length} produto(s) com validade próxima</div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {open && (
        <form onSubmit={create} className="mb-6 rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 font-medium">Novo produto</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Input label="Nome *" value={name} onChange={setName} wide />
            <Input label="Código de barras" value={barcode} onChange={setBarcode} />
            <Input label="Preço venda (R$)" value={price} onChange={setPrice} />
            <Input label="Custo (R$)" value={cost} onChange={setCost} />
            <Input label="Estoque inicial" value={stock} onChange={setStock} />
            <Input label="Estoque mínimo" value={stockMin} onChange={setStockMin} />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-3 rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}

      <div className="mb-4 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Buscar por nome ou código de barras..."
          className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => load()}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          Buscar
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-surface text-left text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Produto</th>
              <th className="px-4 py-3 font-medium">Preço</th>
              <th className="px-4 py-3 font-medium">Custo</th>
              <th className="px-4 py-3 font-medium">Estoque</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-4 py-3">
                  {p.name}
                  {p.barcode && <span className="ml-2 text-xs text-muted">· {p.barcode}</span>}
                </td>
                <td className="px-4 py-3">{brl(p.priceCents)}</td>
                <td className="px-4 py-3 text-muted">{brl(p.costCents)}</td>
                <td className="px-4 py-3">
                  <span className={low(p) ? "text-warning" : ""}>
                    {p.stockCurrent} {p.unit}
                  </span>
                  {low(p) && <span className="ml-1 text-xs text-warning">(baixo)</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => move(p.id, "IN")} className="mr-2 text-xs text-success hover:underline">
                    entrada
                  </button>
                  <button onClick={() => move(p.id, "OUT")} className="mr-2 text-xs text-primary hover:underline">
                    saída
                  </button>
                  <button onClick={() => adjust(p.id)} className="mr-2 text-xs text-muted hover:text-foreground">
                    inventário
                  </button>
                  <button onClick={() => remove(p.id)} className="text-xs text-muted hover:text-danger">
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted">
                  Nenhum produto
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  wide,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
