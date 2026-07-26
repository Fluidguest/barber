"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_BASE } from "@/lib/api";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  // O token vem no link do e-mail (?token=...). Lido do próprio browser, sem
  // useSearchParams — evita exigir Suspense e não é usado na renderização.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : (body?.message ?? "Não foi possível redefinir a senha");
        throw new Error(msg);
      }
      setDone(true);
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao redefinir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Nova senha</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha uma senha de ao menos 8 caracteres.
          </p>
        </div>

        {done ? (
          <>
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm">
              Senha redefinida com sucesso. Redirecionando para o login...
            </div>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-primary py-2.5 text-center font-medium text-primary-fg transition hover:opacity-90"
            >
              Ir para o login
            </Link>
          </>
        ) : !token ? (
          <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-3 text-sm text-danger">
            Link inválido — abra o link recebido por e-mail.{" "}
            <Link href="/forgot-password" className="underline">
              Pedir outro
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field
              label="Nova senha"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="Confirme a nova senha"
              type="password"
              value={confirm}
              onChange={setConfirm}
            />

            {error && (
              <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Salvando..." : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
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
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
        required
        minLength={8}
      />
    </label>
  );
}
