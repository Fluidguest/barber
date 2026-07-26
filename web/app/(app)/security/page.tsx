"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";

interface Me {
  name: string;
  email: string;
  totpEnabled: boolean;
}

export default function SecurityPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) =>
    setError(e instanceof ApiError ? e.message : "Erro inesperado");

  async function load() {
    try {
      setMe(await api<Me>("/auth/me"));
    } catch (e) {
      fail(e);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function startSetup() {
    setError("");
    setOk("");
    setBusy(true);
    try {
      setSetup(await api<{ secret: string; otpauthUrl: string }>("/auth/2fa/setup", { method: "POST" }));
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable() {
    setError("");
    setBusy(true);
    try {
      await api("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
      setOk("2FA ativado com sucesso.");
      setSetup(null);
      setCode("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setError("");
    setBusy(true);
    try {
      await api("/auth/2fa/disable", { method: "POST", body: JSON.stringify({ code }) });
      setOk("2FA desativado.");
      setCode("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Segurança</h1>
      <p className="mb-6 text-sm text-muted-foreground">Autenticação de dois fatores (2FA)</p>

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

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-medium">Verificação em duas etapas</span>
          <span className={me?.totpEnabled ? "text-success" : "text-muted-foreground"}>
            {me?.totpEnabled ? "Ativado" : "Desativado"}
          </span>
        </div>

        {/* Desativado → fluxo de ativação */}
        {me && !me.totpEnabled && !setup && (
          <button
            onClick={startSetup}
            disabled={busy}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            Ativar 2FA
          </button>
        )}

        {setup && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Adicione ao seu app autenticador (Google Authenticator, Authy...)
              usando o segredo abaixo, depois confirme com o código gerado.
            </p>
            <div className="rounded-lg border border-border bg-surface-2 p-3">
              <div className="text-xs text-muted-foreground">Segredo</div>
              <div className="break-all font-mono text-sm">{setup.secret}</div>
            </div>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código de 6 dígitos"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                onClick={confirmEnable}
                disabled={busy || !code}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-50"
              >
                Confirmar
              </button>
            </div>
          </div>
        )}

        {/* Ativado → desativar */}
        {me?.totpEnabled && (
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código atual do app"
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={disable}
              disabled={busy || !code}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:border-danger hover:text-danger disabled:opacity-50"
            >
              Desativar 2FA
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
