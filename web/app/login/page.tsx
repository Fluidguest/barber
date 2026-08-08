"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, ApiError, API_BASE } from "@/lib/api";
import { LogoStacked } from "@/components/layout/Logo";

type Company = { slug: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Etapa 2: barbearias onde a credencial confere. null = ainda na etapa 1.
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [chosenSlug, setChosenSlug] = useState("");

  // Autentica de fato numa barbearia (etapa final). Reaproveita o login por slug,
  // incluindo o fluxo de 2FA.
  async function doLogin(slug: string, twofaCode = code) {
    setChosenSlug(slug);
    setError("");
    setLoading(true);
    try {
      await login(slug, email, password, twofaCode);
      router.replace("/home");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Falha ao entrar";
      if (/2fa|autentica/i.test(msg)) {
        setNeeds2fa(true);
        setError(needs2fa ? "Código 2FA inválido" : "Informe o código do seu app autenticador");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  // Etapa 1: e-mail + senha -> descobre as barbearias da credencial.
  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const list: Company[] = res.ok ? await res.json() : [];
      if (!Array.isArray(list) || list.length === 0) {
        setError("E-mail ou senha inválidos");
        setLoading(false);
        return;
      }
      if (list.length === 1) {
        await doLogin(list[0].slug); // uma só barbearia: entra direto
        return;
      }
      setCompanies(list); // várias: mostra o seletor
      setLoading(false);
    } catch {
      setError("Falha ao entrar. Tente novamente.");
      setLoading(false);
    }
  }

  function voltar() {
    setCompanies(null);
    setNeeds2fa(false);
    setCode("");
    setError("");
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center">
          <LogoStacked />
          <p className="mt-3 text-sm text-muted-foreground">Acesse sua barbearia</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {needs2fa ? (
          // Etapa 2FA para a barbearia já escolhida.
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void doLogin(chosenSlug);
            }}
          >
            <Field
              label="Código 2FA (app autenticador)"
              value={code}
              onChange={setCode}
            />
            <button type="submit" disabled={loading} className="btn-gold w-full rounded-lg py-2.5 font-semibold disabled:cursor-not-allowed">
              {loading ? "Entrando..." : "Confirmar"}
            </button>
            <BackLink onClick={voltar} />
          </form>
        ) : companies ? (
          // Seletor de barbearia (a credencial vale para mais de uma).
          <div>
            <p className="mb-3 text-sm text-muted-foreground">
              Você tem acesso a mais de uma barbearia. Escolha em qual entrar:
            </p>
            <div className="space-y-2">
              {companies.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  disabled={loading}
                  onClick={() => void doLogin(c.slug)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-4 py-3 text-left font-medium transition hover:border-primary disabled:opacity-50"
                >
                  {c.name}
                </button>
              ))}
            </div>
            <BackLink onClick={voltar} />
          </div>
        ) : (
          // Etapa 1: credenciais (sem barbearia).
          <form onSubmit={submitCreds}>
            <Field label="E-mail" type="email" value={email} onChange={setEmail} />
            <Field label="Senha" type="password" value={password} onChange={setPassword} />

            <button type="submit" disabled={loading} className="btn-gold w-full rounded-lg py-2.5 font-semibold disabled:cursor-not-allowed">
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <p className="mt-4 text-center text-sm">
              <Link href="/forgot-password" className="text-muted-foreground hover:underline">
                Esqueci minha senha
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <p className="mt-4 text-center text-sm">
      <button type="button" onClick={onClick} className="text-muted-foreground hover:underline">
        Voltar
      </button>
    </p>
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
      />
    </label>
  );
}
