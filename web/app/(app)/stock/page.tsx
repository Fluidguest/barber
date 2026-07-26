"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { brl, reaisToCents } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

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
  const router = useRouter();
  const sp = useSearchParams();
  const view: "products" | "alerts" = sp.get("tab") === "alerts" ? "alerts" : "products";

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const alertCount = alerts ? alerts.lowStock.length + alerts.expiringSoon.length : 0;
  const dateBR = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle={`${products.length} produtos`}
        actions={
          view === "products" ? (
            <Button onClick={() => setOpen((v) => !v)}>
              {open ? "Fechar" : "Novo produto"}
            </Button>
          ) : undefined
        }
      />

      {/* Abas (submódulos) */}
      <div className="mb-4 flex gap-2">
        <TabLink active={view === "products"} onClick={() => router.push("/stock")}>
          Produtos
        </TabLink>
        <TabLink active={view === "alerts"} onClick={() => router.push("/stock?tab=alerts")}>
          Alertas{alertCount > 0 ? ` (${alertCount})` : ""}
        </TabLink>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {view === "alerts" ? (
        <div className="flex flex-col gap-6">
          <section>
            <h2 className="mb-2 text-sm font-medium text-warning">⚠ Estoque baixo</h2>
            {alerts && alerts.lowStock.length > 0 ? (
              <DataTable
                head={["Produto", "Estoque", "Mínimo"]}
                rows={alerts.lowStock.map((p) => [
                  p.name,
                  <span className="text-warning">{p.stockCurrent} {p.unit}</span>,
                  String(p.stockMin),
                ])}
              />
            ) : (
              <EmptyState>Nenhum produto com estoque baixo.</EmptyState>
            )}
          </section>
          <section>
            <h2 className="mb-2 text-sm font-medium text-warning">⏳ Validade próxima</h2>
            {alerts && alerts.expiringSoon.length > 0 ? (
              <DataTable
                head={["Produto", "Validade", "Estoque"]}
                rows={alerts.expiringSoon.map((p) => [
                  p.name,
                  dateBR(p.expiresAt),
                  `${p.stockCurrent} ${p.unit}`,
                ])}
              />
            ) : (
              <EmptyState>Nenhum produto com validade próxima.</EmptyState>
            )}
          </section>
        </div>
      ) : (
        <>
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
              <Button type="submit" disabled={saving} className="mt-3">
                {saving ? "Salvando..." : "Salvar"}
              </Button>
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
            <Button variant="outline" onClick={() => load()}>
              Buscar
            </Button>
          </div>

          <DataTable
            head={["Produto", "Preço", "Custo", "Estoque", ""]}
            empty="Nenhum produto"
            rows={products.map((p) => [
              <span>
                {p.name}
                {p.barcode && <span className="ml-2 text-xs text-muted-foreground">· {p.barcode}</span>}
              </span>,
              brl(p.priceCents),
              <span className="text-muted-foreground">{brl(p.costCents)}</span>,
              <span className={low(p) ? "text-warning" : ""}>
                {p.stockCurrent} {p.unit}
                {low(p) && <span className="ml-1 text-xs text-warning">(baixo)</span>}
              </span>,
              <div className="whitespace-nowrap text-right">
                <button onClick={() => move(p.id, "IN")} className="mr-2 text-xs text-success hover:underline">
                  entrada
                </button>
                <button onClick={() => move(p.id, "OUT")} className="mr-2 text-xs text-primary hover:underline">
                  saída
                </button>
                <button onClick={() => adjust(p.id)} className="mr-2 text-xs text-muted-foreground hover:text-foreground">
                  inventário
                </button>
                <button onClick={() => remove(p.id)} className="text-xs text-muted-foreground hover:text-danger">
                  remover
                </button>
              </div>,
            ])}
          />
        </>
      )}
    </div>
  );
}

function TabLink({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-sm transition ${
        active
          ? "btn-gold font-medium"
          : "border border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
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
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
      />
    </label>
  );
}
