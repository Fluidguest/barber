"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { login, ApiError, API_BASE } from "@/lib/api";
import { LogoStacked } from "@/components/layout/Logo";

type Company = { slug: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [needs2fa, setNeeds2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Lista de barbearias para o seletor. Enquanto carrega, mostramos o campo de
  // digitação como fallback — se a API não responder, ainda dá para logar.
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/auth/companies/public`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Company[]) => {
        if (!alive) return;
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        /* fallback para digitação */
      })
      .finally(() => alive && setCompaniesLoaded(true));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(slug, email, password, code);
      router.replace("/home");
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

  // Só usamos o seletor quando a lista carregou e veio com pelo menos uma
  // barbearia; caso contrário, mantém a digitação do slug.
  const useSelect = companiesLoaded && companies.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-2xl"
      >
        <div className="mb-6 flex flex-col items-center">
          <LogoStacked />
          <p className="mt-3 text-sm text-muted-foreground">Acesse sua barbearia</p>
        </div>

        {useSelect ? (
          <label className="mb-4 block">
            <span className="mb-1.5 block text-sm text-muted-foreground">Barbearia</span>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 outline-none focus:border-primary"
              required
            >
              <option value="" disabled>
                Selecione a barbearia
              </option>
              {companies.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <Field label="Barbearia" value={slug} onChange={setSlug} />
        )}

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
          className="btn-gold w-full rounded-lg py-2.5 font-semibold disabled:cursor-not-allowed"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <p className="mt-4 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:underline">
            Esqueci minha senha
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-muted-foreground">
          Não tem conta?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Cadastre sua barbearia
          </Link>
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
