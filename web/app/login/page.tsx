"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("demo");
  const [email, setEmail] = useState("admin@demo.com");
  const [password, setPassword] = useState("demo1234");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(slug, email, password, code);
      router.replace("/dashboard");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Falha ao entrar";
      // Quando o backend pede o 2FA, revela o campo de código.
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

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl"
      >
        <div className="mb-6">
          <div className="text-2xl font-semibold">Barber SaaS</div>
          <p className="mt-1 text-sm text-muted">Acesse sua barbearia</p>
        </div>

        <Field label="Barbearia (slug)" value={slug} onChange={setSlug} />
        <Field label="E-mail" type="email" value={email} onChange={setEmail} />
        <Field
          label="Senha"
          type="password"
          value={password}
          onChange={setPassword}
        />

        {needs2fa && (
          <Field
            label="Código 2FA (app autenticador)"
            value={code}
            onChange={setCode}
          />
        )}

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
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-muted hover:underline">
            Esqueci minha senha
          </Link>
        </p>

        <p className="mt-3 text-center text-xs text-muted">
          Demo: demo / admin@demo.com / demo1234
        </p>
      </form>
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
      <span className="mb-1.5 block text-sm text-muted">{label}</span>
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
