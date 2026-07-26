"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { brl } from "@/lib/format";

interface Service {
  id: string;
  name: string;
  priceCents: number;
}
interface Product {
  id: string;
  name: string;
  priceCents: number;
  stockCurrent: number;
}
interface Named {
  id: string;
  name: string;
}
interface Item {
  id: string;
  description: string;
  quantity: number;
  totalCents: number;
}
interface Payment {
  id: string;
  method: string;
  amountCents: number;
}
interface Sale {
  id: string;
  status: string;
  subtotalCents: number;
  adjustmentMode: "PERCENT" | "FIXED" | null;
  adjustmentValue: number;
  adjustmentCents: number;
  clientCreditCents: number;
  totalCents: number;
  barberId: string | null;
  items: Item[];
  payments: Payment[];
}
interface Cash {
  id: string;
  status: string;
  openingCents: number;
}
/** Cobrança online (PIX) de uma comanda. */
interface Charge {
  id: string;
  status: "PENDING" | "APPROVED" | "EXPIRED" | "CANCELED" | "FAILED";
  provider: string;
  amountCents: number;
  qrCode?: string | null;
  qrCodeBase64?: string | null;
  ticketUrl?: string | null;
  expiresAt?: string | null;
}

const METHODS = [
  ["CASH", "Dinheiro"],
  ["PIX", "PIX"],
  ["CREDIT", "Crédito"],
  ["DEBIT", "Débito"],
  ["LINK", "Link"],
] as const;

const reaisToCents = (s: string) =>
  Math.round((parseFloat(String(s).replace(",", ".")) || 0) * 100);

