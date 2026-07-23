"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Settings {
  whatsappProvider: string;
  metaPhoneId: string;
  metaApiVersion: string;
  metaTokenSet: boolean;
  wahaUrl: string;
  wahaSession: string;
  wahaApiKeySet: boolean;
  whatsappVerifyToken: string;
  reminderLeadHours: number | null;
  paymentProvider: string;
  mpAccessTokenSet: boolean;
  mpWebhookSecretSet: boolean;
}

export default function ConfiguracoesPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [provider, setProvider] = useState("fake");
  const [metaPhoneId, setMetaPhoneId] = useState("");
  const [metaApiVersion, setMetaApiVersion] = useState("v21.0");
  const [metaToken, setMetaToken] = useState("");
  const [wahaUrl, setWahaUrl] = useState("");
  const [wahaSession, setWahaSession] = useState("default");
  const [wahaApiKey, setWahaApiKey] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [leadHours, setLeadHours] = useState("");
  const [payProvider, setPayProvider] = useState("fake");
  const [mpToken, setMpToken] = useState("");
  const [mpSecret, setMpSecret] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const d = await api<Settings>("/settings");
      setS(d);
      setProvider(d.whatsappProvider);
      setMetaPhoneId(d.metaPhoneId);
      setMetaApiVersion(d.metaApiVersion || "v21.0");
      setWahaUrl(d.wahaUrl);
      setWahaSession(d.wahaSession || "default");
      setVerifyToken(d.whatsappVerifyToken);
      setLeadHours(d.reminderLeadHours != null ? String(d.reminderLeadHours) : "");
      setPayProvider(d.paymentProvider || "fake");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setOk("");
    try {
      const payload: Record<string, unknown> = {
        whatsappProvider: provider,
        metaPhoneId: metaPhoneId || undefined,
        metaApiVersion: metaApiVersion || undefined,
        wahaUrl: wahaUrl || undefined,
        wahaSession: wahaSession || undefined,
        whatsappVerifyToken: verifyToken || undefined,
        reminderLeadHours: leadHours ? Number(leadHours) : undefined,
        paymentProvider: payProvider,
      };
      // Secrets só vão se digitados (write-only).
      if (metaToken) payload.metaToken = metaToken;
      if (wahaApiKey) payload.wahaApiKey = wahaApiKey;
      if (mpToken) payload.mpAccessToken = mpToken;
      if (mpSecret) payload.mpWebhookSecret = mpSecret;

      const d = await api<Settings>("/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setS(d);
      setMetaToken("");
      setWahaApiKey("");
      setMpToken("");
      setMpSecret("");
      setOk("Configurações salvas.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  if (!s) return <p className="text-muted">Carregando...</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold">Configurações</h1>
      <p className="mb-6 text-sm text-muted">Integrações da barbearia (WhatsApp)</p>

      {error && (
        <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      {ok && (
        <div className="mb-4 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{ok}</div>
      )}

      <div className="rounded-xl border border-border bg-surface p-5">
        <Field label="Provedor de WhatsApp">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            <option value="fake">Simulado (dev/teste)</option>
            <option value="meta">Meta (API oficial)</option>
            <option value="waha">WAHA (self-hosted)</option>
          </select>
        </Field>

        {provider === "meta" && (
          <div className="mt-4 rounded-lg border border-border p-4">
            <div className="mb-3 text-sm font-medium">Meta Cloud API</div>
            <Field label="Token de acesso">
              <input
                type="password"
                value={metaToken}
                onChange={(e) => setMetaToken(e.target.value)}
                placeholder={s.metaTokenSet ? "•••••••• (configurado — digite para trocar)" : "cole o token permanente"}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
            <Field label="Phone Number ID">
              <input value={metaPhoneId} onChange={(e) => setMetaPhoneId(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label="Versão da API">
              <input value={metaApiVersion} onChange={(e) => setMetaApiVersion(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label="Token de verificação do webhook">
              <input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
          </div>
        )}

        {provider === "waha" && (
          <div className="mt-4 rounded-lg border border-border p-4">
            <div className="mb-3 text-sm font-medium">WAHA</div>
            <Field label="URL">
              <input value={wahaUrl} onChange={(e) => setWahaUrl(e.target.value)} placeholder="http://localhost:3000" className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label="Sessão">
              <input value={wahaSession} onChange={(e) => setWahaSession(e.target.value)} className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
            </Field>
            <Field label="API Key (opcional)">
              <input
                type="password"
                value={wahaApiKey}
                onChange={(e) => setWahaApiKey(e.target.value)}
                placeholder={s.wahaApiKeySet ? "•••••••• (configurado)" : ""}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </Field>
          </div>
        )}

        <div className="mt-4">
          <Field label="Lembrete: horas de antecedência (opcional)">
            <input value={leadHours} onChange={(e) => setLeadHours(e.target.value)} placeholder="24" className="w-40 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary" />
          </Field>
        </div>

        {/* ---- Pagamento no PDV ---- */}
        <div className="mt-8 border-t border-border pt-6">
          <h2 className="mb-1 text-lg font-medium">Pagamento no PDV</h2>
          <p className="mb-4 text-sm text-muted">
            Cobrança PIX do cliente na comanda. Com o provedor{" "}
            <strong>demonstração</strong> o QR é fictício e o pagamento é
            confirmado manualmente.
          </p>

          <Field label="Provedor">
            <select
              value={payProvider}
              onChange={(e) => setPayProvider(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary sm:w-64"
            >
              <option value="fake">Demonstração (sem cobrança real)</option>
              <option value="mercadopago">Mercado Pago (PIX real)</option>
            </select>
          </Field>

          {payProvider === "mercadopago" && (
            <div className="mt-4 rounded-lg border border-border p-4">
              <div className="mb-3 text-sm font-medium">Mercado Pago</div>
              <Field label="Access Token">
                <input
                  type="password"
                  value={mpToken}
                  onChange={(e) => setMpToken(e.target.value)}
                  placeholder={
                    s.mpAccessTokenSet
                      ? "•••••••• (configurado — digite para trocar)"
                      : "APP_USR-..."
                  }
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <Field label="Segredo do webhook (opcional)">
                <input
                  type="password"
                  value={mpSecret}
                  onChange={(e) => setMpSecret(e.target.value)}
                  placeholder={s.mpWebhookSecretSet ? "•••••••• (configurado)" : ""}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </Field>
              <p className="mt-2 text-xs text-muted">
                No painel do Mercado Pago, aponte o webhook de{" "}
                <em>pagamentos</em> para{" "}
                <code>&lt;sua-api&gt;/api/payments/webhook</code>.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="mt-4 rounded-lg bg-primary px-5 py-2 font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>

        <p className="mt-3 text-xs text-muted">
          Os tokens são cifrados em repouso. Deixe o campo de token vazio para
          manter o valor atual.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
