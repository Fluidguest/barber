"use client";

import { useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email }),
      });
    } catch {
      // ignora: a resposta é sempre a mesma, para não revelar se a conta existe
    } finally {
      // Mensagem idêntica em qualquer caso (anti-enumeração de contas).
      setSent(true);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Esqueci minha senha</div>
          <p className="mt-1 text-sm text-muted-foreground">
            Enviaremos um link de redefinição para o seu e-mail.
          </p>
        </div>

        {sent ? (
          <>
            <div className="mb-4 rounded-lg border border-primary/40 bg-primary/10 px-3 py-3 text-sm">
              Se existir uma conta com esses dados, o link de redefinição foi
              enviado. Verifique seu e-mail.
            </div>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-primary py-2.5 text-center font-medium text-primary-fg transition hover:opacity-90"
            >
              Voltar ao login
            </Link>
          </>
        ) : (
          <form onSubmit={submit}>
            <Field label="Barbearia (slug)" value={slug} onChange={setSlug} />
            <Field
              label="E-mail"
              type="email"
              value={email}
              onChange={setEmail}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-fg transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link href="/login" className="hover:underline">
                Voltar ao login
              </Link>
            </p>
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
      />
    </label>
  );
}