export default function PosPage() {
  const [cash, setCash] = useState<Cash | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [barbers, setBarbers] = useState<Named[]>([]);
  const [clients, setClients] = useState<Named[]>([]);
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [opening, setOpening] = useState("0");
  const [selClient, setSelClient] = useState("");
  const [selBarber, setSelBarber] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [charge, setCharge] = useState<Charge | null>(null);
  const [adjKind, setAdjKind] = useState<"DISCOUNT" | "SURCHARGE">("DISCOUNT");
  const [adjMode, setAdjMode] = useState<"PERCENT" | "FIXED">("PERCENT");
  const [adjInput, setAdjInput] = useState("");

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  /**
   * Enquanto a cobrança está pendente, consulta a cada 4s. O backend, ao ser
   * consultado, também pergunta ao provedor — então funciona mesmo se o
   * webhook não chegar. Ao aprovar, recarrega a comanda (o pagamento entrou).
   */
  useEffect(() => {
    if (!sale || !charge || charge.status !== "PENDING") return;
    const timer = setInterval(async () => {
      try {
        const c = await api<Charge>(`/sales/${sale.id}/charges/${charge.id}`);
        if (c.status !== "PENDING") {
          setCharge(c);
          setSale(await api<Sale>(`/sales/${sale.id}`));
        }
      } catch {
        // erro transitório de rede: a próxima tentativa resolve
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [sale, charge]);

  async function loadBase() {
    setLoading(true);
    try {
      const [c, svc, prods, bs, cs] = await Promise.all([
        api<Cash | null>("/cash-sessions/current"),
        api<Service[]>("/services"),
        api<Product[]>("/products"),
        api<Named[]>("/barbers"),
        api<Named[]>("/clients"),
      ]);
      setCash(c);
      setServices(svc);
      setProducts(prods);
      setBarbers(bs);
      setClients(cs);
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadBase();
  }, []);

  async function openCash() {
    setError("");
    try {
      await api("/cash-sessions/open", {
        method: "POST",
        body: JSON.stringify({ openingCents: reaisToCents(opening) }),
      });
      await loadBase();
    } catch (e) {
      fail(e);
    }
  }

  async function closeCash() {
    if (!cash) return;
    const counted = window.prompt("Valor contado em dinheiro (R$):", "0");
    if (counted === null) return;
    setError("");
    try {
      const res = await api<{ cashDifferenceCents: number; totalPaidCents: number }>(
        `/cash-sessions/${cash.id}/close`,
        { method: "PATCH", body: JSON.stringify({ closingCents: reaisToCents(counted) }) },
      );
      window.alert(
        `Caixa fechado.\nTotal recebido: ${brl(res.totalPaidCents)}\nDiferença: ${brl(res.cashDifferenceCents)}`,
      );
      setSale(null);
      await loadBase();
    } catch (e) {
      fail(e);
    }
  }

  async function startSale() {
    setError("");
    try {
      const s = await api<Sale>("/sales", {
        method: "POST",
        body: JSON.stringify({
          clientId: selClient || undefined,
          barberId: selBarber || undefined,
        }),
      });
      setSale(s);
    } catch (e) {
      fail(e);
    }
  }

  async function addService(svc: Service) {
    if (!sale) return;
    setError("");
    try {
      const s = await api<Sale>(`/sales/${sale.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          serviceId: svc.id,
          barberId: sale.barberId || undefined,
        }),
      });
      setSale(s);
    } catch (e) {
      fail(e);
    }
  }

  async function addProduct(p: Product) {
    if (!sale) return;
    setError("");
    try {
      const s = await api<Sale>(`/sales/${sale.id}/items`, {
        method: "POST",
        body: JSON.stringify({ productId: p.id }),
      });
      setSale(s);
      await loadBase(); // atualiza o estoque exibido
    } catch (e) {
      fail(e);
    }
  }

  async function payRemaining() {
    if (!sale) return;
    const remaining = sale.totalCents - paid(sale);
    if (remaining <= 0) return;
    setError("");
    try {
      const s = await api<Sale>(`/sales/${sale.id}/payments`, {
        method: "POST",
        body: JSON.stringify({ method: payMethod, amountCents: remaining }),
      });
      setSale(s);
    } catch (e) {
      fail(e);
    }
  }

  // ---- Acréscimo / desconto -----------------------------------------------

  /** Aplica desconto (sinal −) ou acréscimo (sinal +), em % ou R$. */
  async function applyAdjustment(
    kind: "DISCOUNT" | "SURCHARGE",
    mode: "PERCENT" | "FIXED",
    raw: string,
  ) {
    if (!sale) return;
    const n = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return;
    const value = kind === "DISCOUNT" ? -n : n;
    setError("");
    try {
      setSale(
        await api<Sale>(`/sales/${sale.id}/adjustment`, {
          method: "POST",
          body: JSON.stringify({ mode, value }),
        }),
      );
      setAdjInput("");
    } catch (e) {
      fail(e);
    }
  }

  async function clearAdjustment() {
    if (!sale) return;
    try {
      setSale(
        await api<Sale>(`/sales/${sale.id}/adjustment`, {
          method: "POST",
          body: JSON.stringify({ mode: null, value: 0 }),
        }),
      );
    } catch (e) {
      fail(e);
    }
  }

  // ---- Cobrança PIX (online) ----------------------------------------------

  /** Gera o QR code de cobrança do saldo restante. */
  async function chargePix() {
    if (!sale) return;
    setError("");
    try {
      const c = await api<Charge>(`/sales/${sale.id}/charges`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setCharge(c);
    } catch (e) {
      fail(e);
    }
  }

  /** Só no provedor "fake": confirma o pagamento para demonstrar o fluxo. */
  async function simulatePix() {
    if (!sale || !charge) return;
    setError("");
    try {
      const c = await api<Charge>(
        `/sales/${sale.id}/charges/${charge.id}/simulate-approval`,
        { method: "POST" },
      );
      setCharge(c);
    } catch (e) {
      fail(e);
    }
  }

  async function closeSale() {
    if (!sale) return;
    setError("");
    try {
      await api(`/sales/${sale.id}/close`, { method: "POST" });
      window.alert("Comanda fechada e comissão gerada.");
      setSale(null);
      setCharge(null);
      setSelClient("");
      setSelBarber("");
    } catch (e) {
      fail(e);
    }
  }

  if (loading) return <p className="text-muted-foreground">Carregando...</p>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Caixa / PDV</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {cash ? (
          <span className="text-success">
            Caixa aberto · fundo {brl(cash.openingCents)}
          </span>
        ) : (
          <span className="text-muted-foreground">Caixa fechado</span>
        )}
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {!cash && (
        <div className="max-w-sm rounded-xl border border-border bg-surface p-5">
          <div className="mb-3 font-medium">Abrir caixa</div>
          <label className="mb-3 block">
            <span className="mb-1 block text-xs text-muted-foreground">Fundo de troco (R$)</span>
            <input
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
            />
          </label>
          <button
            onClick={openCash}
            className="w-full rounded-lg bg-primary py-2 font-medium text-primary-fg hover:opacity-90"
          >
            Abrir caixa
          </button>
        </div>
      )}

      {cash && !sale && (
        <div className="flex flex-col gap-4">
          <div className="max-w-md rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 font-medium">Nova comanda</div>
            <Select label="Cliente (opcional)" value={selClient} onChange={setSelClient} options={clients} />
            <Select label="Barbeiro" value={selBarber} onChange={setSelBarber} options={barbers} />
            <button
              onClick={startSale}
              className="mt-2 w-full rounded-lg bg-primary py-2 font-medium text-primary-fg hover:opacity-90"
            >
              Iniciar comanda
            </button>
          </div>
          <button
            onClick={closeCash}
            className="max-w-md rounded-lg border border-border py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Fechar caixa
          </button>
        </div>
      )}

      {cash && sale && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Serviços + Produtos */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 font-medium">Adicionar serviço</div>
            <div className="grid grid-cols-2 gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addService(s)}
                  className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm hover:border-primary"
                >
                  <div>{s.name}</div>
                  <div className="text-xs text-muted-foreground">{brl(s.priceCents)}</div>
                </button>
              ))}
            </div>

            {products.length > 0 && (
              <>
                <div className="mb-3 mt-5 font-medium">Adicionar produto</div>
                <div className="grid grid-cols-2 gap-2">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => addProduct(p)}
                      disabled={p.stockCurrent <= 0}
                      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-sm hover:border-primary disabled:opacity-40"
                    >
                      <div>{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {brl(p.priceCents)} · {p.stockCurrent} em estoque
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Comanda */}
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium">Comanda</span>
              <span className="text-xs text-muted-foreground">
                {barbers.find((b) => b.id === sale.barberId)?.name ?? "sem barbeiro"}
              </span>
            </div>

            <div className="mb-3 flex flex-col gap-1 text-sm">
              {sale.items.length === 0 && (
                <span className="text-muted-foreground">Nenhum item.</span>
              )}
              {sale.items.map((it) => (
                <div key={it.id} className="flex justify-between">
                  <span>
                    {it.quantity}× {it.description}
                  </span>
                  <span>{brl(it.totalCents)}</span>
                </div>
              ))}
            </div>

            {/* Acréscimo / desconto */}
            <div className="mt-3 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>{brl(sale.subtotalCents)}</span>
              </div>

              {sale.adjustmentCents !== 0 ? (
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className={sale.adjustmentCents < 0 ? "text-success" : "text-warning"}>
                    {sale.adjustmentCents < 0 ? "Desconto" : "Acréscimo"}
                    {sale.adjustmentMode === "PERCENT" &&
                      ` (${Math.abs(sale.adjustmentValue) / 100}%)`}
                  </span>
                  <span className="flex items-center gap-2">
                    {brl(sale.adjustmentCents)}
                    <button
                      onClick={clearAdjustment}
                      className="text-xs text-muted-foreground hover:text-danger"
                      title="Remover"
                    >
                      ✕
                    </button>
                  </span>
                </div>
              ) : (
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <select
                    value={adjKind}
                    onChange={(e) => setAdjKind(e.target.value as "DISCOUNT" | "SURCHARGE")}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="DISCOUNT">Desconto</option>
                    <option value="SURCHARGE">Acréscimo</option>
                  </select>
                  <select
                    value={adjMode}
                    onChange={(e) => setAdjMode(e.target.value as "PERCENT" | "FIXED")}
                    className="rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none"
                  >
                    <option value="PERCENT">%</option>
                    <option value="FIXED">R$</option>
                  </select>
                  <input
                    value={adjInput}
                    onChange={(e) => setAdjInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyAdjustment(adjKind, adjMode, adjInput);
                    }}
                    placeholder={adjMode === "PERCENT" ? "10" : "15,00"}
                    className="w-20 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => applyAdjustment(adjKind, adjMode, adjInput)}
                    className="rounded-lg border border-border px-2 py-1.5 text-xs hover:border-primary"
                  >
                    Aplicar
                  </button>
                </div>
              )}

              {/* Crédito de desconto do cliente (automático) */}
              {sale.clientCreditCents > 0 && (
                <div className="mt-2 flex items-center justify-between text-sm text-success">
                  <span>Crédito do cliente</span>
                  <span>-{brl(sale.clientCreditCents)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between border-t border-border pt-3 text-lg font-semibold">
              <span>Total</span>
              <span>{brl(sale.totalCents)}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm text-muted-foreground">
              <span>Pago</span>
              <span>{brl(paid(sale))}</span>
            </div>

            <div className="mt-4 flex gap-2">
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm outline-none"
              >
                {METHODS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button
                onClick={payRemaining}
                disabled={sale.totalCents - paid(sale) <= 0}
                className="flex-1 rounded-lg border border-border py-2 text-sm hover:border-primary disabled:opacity-40"
              >
                Pagar restante ({brl(Math.max(0, sale.totalCents - paid(sale)))})
              </button>
            </div>

            {/* Cobrança PIX (online) */}
            {sale.totalCents - paid(sale) > 0 && !charge && (
              <button
                onClick={chargePix}
                className="mt-2 w-full rounded-lg border border-primary py-2 text-sm font-medium text-primary hover:bg-primary/10"
              >
                Cobrar por PIX
              </button>
            )}

            {charge && (
              <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
                {charge.status === "PENDING" ? (
                  <>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium">
                        PIX de {brl(charge.amountCents)}
                      </span>
                      <span className="text-muted-foreground">aguardando pagamento...</span>
                    </div>

                    {charge.qrCodeBase64 && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`data:image/png;base64,${charge.qrCodeBase64}`}
                        alt="QR code do PIX"
                        className="mx-auto mb-2 h-44 w-44 rounded bg-white p-1"
                      />
                    )}

                    {charge.qrCode && (
                      <>
                        <p className="mb-1 text-xs text-muted-foreground">Copia e cola:</p>
                        <div className="flex gap-2">
                          <input
                            readOnly
                            value={charge.qrCode}
                            className="w-full rounded border border-border bg-surface px-2 py-1 text-xs"
                          />
                          <button
                            onClick={() =>
                              navigator.clipboard?.writeText(charge.qrCode ?? "")
                            }
                            className="rounded border border-border px-2 text-xs hover:border-primary"
                          >
                            Copiar
                          </button>
                        </div>
                      </>
                    )}

                    {/* Demonstração: só aparece no provedor fake */}
                    {charge.provider === "fake" && (
                      <button
                        onClick={simulatePix}
                        className="mt-2 w-full rounded-lg border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:border-primary"
                      >
                        Simular pagamento (modo demonstração)
                      </button>
                    )}
                  </>
                ) : charge.status === "APPROVED" ? (
                  <p className="text-sm font-medium text-success">
                    PIX de {brl(charge.amountCents)} recebido
                  </p>
                ) : (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-danger">
                      Cobrança {charge.status.toLowerCase()}
                    </span>
                    <button
                      onClick={() => setCharge(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      nova cobrança
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={closeSale}
              disabled={sale.totalCents <= 0 || paid(sale) < sale.totalCents}
              className="mt-3 w-full rounded-lg bg-success py-2 font-medium text-black disabled:opacity-40"
            >
              Fechar comanda
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function paid(sale: Sale) {
  return sale.payments.reduce((a, p) => a + p.amountCents, 0);
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
    <label className="mb-3 block">
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
